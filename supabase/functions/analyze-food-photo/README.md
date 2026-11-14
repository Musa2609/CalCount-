# `analyze-food-photo` Edge Function

Turns a meal photo into reviewable food items:

```
Expo app ──JWT──▶ analyze-food-photo ──▶ OpenAI Responses API (vision)
                                └─────▶ USDA FoodData Central (nutrition)
```

Both API keys live only in Edge Function secrets. The app authenticates with
the user's Supabase access token and never sees either key.

## Deploy

Run from the repository root (`CalCount/`), with the project already linked
(`supabase/.temp/project-ref`).

```bash
# 1. Authenticate the CLI (once per machine)
npx supabase login

# 2. Link the project (skip if supabase/.temp/project-ref already matches)
npx supabase link --project-ref dmtoxuyjgrtlkkloewcu

# 3. Set the secrets (never commit these)
npx supabase secrets set OPENAI_API_KEY=sk-... USDA_API_KEY=...
# optional, defaults to gpt-4.1-mini
npx supabase secrets set OPENAI_VISION_MODEL=gpt-4.1-mini

# 4. Deploy. JWT verification stays ON: do not pass --no-verify-jwt.
npx supabase functions deploy analyze-food-photo --use-api
```

`--use-api` bundles server-side and skips Docker. Drop it if you prefer the
local bundler.

Verify the secrets landed (values are hidden):

```bash
npx supabase secrets list
```

## Secrets

| Name                  | Required | Purpose                                        |
| --------------------- | -------- | ---------------------------------------------- |
| `OPENAI_API_KEY`      | yes      | Responses API vision call                      |
| `USDA_API_KEY`        | yes      | FoodData Central search + nutrient panel       |
| `OPENAI_VISION_MODEL` | no       | Defaults to `gpt-4.1-mini` (must accept images) |

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are injected by the platform.

Rotating a key is `npx supabase secrets set OPENAI_API_KEY=...` followed by a
re-deploy of nothing — secrets take effect on the next invocation.

## Request

```http
POST /functions/v1/analyze-food-photo
Authorization: Bearer <supabase access token>
Content-Type: application/json

{ "image": "<base64>", "mimeType": "image/jpeg" }
```

* `image` — base64, optionally a `data:` URL. Bytes are sniffed, not trusted.
* Accepted formats: JPEG, PNG, WebP. Max decoded size 6 MB, max body 9 MB.

## Response

```json
{
  "items": [
    {
      "name": "Grilled chicken breast",
      "grams": 150,
      "caloriesPer100g": 165,
      "proteinPer100g": 31,
      "carbsPer100g": 0,
      "fatPer100g": 3.6,
      "fiberPer100g": 0,
      "confidence": 0.86,
      "category": "poultry",
      "ingredients": ["chicken breast"],
      "nutritionSource": "usda",
      "matchedFoodName": "Chicken, broilers or fryers, breast, meat only, cooked, grilled",
      "fdcId": 171477,
      "notes": ""
    }
  ],
  "warnings": ["\"Sauce\" is an AI estimate — no confident USDA FoodData Central match was found."],
  "model": "gpt-4.1-mini",
  "generatedAt": "2026-11-14T10:00:00.000Z"
}
```

The seven original fields (`name`, `grams`, the four per-100 g macros,
`confidence`) are unchanged, so `parseVisionResponse` in `src/lib/vision.ts`
still validates an older endpoint. Everything else is additive.

`nutritionSource` is the honesty flag:

* `usda` — values come from a FoodData Central record (`matchedFoodName`,
  `fdcId` included). A match requires ≥ 60% of the query's meaningful words in
  the USDA description **and** a complete nutrient panel. Otherwise it is a miss.
* `ai_estimate` — values are the model's estimate; the app labels them and
  adds a warning.

An empty `items` array is a valid response (no food in the photo) and maps to
the app's empty state, not an error.

## Errors

| Status | Code                       | Meaning                                  |
| ------ | -------------------------- | ---------------------------------------- |
| 400    | `invalid_request`          | Not JSON / missing `image` / bad base64  |
| 401    | `unauthorized`             | Missing, invalid or expired JWT          |
| 413    | `payload_too_large`        | Body or decoded image over the cap       |
| 415    | `unsupported_image`        | Not JPEG/PNG/WebP (e.g. HEIC)            |
| 422    | `invalid_image`            | Vision API rejected the image            |
| 429    | `rate_limited`             | Per-user quota (8 per 5 min)             |
| 503    | `vision_not_configured`    | `OPENAI_API_KEY` missing                 |
| 503    | `vision_quota_exhausted`   | OpenAI account has no credit (429)       |
| 502    | `vision_model_missing`     | OpenAI does not know this model (404)    |
| 503    | `busy`                     | Instance concurrency cap (6)             |
| 504    | `vision_timeout`           | OpenAI exceeded 45 s                     |
| 502    | `vision_failed`            | OpenAI error or unreachable              |

Responses include `Retry-After` where it applies.

## Diagnosing a failing analysis

Every request logs one JSON line with `fn`, `status`, `code`, `userId`, `ms`
and — for upstream failures — an `upstream` diagnostic such as
`429/insufficient_quota`. No key, image or prompt is ever logged.

```bash
npx supabase logs --remote --service functions --since 1h \
  --search analyze-food-photo --output-format json
```

Codes worth knowing:

* `vision_quota_exhausted` — OpenAI accepted the authenticated request and
  refused it for billing reasons. Retrying will not help; the OpenAI account
  needs credit or a higher budget cap.
* `vision_busy` — a genuine rate limit. OpenAI's `Retry-After` is passed through.
* `vision_model_missing` — `OPENAI_VISION_MODEL` names a model the key cannot use.
* `vision_auth_failed` — the OpenAI key itself was rejected (401/403).

To see OpenAI's own words for a 429 (run locally, your key is never shared):

```bash
curl -s https://api.openai.com/v1/responses \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4.1-mini","input":"hi","max_output_tokens":16}'
```

`"type":"insufficient_quota"` in that output means the account is unfunded —
which is what a 429 with `vision_quota_exhausted` in the logs indicates.

## Verification

```bash
# Unit + pipeline tests (Node, stubbed upstreams)
node --test supabase/functions/analyze-food-photo/test/analyze.test.ts

# From the app: typecheck, lint, QA, dependency doctor
npx tsc --noEmit && npx expo lint && npm run test:qa && npx expo-doctor
```

These tests prove the pipeline, validation and error mapping. They do **not**
prove the deployed function works — that needs a real deployment with real keys.

### Smoke test against the deployed function

```bash
TOKEN="<user access token>"
PROJECT="https://dmtoxuyjgrtlkkloewcu.supabase.co"
curl -sS -X POST "$PROJECT/functions/v1/analyze-food-photo" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @<(printf '{"image":"%s","mimeType":"image/jpeg"}' "$(base64 -w0 meal.jpg)") \
  | head -c 2000
```

(`base64 -w0` is GNU; on macOS use `base64 -i meal.jpg` with no `-w0`.)

## Limits and known gaps

* **Rate limiting is per warm instance, in memory.** It caps abuse per
  instance and protects the OpenAI budget, but N instances allow N× the quota.
  Supabase applies its own project-level limits on top. For a hard global cap,
  move the counters into Postgres.
* **USDA matching is lexical**, not semantic. Words that differ from USDA
  descriptions ("aubergine" vs "eggplant") fall back to an AI estimate rather
  than a wrong match.
* **No caching.** The same photo re-analysed costs another OpenAI call.
* **No image storage.** Photos are processed in memory and never written
  anywhere; nothing about the image is logged.
* Branded USDA records are excluded on purpose — Foundation, SR Legacy and
  FNDDS only — so a match is a generic food, not a specific product.

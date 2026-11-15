# `analyze-food-photo` Edge Function

Turns a meal photo into reviewable food items:

```
Expo app ──JWT──▶ analyze-food-photo ──▶ Google Gemini API (vision)
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
npx supabase secrets set GEMINI_API_KEY=... USDA_API_KEY=...
# optional, defaults to gemini-2.5-flash-lite
npx supabase secrets set GEMINI_VISION_MODEL=gemini-2.5-flash-lite

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
| `GEMINI_API_KEY`      | yes      | Gemini Developer API vision call               |
| `USDA_API_KEY`        | yes      | FoodData Central search + nutrient panel       |
| `GEMINI_VISION_MODEL` | no       | Defaults to `gemini-2.5-flash-lite`            |

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are injected by the platform.

## Gemini configuration

The function calls Google's Gemini Developer API with the validated image:

* **Endpoint** — `POST https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent`, with the key in the `x-goog-api-key` request header (Google's documented auth). The key is never put in the URL, so a logged URL cannot leak it.
* **Model** — `gemini-2.5-flash-lite` by default; override with `GEMINI_VISION_MODEL`.
* **Image** — the base64 bytes that already passed validation, sent as
  `contents[0].parts[].inlineData = { mimeType, data }` together with the food
  analysis prompt.
* **Output** — `generationConfig.responseMimeType = "application/json"`, so the
  reply is the `{ "items": [...] }` JSON the pipeline expects. Fences and
  surrounding prose are still tolerated, and unreadable output becomes a `502`.

There is **no OpenAI fallback**. If the Gemini key is missing, rejected, out of
quota or unreachable, the request fails with one of the codes below and no
other paid provider is called.

Rotating a key is `npx supabase secrets set GEMINI_API_KEY=...` followed by a
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
  "model": "gemini-2.5-flash-lite",
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
| 503    | `vision_not_configured`    | `GEMINI_API_KEY` missing                 |
| 503    | `vision_quota_exhausted`   | Gemini usage limit/billing cap reached (429) |
| 502    | `vision_model_missing`     | Gemini does not know this model (404)    |
| 503    | `busy`                     | Instance concurrency cap (6)             |
| 504    | `vision_timeout`           | Gemini exceeded 45 s                     |
| 502    | `vision_failed`            | Gemini error or unreachable              |

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

* `vision_quota_exhausted` — Gemini named a spent allowance: a structured
  `QuotaFailure` id such as `…PerDay…`, or wording that mentions billing/quota.
  It does not necessarily mean the account is unfunded — a free-tier daily cap
  produces it too — so the client message says "usage limit". Retrying soon
  will not help.
* `vision_busy` — a temporary per-minute limit. Gemini's `Retry-After`, then
  its `RetryInfo.retryDelay`, is passed through to the app.
* `vision_model_missing` — `GEMINI_VISION_MODEL` names a model the key cannot use.
* `vision_auth_failed` — the Gemini key itself was rejected (401/403/400).

To see Gemini's own words for a 429 (run locally, your key is never shared):

```bash
curl -s "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"hi"}]}]}'
```

A `429 RESOURCE_EXHAUSTED` is not automatically "out of credit". The function
reads `error.details` before deciding:

| Signal | Result |
| ------ | ------ |
| `QuotaFailure` violation whose `quotaId`/`quotaMetric` is per-minute or per-second (`…PerMinute…`, `…InputTokensPerModelPerMinute…`) | `vision_busy` — a real rate limit, retrying helps |
| `QuotaFailure` violation whose `quotaId` is per-day (`…PerDayPerProject…`) | `vision_quota_exhausted` — the allowance is spent |
| Both per-minute and per-day violations | `vision_quota_exhausted` — the daily one is binding |
| `RetryInfo.retryDelay` only (no `QuotaFailure`, no billing wording) | `vision_busy` — the delay is passed through, however long |
| Message says "you exceeded your current quota… billing" | `vision_quota_exhausted` |
| Anything else | `vision_busy` |

A long `retryDelay` is only a hint about timing, so it never becomes
`vision_quota_exhausted` on its own. A `Retry-After` header outranks
`RetryInfo`; either outranks the 15 s default. The quota id also lands in the log line's `upstream` field (for
example `429/RESOURCE_EXHAUSTED/GenerateRequestsPerDayPerProjectPerModel-FreeTier`).

## Verification

```bash
# Unit + pipeline tests (Node, stubbed upstreams)
npm run test:vision

# Edge Function typecheck (Deno types, not the app tsconfig)
npx deno check supabase/functions/analyze-food-photo/index.ts

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
  instance and protects the Gemini budget, but N instances allow N× the quota.
  Supabase applies its own project-level limits on top. For a hard global cap,
  move the counters into Postgres.
* **USDA matching is lexical**, not semantic. Words that differ from USDA
  descriptions ("aubergine" vs "eggplant") fall back to an AI estimate rather
  than a wrong match.
* **No caching.** The same photo re-analysed costs another Gemini call.
* **No image storage.** Photos are processed in memory and never written
  anywhere; nothing about the image is logged.
* Branded USDA records are excluded on purpose — Foundation, SR Legacy and
  FNDDS only — so a match is a generic food, not a specific product.

import { HttpError } from './errors.ts';
import { MAX_ITEMS_PER_PHOTO, identifyFoods, DEFAULT_VISION_MODEL } from './gemini.ts';
import { buildAnalyzedItems, sanitizeAiItems, type AnalyzedItem } from './nutrition.ts';
import { findUsdaMatch, type UsdaLookup } from './usda.ts';
import type { FetchLike } from './types.ts';

/**
 * Orchestration: identify -> validate -> match -> merge.
 *
 * Kept free of Deno APIs (fetch is injected) so the whole pipeline can be
 * exercised with stubbed upstreams in the test suite.
 */
export interface AnalyzeOptions {
  // Preferred new name.
  geminiKey?: string;
  // Backwards-compatible aliases (old OpenAI name and a generic one).
  openAiKey?: string;
  apiKey?: string;
  usdaKey: string;
  model?: string;
  geminiModel?: string;
  openAiModel?: string;
  fetchImpl?: FetchLike;
  geminiTimeoutMs?: number;
  openAiTimeoutMs?: number;
  timeoutMs?: number;
  geminiEndpoint?: string;
  openAiEndpoint?: string;
  endpoint?: string;
  geminiBaseUrl?: string;
  usdaTimeoutMs?: number;
  usdaBaseUrl?: string;
  now?: () => number;
}

export interface AnalyzeResult {
  items: AnalyzedItem[];
  warnings: string[];
  model: string;
  generatedAt: string;
}

function resolveVisionKey(options: AnalyzeOptions): string {
  return (options.geminiKey ?? options.openAiKey ?? options.apiKey ?? '').trim();
}

export async function analyzeFoodPhoto(
  image: { base64: string; mimeType: string },
  options: AnalyzeOptions,
): Promise<AnalyzeResult> {
  const visionKey = resolveVisionKey(options);
  if (!visionKey) {
    throw new HttpError(
      503,
      'vision_not_configured',
      'Photo recognition is not configured on the server yet.',
    );
  }

  const fetchImpl = (options.fetchImpl ?? fetch) as FetchLike;
  const now = options.now ?? (() => Date.now());

  const model =
    options.model ??
    options.geminiModel ??
    options.openAiModel ??
    DEFAULT_VISION_MODEL;

  const identification = await identifyFoods({
    base64: image.base64,
    mimeType: image.mimeType,
    apiKey: visionKey,
    model,
    fetchImpl,
    timeoutMs: options.geminiTimeoutMs ?? options.openAiTimeoutMs ?? options.timeoutMs,
    endpoint: options.geminiEndpoint ?? options.openAiEndpoint ?? options.endpoint,
    baseUrl: options.geminiBaseUrl,
  });

  const { items: aiItems, dropped } = sanitizeAiItems(
    identification.items.slice(0, MAX_ITEMS_PER_PHOTO),
  );

  const warnings: string[] = [];
  if (dropped > 0) {
    warnings.push(
      dropped === 1
        ? 'One detected item was discarded because its nutrition values were not usable.'
        : `${dropped} detected items were discarded because their nutrition values were not usable.`,
    );
  }

  if (aiItems.length === 0) {
    return {
      items: [],
      warnings: warnings.length ? warnings : ['No food was recognised in that photo.'],
      model: identification.model,
      generatedAt: new Date(now()).toISOString(),
    };
  }

  const lookups: UsdaLookup[] = await Promise.all(
    aiItems.map((item) => {
      if (!options.usdaKey) return Promise.resolve<UsdaLookup>({ status: 'unavailable' });
      return findUsdaMatch({
        name: item.name,
        apiKey: options.usdaKey,
        fetchImpl,
        timeoutMs: options.usdaTimeoutMs,
        baseUrl: options.usdaBaseUrl,
      });
    }),
  );

  const merged = buildAnalyzedItems(aiItems, lookups, {
    usdaConfigured: Boolean(options.usdaKey),
  });

  return {
    items: merged.items,
    warnings: [...warnings, ...merged.warnings],
    model: identification.model,
    generatedAt: new Date(now()).toISOString(),
  };
}

import { HttpError } from './errors.ts';
import { MAX_ITEMS_PER_PHOTO, identifyFoods } from './openai.ts';
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
  openAiKey: string;
  usdaKey: string;
  model?: string;
  fetchImpl?: FetchLike;
  openAiTimeoutMs?: number;
  usdaTimeoutMs?: number;
  openAiEndpoint?: string;
  usdaBaseUrl?: string;
  now?: () => number;
}

export interface AnalyzeResult {
  items: AnalyzedItem[];
  warnings: string[];
  model: string;
  generatedAt: string;
}

export async function analyzeFoodPhoto(
  image: { base64: string; mimeType: string },
  options: AnalyzeOptions,
): Promise<AnalyzeResult> {
  if (!options.openAiKey) {
    throw new HttpError(
      503,
      'vision_not_configured',
      'Photo recognition is not configured on the server yet.',
    );
  }

  const fetchImpl = (options.fetchImpl ?? fetch) as FetchLike;
  const now = options.now ?? (() => Date.now());

  const identification = await identifyFoods({
    base64: image.base64,
    mimeType: image.mimeType,
    apiKey: options.openAiKey,
    model: options.model ?? 'gpt-4.1-mini',
    fetchImpl,
    timeoutMs: options.openAiTimeoutMs,
    endpoint: options.openAiEndpoint,
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

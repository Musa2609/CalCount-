import { useEffect, useState } from 'react';

import { useApp } from '@/context/AppContext';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { appEnv } from '@/lib/env';
import { cacheFoods } from '@/lib/foodCache';
import { searchOpenFoodFacts } from '@/lib/openfoodfacts';
import { searchUsda } from '@/lib/usda';
import { errorMessage } from '@/lib/utils';
import type { Food } from '@/types/models';

export interface FoodSearchFilters {
  query: string;
  category: string | null;
  indianOnly: boolean;
}

interface KeptError {
  key: string;
  message: string;
}

/**
 * Search runs in two independent lanes:
 *  1. CalCount's local catalogue (instantly available, works offline)
 *  2. Open Food Facts packaged products (network, clearly labelled)
 * A failure in one lane never hides the other.
 */
export function useFoodSearch({ query, category, indianOnly }: FoodSearchFilters) {
  const { backend, session } = useApp();
  const userId = session?.userId ?? null;
  const debouncedQuery = useDebouncedValue(query, 200);

  const [localFoods, setLocalFoods] = useState<Food[]>([]);
  const [localSettledKey, setLocalSettledKey] = useState<string | null>(null);
  const [foodsError, setFoodsError] = useState<KeptError | null>(null);

  const [remoteFoods, setRemoteFoods] = useState<Food[]>([]);
  const [remoteSettledKey, setRemoteSettledKey] = useState<string | null>(null);
  const [remoteError, setRemoteError] = useState<KeptError | null>(null);
  const [usdaFoods, setUsdaFoods] = useState<Food[]>([]);
  const [usdaSettledKey, setUsdaSettledKey] = useState<string | null>(null);

  const localKey = [userId ?? '', debouncedQuery, category ?? '', indianOnly ? '1' : '0'].join('|');
  const term = debouncedQuery.trim();
  const shouldSearch =
    appEnv.openFoodFactsEnabled && !indianOnly && category === null && term.length >= 2;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    backend
      .searchFoods(userId, {
        query: debouncedQuery,
        category,
        indianOnly,
        limit: 60,
      })
      .then((foods) => {
        if (cancelled) return;
        cacheFoods(foods);
        setLocalFoods(foods);
        setFoodsError(null);
      })
      .catch((error) => {
        if (!cancelled) {
          setFoodsError({ key: localKey, message: errorMessage(error, 'Could not search foods.') });
        }
      })
      .finally(() => {
        if (!cancelled) setLocalSettledKey(localKey);
      });
    return () => {
      cancelled = true;
    };
  }, [backend, userId, debouncedQuery, category, indianOnly, localKey]);

  useEffect(() => {
    if (!shouldSearch) return;
    let cancelled = false;
    searchOpenFoodFacts(term)
      .then((outcome) => {
        if (cancelled) return;
        cacheFoods(outcome.foods);
        setRemoteFoods(outcome.foods);
        setRemoteError(outcome.error ? { key: term, message: outcome.error } : null);
      })
      .catch((cause) => {
        if (!cancelled) {
          setRemoteError({
            key: term,
            message: errorMessage(cause, 'Open Food Facts is unavailable right now.'),
          });
        }
      })
      .finally(() => {
        if (!cancelled) setRemoteSettledKey(term);
      });
    return () => {
      cancelled = true;
    };
  }, [shouldSearch, term]);

  // USDA FoodData Central search (third lane)
  useEffect(() => {
    if (term.length < 2) return;
    let cancelled = false;
    searchUsda(term)
      .then((outcome) => {
        if (cancelled) return;
        setUsdaFoods(outcome.foods);
      })
      .catch(() => {
        if (!cancelled) setUsdaFoods([]);
      })
      .finally(() => {
        if (!cancelled) setUsdaSettledKey(term);
      });
    return () => {
      cancelled = true;
    };
  }, [term]);

  // Merge remote + USDA results, deduplicating by name
  const mergedRemote = [...remoteFoods];
  const seenNames = new Set(remoteFoods.map((f) => f.name.toLowerCase()));
  for (const food of usdaFoods) {
    if (!seenNames.has(food.name.toLowerCase())) {
      mergedRemote.push(food);
      seenNames.add(food.name.toLowerCase());
    }
  }

  return {
    localFoods,
    remoteFoods: shouldSearch || term.length >= 2 ? mergedRemote : [],
    loading: Boolean(userId) && localSettledKey !== localKey,
    searching: query !== debouncedQuery,
    error: foodsError && foodsError.key === localKey ? foodsError.message : null,
    remoteLoading: (shouldSearch && remoteSettledKey !== term) || (term.length >= 2 && usdaSettledKey !== term),
    remoteError: shouldSearch && remoteError?.key === term ? remoteError.message : null,
    packagedSearchEnabled: appEnv.openFoodFactsEnabled,
  };
}

import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Camera, ImagePlus, Search, Sparkles, Trash as TrashIcon } from 'lucide-react-native';

import { AppHeader } from '@/components/AppHeader';
import { Notice } from '@/components/Notice';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { MEAL_LABELS } from '@/constants/nutrition';
import { colors, radii, spacing } from '@/constants/theme';
import { useToast } from '@/context/ToastContext';
import { useLogFood } from '@/hooks/useLogFood';
import { useSubmit } from '@/hooks/useSubmit';
import { formatFriendlyDate, todayKey } from '@/lib/dates';
import { nutrientsForQuantity } from '@/lib/nutrition';
import { errorMessage, formatCalories, makeId } from '@/lib/utils';
import { parseNumericInput } from '@/lib/validation';
import {
  recogniseFoodPhoto,
  visionEnabled,
  VisionEmptyError,
  type VisionItem,
} from '@/lib/vision';
import { MEAL_TYPES, type Food, type MealType } from '@/types/models';

interface SelectedImage {
  uri: string;
  base64: string;
  mimeType: string;
}

function foodFromVisionItem(item: VisionItem, grams: number): Food {
  const id = makeId('vision');
  return {
    id,
    userId: null,
    name: item.name,
    brand: null,
    category: 'Photo log',
    description: 'Estimated from a photo and reviewed by you before logging.',
    servingName: `${Math.round(grams)} g portion`,
    servingGrams: grams,
    caloriesPer100g: item.caloriesPer100g,
    proteinPer100g: item.proteinPer100g,
    carbsPer100g: item.carbsPer100g,
    fatPer100g: item.fatPer100g,
    fiberPer100g: item.fiberPer100g,
    sugarPer100g: null,
    sodiumPer100g: null,
    source:
      item.nutritionSource === 'usda'
        ? `USDA FoodData Central: ${item.matchedFoodName ?? item.name}`
        : 'AI photo estimate (reviewed by you)',
    sourceUrl: null,
    dataQuality: item.nutritionSource === 'usda' ? 'sourced' : 'estimated',
    cuisine: null,
    barcode: null,
    imageUrl: null,
    isPublic: false,
    servings: [
      {
        id: `${id.slice(0, 24)}000000000001`,
        foodId: id,
        label: `${Math.round(grams)} g portion`,
        grams,
        isDefault: true,
        sortOrder: 1,
      },
    ],
    createdAt: new Date().toISOString(),
  };
}

export default function ScanScreen() {
  const params = useLocalSearchParams<{ meal?: string; date?: string }>();
  const router = useRouter();
  const { showToast } = useToast();
  const { logFoods } = useLogFood();
  const { submit, busy } = useSubmit();

  // Photo logging must respect the diary day the user came from.
  const date = typeof params.date === 'string' && params.date ? params.date : todayKey();
  const initialMeal = MEAL_TYPES.find((meal) => meal === params.meal) ?? 'lunch';

  const [image, setImage] = useState<SelectedImage | null>(null);
  const [items, setItems] = useState<VisionItem[]>([]);
  const [grams, setGrams] = useState<string[]>([]);
  const [mealType, setMealType] = useState<MealType>(initialMeal);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emptyResult, setEmptyResult] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);

  /**
   * Picking and taking photos works with or without a vision service: the user
   * can always see what they selected, and nothing is ever inferred locally.
   */
  const applyAsset = (asset: ImagePicker.ImagePickerAsset) => {
    if (!asset.base64) {
      setError('That photo could not be read. Try another one.');
      return;
    }
    setImage({
      uri: asset.uri,
      base64: asset.base64,
      mimeType: asset.mimeType ?? 'image/jpeg',
    });
    setItems([]);
    setGrams([]);
    setEmptyResult(false);
    setWarnings([]);
  };

  const takePhoto = async () => {
    setError(null);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setError(
          permission.canAskAgain
            ? 'Camera access is needed to take a meal photo.'
            : 'Camera access is blocked. Enable it in your device settings to take a photo.',
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.6,
        base64: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (asset) applyAsset(asset);
    } catch (cause) {
      setError(errorMessage(cause, 'Could not open the camera.'));
    }
  };

  const pickImage = async () => {
    setError(null);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError(
          permission.canAskAgain
            ? 'Photo access is needed to pick a meal photo.'
            : 'Photo access is blocked. Enable it in your device settings to choose a photo.',
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.6,
        base64: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (asset) applyAsset(asset);
    } catch (cause) {
      setError(errorMessage(cause, 'Could not open your photo library.'));
    }
  };

  const analyse = async () => {
    if (!image || !visionEnabled) return;
    setAnalyzing(true);
    setError(null);
    setEmptyResult(false);
    setWarnings([]);
    try {
      const result = await recogniseFoodPhoto({
        base64: image.base64,
        mimeType: image.mimeType,
      });
      setItems(result.items);
      setGrams(result.items.map((item) => String(Math.round(item.grams))));
      setWarnings(result.warnings);
    } catch (cause) {
      setItems([]);
      setGrams([]);
      setWarnings([]);
      if (cause instanceof VisionEmptyError) {
        setEmptyResult(true);
      } else {
        setError(errorMessage(cause, 'Could not analyse that photo.'));
      }
    } finally {
      setAnalyzing(false);
    }
  };

  const totalCalories = items.reduce((total, item, index) => {
    const quantity = parseNumericInput(grams[index] ?? '') ?? 0;
    return total + nutrientsForQuantity(item, quantity).calories;
  }, 0);

  const confirm = () => {
    if (!items.length) return;
    void submit(async () => {
      try {
        await logFoods(
          items.map((item, index) => {
            const quantity = Math.max(1, parseNumericInput(grams[index] ?? '') ?? item.grams);
            return {
              food: foodFromVisionItem(item, quantity),
              quantityGrams: quantity,
              mealType,
              logDate: date,
              servingLabel: `${Math.round(quantity)} g portion`,
              servingGrams: quantity,
            };
          }),
        );
        showToast(
          `Added ${items.length} ${items.length === 1 ? 'item' : 'items'} to ${MEAL_LABELS[mealType]}`,
        );
        router.back();
      } catch (cause) {
        setError(errorMessage(cause, 'Could not log these items.'));
      }
    });
  };

  const canRetry = Boolean(image) && visionEnabled && !analyzing;

  return (
    <Screen scroll contentStyle={styles.content} bottomInset={spacing.huge}>
      <AppHeader
        title="Log from a photo"
        subtitle="Review every estimate before it reaches your diary."
        showBack
      />

      {!visionEnabled ? (
        <Notice
          tone="warning"
          title="Photo recognition is not connected"
          message="You can still take or choose a photo, but this build has no service that can read it, and CalCount never guesses nutrition on its own. Set EXPO_PUBLIC_VISION_API_URL (and optionally EXPO_PUBLIC_VISION_API_KEY) to enable recognition."
        />
      ) : null}

      <Card style={styles.card}>
        {image ? (
          <View style={styles.previewWrap}>
            <Image
              source={{ uri: image.uri }}
              style={styles.preview}
              contentFit="cover"
              accessibilityLabel="Selected meal photo"
            />
            <View style={styles.previewActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Retake photo"
                onPress={takePhoto}
                style={({ pressed }) => [styles.previewAction, pressed ? styles.pressed : null]}
              >
                <Camera size={15} color={colors.white} strokeWidth={2.2} />
                <AppText variant="caption" color="white">
                  RETAKE
                </AppText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Choose a different photo"
                onPress={pickImage}
                style={({ pressed }) => [styles.previewAction, pressed ? styles.pressed : null]}
              >
                <ImagePlus size={15} color={colors.white} strokeWidth={2.2} />
                <AppText variant="caption" color="white">
                  CHANGE
                </AppText>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.pickerRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Take a photo"
              onPress={takePhoto}
              style={({ pressed }) => [styles.picker, pressed ? styles.pressed : null]}
            >
              <Camera size={26} color={colors.primary} strokeWidth={2} />
              <AppText variant="bodyMedium">Take a photo</AppText>
              <AppText variant="small" color="muted" align="center">
                Use your camera to capture a meal.
              </AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Choose from gallery"
              onPress={pickImage}
              style={({ pressed }) => [styles.picker, pressed ? styles.pressed : null]}
            >
              <ImagePlus size={26} color={colors.primary} strokeWidth={2} />
              <AppText variant="bodyMedium">Choose from gallery</AppText>
              <AppText variant="small" color="muted" align="center">
                Pick a meal photo you already have.
              </AppText>
            </Pressable>
          </View>
        )}

        {visionEnabled ? (
          <Button
            label={analyzing ? 'Analysing photo…' : items.length ? 'Analyse again' : 'Analyse photo'}
            icon={Sparkles}
            onPress={analyse}
            loading={analyzing}
            disabled={!image}
            fullWidth
          />
        ) : (
          <Button
            label="Recognition not connected"
            icon={Sparkles}
            disabled
            fullWidth
            accessibilityLabel="Photo recognition is not connected"
          />
        )}

        {error ? <Notice tone="danger" message={error} /> : null}

        {emptyResult ? (
          <Notice
            tone="info"
            title="No food recognised"
            message="The vision service found nothing it could identify. Try a closer, well-lit photo with the whole plate in frame."
          />
        ) : null}

        {canRetry && (error || emptyResult) ? (
          <Button label="Try again" variant="secondary" onPress={analyse} fullWidth />
        ) : null}
      </Card>

      {warnings.length && items.length ? (
        <Notice tone="warning" title="Check these before you log">
          {warnings.map((warning) => (
            <AppText key={warning} variant="caption" color="secondary">
              {`• ${warning}`}
            </AppText>
          ))}
        </Notice>
      ) : null}

      {items.length ? (
        <Card style={styles.card}>
          <View style={styles.reviewHeader}>
            <AppText variant="h3">Review estimates</AppText>
            <AppText variant="smallMedium" color="primary">
              {`${formatCalories(totalCalories)} kcal`}
            </AppText>
          </View>
          <AppText variant="small" color="muted">
            Edit the grams for each item. USDA matches use database values; items marked AI are
            estimates from the vision model.
          </AppText>

          {items.map((item, index) => {
            const quantity = parseNumericInput(grams[index] ?? '') ?? 0;
            const nutrients = nutrientsForQuantity(item, quantity);
            return (
              <View key={`${item.name}-${index}`} style={styles.item}>
                <View style={styles.itemHeader}>
                  <View style={styles.itemText}>
                    <AppText variant="bodyMedium">{item.name}</AppText>
                    <AppText variant="caption" color="muted">
                      {[
                        item.confidence !== null
                          ? `${Math.round(item.confidence * 100)}% confidence`
                          : null,
                        `${Math.round(item.caloriesPer100g)} kcal / 100 g`,
                        item.category,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </AppText>
                    <View style={styles.sourceRow}>
                      <View
                        style={[
                          styles.sourceBadge,
                          item.nutritionSource === 'usda' ? styles.sourceUsda : styles.sourceAi,
                        ]}
                      >
                        <AppText variant="caption" style={styles.sourceBadgeText}>
                          {item.nutritionSource === 'usda' ? 'USDA MATCH' : 'AI ESTIMATE'}
                        </AppText>
                      </View>
                      {item.matchedFoodName ? (
                        <AppText variant="caption" color="muted" style={styles.matchedName}>
                          {item.matchedFoodName}
                        </AppText>
                      ) : null}
                    </View>
                    {item.notes ? (
                      <AppText variant="caption" color="muted">
                        {item.notes}
                      </AppText>
                    ) : null}
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${item.name}`}
                    onPress={() => {
                      setItems((prev) => prev.filter((_, i) => i !== index));
                      setGrams((prev) => prev.filter((_, i) => i !== index));
                    }}
                    hitSlop={8}
                  >
                    <TrashIcon size={16} color={colors.textMuted} strokeWidth={2} />
                  </Pressable>
                </View>
                <View style={styles.itemEdit}>
                  <TextField
                    value={grams[index] ?? ''}
                    onChangeText={(value) =>
                      setGrams((prev) => prev.map((entry, i) => (i === index ? value : entry)))
                    }
                    keyboardType="decimal-pad"
                    suffix="g"
                    compact
                    containerStyle={styles.gramsField}
                  />
                  <AppText variant="smallMedium" style={styles.itemKcal}>
                    {`${formatCalories(nutrients.calories)} kcal`}
                  </AppText>
                </View>
                <View style={styles.macrosRow}>
                  <AppText variant="caption" color="protein">
                    {`P ${nutrients.protein} g`}
                  </AppText>
                  <AppText variant="caption" color="carbs">
                    {`C ${nutrients.carbs} g`}
                  </AppText>
                  <AppText variant="caption" color="fat">
                    {`F ${nutrients.fat} g`}
                  </AppText>
                  {nutrients.fiber > 0 ? (
                    <AppText variant="caption" color="muted">
                      {`Fibre ${nutrients.fiber} g`}
                    </AppText>
                  ) : null}
                </View>
              </View>
            );
          })}

          <View style={styles.mealBlock}>
            <AppText variant="smallMedium" color="secondary">
              Add to
            </AppText>
            <AppText variant="caption" color="muted">
              {formatFriendlyDate(date)}
            </AppText>
            <View style={styles.chipWrap}>
              {MEAL_TYPES.map((meal) => (
                <Chip
                  key={meal}
                  label={MEAL_LABELS[meal]}
                  active={mealType === meal}
                  onPress={() => setMealType(meal)}
                />
              ))}
            </View>
          </View>

          <Button
            label={`Add ${items.length} ${items.length === 1 ? 'item' : 'items'} to ${
              MEAL_LABELS[mealType]
            }`}
            onPress={confirm}
            loading={busy}
            fullWidth
          />
        </Card>
      ) : null}

      {visionEnabled ? (
        <Notice
          tone="info"
          title="Estimates need your eyes"
          message="Photo analysis struggles with mixed dishes, oil and hidden portions. Adjust the grams, and prefer your own recipes when accuracy matters."
        />
      ) : (
        <Card style={styles.card}>
          <AppText variant="h3">What photo recognition would do</AppText>
          <Step index={1} text="Choose or take a photo of your plate." />
          <Step index={2} text="The vision service suggests foods and portion estimates." />
          <Step index={3} text="You adjust grams and confirm — nothing is logged automatically." />
          <Step index={4} text="Every item is labelled as an estimate with its source." />
        </Card>
      )}

      <Button
        label="Search foods instead"
        icon={Search}
        onPress={() => router.replace({ pathname: '/food/search', params: { meal: mealType, date } })}
        fullWidth
      />
      <Button
        label="Create a custom food"
        variant="secondary"
        onPress={() => router.replace({ pathname: '/food/new', params: { meal: mealType, date } })}
        fullWidth
      />
    </Screen>
  );
}

function Step({ index, text }: { index: number; text: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepIndex}>
        <AppText variant="caption" color="primary">
          {index}
        </AppText>
      </View>
      <AppText variant="small" color="secondary" style={styles.stepText}>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingTop: spacing.lg,
  },
  card: {
    gap: spacing.md,
  },
  pickerRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  picker: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xxl,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    backgroundColor: colors.primaryTint,
  },
  pressed: {
    opacity: 0.7,
  },
  previewWrap: {
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  preview: {
    width: '100%',
    height: 190,
    backgroundColor: colors.surfaceMuted,
  },
  previewActions: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  previewAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.overlay,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  item: {
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  itemText: {
    flex: 1,
    gap: 2,
  },
  itemEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  gramsField: {
    flex: 1,
  },
  itemKcal: {
    minWidth: 72,
    textAlign: 'right',
  },
  mealBlock: {
    gap: spacing.xs,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  stepIndex: {
    width: 22,
    height: 22,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryTint,
  },
  stepText: {
    flex: 1,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },
  sourceBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  sourceUsda: {
    backgroundColor: colors.primarySoft,
  },
  sourceAi: {
    backgroundColor: colors.warningSoft,
  },
  sourceBadgeText: {
    fontSize: 10,
    letterSpacing: 0.6,
    color: colors.textSecondary,
  },
  matchedName: {
    flex: 1,
  },
  macrosRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
});

import { useState, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { X } from 'lucide-react-native';

import { AppHeader } from '@/components/AppHeader';
import { Notice } from '@/components/Notice';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { colors, radii, spacing } from '@/constants/theme';
import { useToast } from '@/context/ToastContext';
import { appEnv } from '@/lib/env';
import { barcodeFailureMessage, lookupOpenFoodFactsBarcode } from '@/lib/openfoodfacts';
import { cacheFood } from '@/lib/foodCache';
import { errorMessage } from '@/lib/utils';
import { MEAL_TYPES, type MealType } from '@/types/models';

export default function BarcodeScanScreen() {
  const params = useLocalSearchParams<{ meal?: string; date?: string }>();
  const router = useRouter();
  const { showToast } = useToast();

  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastScanned = useRef<string | null>(null);

  const mealType = (MEAL_TYPES.find((m) => m === params.meal) ?? 'lunch') as MealType;
  const date = typeof params.date === 'string' && params.date ? params.date : '';

  const handleBarcodeScanned = async (result: { data: string }) => {
    if (scanned || loading) return;
    const code = result.data;
    if (lastScanned.current === code) return;
    lastScanned.current = code;
    setScanned(true);
    setLoading(true);
    setError(null);

    try {
      const outcome = await lookupOpenFoodFactsBarcode(code);
      if (outcome.status !== 'found') {
        // A miss, an outage and a disabled build are different problems, so
        // they get different messages instead of one "no product" catch-all.
        setError(barcodeFailureMessage(outcome));
        setScanned(false);
        lastScanned.current = null;
        return;
      }
      cacheFood(outcome.food);
      showToast(`Found ${outcome.food.name}`);
      router.replace({
        pathname: '/food/[id]',
        params: { id: outcome.food.id, meal: mealType, date },
      });
    } catch (cause) {
      setError(errorMessage(cause, 'Barcode lookup failed. Try again.'));
      setScanned(false);
      lastScanned.current = null;
    } finally {
      setLoading(false);
    }
  };

  if (!appEnv.openFoodFactsEnabled) {
    return (
      <Screen contentStyle={styles.content}>
        <AppHeader title="Scan barcode" showBack />
        <Card style={styles.card}>
          <Notice
            tone="warning"
            title="Barcode lookup is turned off"
            message="This build has Open Food Facts disabled, so scanning cannot find products. Name search and manual food entry still work."
          />
          <Button label="Go back" onPress={() => router.back()} fullWidth />
        </Card>
      </Screen>
    );
  }

  if (!permission) {
    return (
      <Screen>
        <AppText>Loading camera…</AppText>
      </Screen>
    );
  }

  if (!permission.granted) {
    return (
      <Screen contentStyle={styles.content}>
        <AppHeader title="Scan barcode" showBack />
        <Card style={styles.card}>
          <Notice
            tone="info"
            title="Camera access needed"
            message="CalCount needs camera access to scan product barcodes. Your camera is only used for scanning — nothing is recorded or uploaded."
          />
          <Button label="Grant camera access" onPress={requestPermission} fullWidth />
          <Button
            label="Enter barcode manually"
            variant="secondary"
            onPress={() => router.back()}
            fullWidth
          />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} padded={false} contentStyle={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close scanner"
          onPress={() => router.back()}
          style={styles.closeButton}
        >
          <X size={22} color={colors.white} strokeWidth={2.2} />
        </Pressable>
        <AppText variant="h3" color="white" style={styles.title}>
          Scan a barcode
        </AppText>
      </View>

      <CameraView
        style={styles.camera}
        facing="back"
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'],
        }}
      >
        <View style={styles.overlay}>
          <View style={styles.frame} />
          <AppText variant="small" color="white" style={styles.hint}>
            {loading ? 'Looking up product…' : 'Align the barcode within the frame'}
          </AppText>
          {error ? (
            <View style={styles.errorBox}>
              <Notice tone="danger" message={error} />
              <Button
                label="Try again"
                size="sm"
                onPress={() => {
                  setError(null);
                  setScanned(false);
                  lastScanned.current = null;
                }}
              />
            </View>
          ) : null}
        </View>
      </CameraView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.text,
  },
  content: {
    gap: spacing.md,
    paddingTop: spacing.lg,
  },
  card: {
    gap: spacing.md,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.md,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay,
  },
  title: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  frame: {
    width: 260,
    height: 160,
    borderWidth: 2,
    borderColor: colors.white,
    borderRadius: radii.lg,
    backgroundColor: 'transparent',
  },
  hint: {
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  errorBox: {
    position: 'absolute',
    bottom: spacing.xl,
    left: spacing.md,
    right: spacing.md,
    gap: spacing.sm,
  },
});
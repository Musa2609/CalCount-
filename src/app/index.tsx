import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors } from '@/constants/theme';

/**
 * Entry route. The root layout's auth gate immediately redirects to sign in,
 * onboarding or the tab navigator depending on the restored session.
 */
export default function Index() {
  return (
    <View style={styles.container}>
      <ActivityIndicator color={colors.primary} size="small" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});

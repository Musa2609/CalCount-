/**
 * Minimal react-native stand-in so shared modules that only need constants
 * (theme tokens, StyleSheet) can be imported in plain Node during QA.
 */
export const Platform = { OS: 'ios', select: (options) => options?.ios ?? options?.default };

export const Dimensions = {
  get: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
  addEventListener: () => ({ remove() {} }),
};

const identity = (value) => value;

export const StyleSheet = {
  create: identity,
  flatten: identity,
  compose: identity,
  hairlineWidth: 1,
  absoluteFill: {},
  absoluteFillObject: {},
};

export const PixelRatio = { get: () => 3, getFontScale: () => 1, roundToNearestPixel: (n) => n };

export const I18nManager = { isRTL: false };

export default { Platform, Dimensions, StyleSheet, PixelRatio, I18nManager };

import { Platform } from 'react-native';

// Nurik's Academy operational design system.
// The palette carries the public site's black-and-gold identity, while the
// application stays flatter, quieter, and easier to scan for daily work.
export const COLORS = {
  gold: '#D8B84A',
  goldLight: '#E8D174',
  goldDark: '#B89427',
  goldMuted: '#796724',

  // Legacy marble names remain as compatibility aliases used by existing
  // screens. Their values now map to the new neutral surface hierarchy.
  marbleDark: '#11120F',
  marbleGray: '#303129',
  marbleMedium: '#5E6056',
  marbleLight: '#92948A',
  marbleVeryLight: '#D0D1C9',

  background: '#0C0D0B',
  backgroundLight: '#141510',
  backgroundCard: '#191A16',
  backgroundElevated: '#20211C',
  backgroundSubtle: '#10110E',

  textPrimary: '#F5F3EA',
  textSecondary: '#AAA99F',
  textTertiary: '#77786F',
  textOnGold: '#17160F',

  border: '#303129',
  borderStrong: '#45473D',

  success: '#4DB67A',
  warning: '#E1A847',
  error: '#E56A62',
  info: '#6F9FD8',

  overlay: 'rgba(0, 0, 0, 0.72)',
  overlayLight: 'rgba(0, 0, 0, 0.42)',
};

export const SIZES = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,

  fontXs: 12,
  fontSm: 14,
  fontMd: 16,
  fontLg: 19,
  fontXl: 26,
  fontXxl: 34,

  radiusXs: 6,
  radiusSm: 8,
  radiusMd: 12,
  radiusLg: 16,
  radiusXl: 20,
  radiusFull: 999,

  touchTarget: 48,
  inputHeight: 52,
  headerTop: Platform.select({ web: 28, default: 56 }) as number,
};

export const LAYOUT = {
  contentMaxWidth: 1240,
  formMaxWidth: 560,
  readableMaxWidth: 760,
  sidebarWidth: 232,
  mobileBreakpoint: 768,
  desktopBreakpoint: 1024,
};

export const FONTS = {
  regular: 'System',
  medium: 'System',
  semiBold: 'System',
  bold: 'System',
};

// Quiet shadows avoid expensive, blurred "floating" UI on older Android
// devices while preserving hierarchy on iOS and web.
export const SHADOWS = {
  small: Platform.select({
    web: { boxShadow: '0 1px 2px rgba(0,0,0,0.22)' } as any,
    default: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.14, shadowRadius: 2, elevation: 1 },
  }),
  medium: Platform.select({
    web: { boxShadow: '0 8px 24px rgba(0,0,0,0.18)' } as any,
    default: { shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.16, shadowRadius: 8, elevation: 3 },
  }),
  large: Platform.select({
    web: { boxShadow: '0 18px 48px rgba(0,0,0,0.28)' } as any,
    default: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 14, elevation: 6 },
  }),
};

export const SURFACES = {
  card: {
    backgroundColor: COLORS.backgroundCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.radiusLg,
  },
  inset: {
    backgroundColor: COLORS.backgroundLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.radiusMd,
  },
};

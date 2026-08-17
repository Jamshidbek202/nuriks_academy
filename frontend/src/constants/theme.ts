import { Platform } from 'react-native';

// Nurik's Academy operational design system.
// The palette carries the public site's black-and-gold identity, while the
// application stays flatter, quieter, and easier to scan for daily work.
export const COLORS = {
  gold: '#E0BE45',
  goldLight: '#F0D56F',
  goldDark: '#B89326',
  goldMuted: '#746421',

  // Legacy marble names remain as compatibility aliases used by existing
  // screens. Their values now map to the new neutral surface hierarchy.
  marbleDark: '#0D0F0C',
  marbleGray: '#2A2D24',
  marbleMedium: '#5D6155',
  marbleLight: '#96998E',
  marbleVeryLight: '#D2D2C9',

  background: '#090A08',
  backgroundLight: '#0D0F0C',
  backgroundCard: '#11130F',
  backgroundElevated: '#171913',
  backgroundSubtle: '#0B0D0A',

  textPrimary: '#F4F1E7',
  textSecondary: '#B4B4AA',
  textTertiary: '#85877D',
  textOnGold: '#14140E',

  border: '#292C24',
  borderStrong: '#41453A',

  success: '#67A873',
  warning: '#D7A13F',
  error: '#D86B57',
  info: '#7B9FBE',

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

  radiusXs: 4,
  radiusSm: 6,
  radiusMd: 8,
  radiusLg: 10,
  radiusXl: 12,
  radiusFull: 999,

  touchTarget: 48,
  inputHeight: 52,
  headerTop: Platform.select({ web: 28, default: 56 }) as number,
};

export const LAYOUT = {
  contentMaxWidth: 1240,
  formMaxWidth: 560,
  readableMaxWidth: 760,
  sidebarWidth: 216,
  mobileBreakpoint: 768,
  desktopBreakpoint: 1024,
};

export const FONTS = {
  regular: 'System',
  medium: 'System',
  semiBold: 'System',
  bold: 'System',
};

export const TYPOGRAPHY = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: '800' as const, letterSpacing: -0.8 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '800' as const, letterSpacing: -0.25 },
  section: { fontSize: 17, lineHeight: 22, fontWeight: '700' as const },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' as const },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '700' as const, letterSpacing: 0.4 },
  numeric: { fontVariant: ['tabular-nums'] as ('tabular-nums')[] },
};

// Quiet shadows avoid expensive, blurred "floating" UI on older Android
// devices while preserving hierarchy on iOS and web.
export const SHADOWS = {
  small: Platform.select({
    web: { boxShadow: '0 1px 1px rgba(0,0,0,0.18)' } as any,
    default: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 1, elevation: 0 },
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
    borderRadius: SIZES.radiusMd,
  },
  inset: {
    backgroundColor: COLORS.backgroundLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.radiusMd,
  },
};

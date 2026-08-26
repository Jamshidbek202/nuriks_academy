import { Platform } from 'react-native';

// Nurik's Academy operational design system.
// The palette keeps the public site's black-and-gold identity, then adds a
// restrained material system that stays light enough for daily use
// on older phones as well as the web dashboard.
export const COLORS = {
  gold: '#D5B662',
  goldLight: '#F1D98B',
  goldDark: '#9A7D34',
  goldMuted: '#6E5C2F',
  goldGlass: 'rgba(213, 182, 98, 0.14)',
  goldHairline: 'rgba(241, 217, 139, 0.30)',
  coolGlass: 'rgba(78, 142, 255, 0.14)',

  // Legacy marble names remain as compatibility aliases used by existing
  // screens. Their values now map to the new neutral surface hierarchy.
  marbleDark: '#090C0F',
  marbleGray: '#303740',
  marbleMedium: '#66707A',
  marbleLight: '#9CA5AD',
  marbleVeryLight: '#D8D7D1',

  // Route foundations are intentionally opaque. React Navigation keeps tab
  // scenes mounted, so transparency here would expose the previous route.
  background: '#090A07',
  backgroundSolid: '#050604',
  backgroundLight: 'rgba(18, 19, 15, 0.86)',
  backgroundCard: 'rgba(21, 22, 17, 0.82)',
  backgroundElevated: '#1B1C17',
  backgroundSubtle: 'rgba(12, 13, 10, 0.84)',

  // Glass is opt-in and only belongs on bounded foreground surfaces.
  glass: 'rgba(20, 21, 17, 0.72)',
  glassStrong: 'rgba(20, 21, 17, 0.88)',

  textPrimary: '#F5F0E6',
  textSecondary: '#BCC2C6',
  textTertiary: '#8C969F',
  textOnGold: '#101317',

  border: 'rgba(245, 238, 216, 0.10)',
  borderStrong: 'rgba(213, 182, 98, 0.24)',
  glassHighlight: 'rgba(255, 255, 255, 0.15)',

  success: '#45C49D',
  warning: '#E3A73F',
  error: '#E4705C',
  info: '#4E8EFF',

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

  radiusXs: 8,
  radiusSm: 12,
  radiusMd: 16,
  radiusLg: 20,
  radiusXl: 24,
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

// Soft black shadows establish elevation without colored glow. Repeated cards
// stay nearly flat; heavier shadows are reserved for bounded heroes/modals so
// long Android lists remain responsive.
export const SHADOWS = {
  small: Platform.select({
    web: { boxShadow: '0 3px 10px rgba(0,0,0,0.14)' } as any,
    default: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.10, shadowRadius: 4, elevation: 1 },
  }),
  medium: Platform.select({
    web: { boxShadow: '0 14px 38px rgba(0,0,0,0.28)' } as any,
    default: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.20, shadowRadius: 18, elevation: 4 },
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
    borderColor: COLORS.glassHighlight,
    borderRadius: SIZES.radiusMd,
    ...SHADOWS.small,
  },
  inset: {
    backgroundColor: COLORS.backgroundLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.radiusMd,
  },
};

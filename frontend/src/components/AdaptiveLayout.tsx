import React, { useState } from 'react';
import {
  RefreshControlProps,
  ScrollView,
  ScrollViewProps,
  StyleProp,
  StyleSheet,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';

import { Text } from './LocalizedText';
import { COLORS, LAYOUT, SIZES } from '../constants/theme';

export type AdaptiveMode = 'compact' | 'medium' | 'expanded';

const COMPACT_BREAKPOINT = 680;
const EXPANDED_BREAKPOINT = 1040;

/**
 * A single window-size model shared by web, iOS, and Android. It deliberately
 * describes available space instead of device names so split-screen, tablets,
 * landscape phones, and resized browser windows all choose the right layout.
 */
export function useAdaptiveLayout(maxWidth = LAYOUT.contentMaxWidth) {
  const { width, height, fontScale } = useWindowDimensions();
  const mode: AdaptiveMode = width < COMPACT_BREAKPOINT
    ? 'compact'
    : width < EXPANDED_BREAKPOINT
      ? 'medium'
      : 'expanded';
  const pagePadding = mode === 'compact' ? SIZES.md : SIZES.lg;
  const availableWidth = Math.max(0, width - pagePadding * 2);

  return {
    width,
    height,
    fontScale,
    mode,
    isCompact: mode === 'compact',
    isMedium: mode === 'medium',
    isExpanded: mode === 'expanded',
    pagePadding,
    contentWidth: Math.min(maxWidth, availableWidth),
  };
}

export function AdaptivePageHeader({
  title,
  description,
  action,
  meta,
  style,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  meta?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { isCompact } = useAdaptiveLayout();
  return (
    <View style={[styles.headerBand, style]}>
      <View style={[styles.headerInner, isCompact && styles.headerInnerCompact]}>
        <View style={styles.headerCopy}>
          <Text style={[styles.pageTitle, isCompact && styles.pageTitleCompact]}>{title}</Text>
          {!!description && <Text style={styles.pageDescription}>{description}</Text>}
          {!!meta && <View style={styles.headerMeta}>{meta}</View>}
        </View>
        {!!action && <View style={[styles.headerAction, isCompact && styles.headerActionCompact]}>{action}</View>}
      </View>
    </View>
  );
}

export function AdaptiveScrollView({
  children,
  contentContainerStyle,
  maxWidth = LAYOUT.contentMaxWidth,
  ...props
}: ScrollViewProps & { maxWidth?: number; refreshControl?: React.ReactElement<RefreshControlProps> }) {
  const { isCompact, pagePadding } = useAdaptiveLayout(maxWidth);
  return (
    <ScrollView
      {...props}
      contentContainerStyle={[
        styles.scrollContent,
        { maxWidth, paddingHorizontal: pagePadding },
        isCompact && styles.scrollContentCompact,
        contentContainerStyle,
      ]}
    >
      {children}
    </ScrollView>
  );
}

export function AdaptiveColumns({
  children,
  style,
  collapseAt = 'medium',
  gap = SIZES.md,
  align = 'stretch',
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  collapseAt?: 'compact' | 'medium';
  gap?: number;
  align?: ViewStyle['alignItems'];
}) {
  const { isCompact, isMedium } = useAdaptiveLayout();
  const collapsed = collapseAt === 'medium' ? isCompact || isMedium : isCompact;
  return (
    <View style={[styles.columns, { gap, alignItems: align }, collapsed && styles.columnsCollapsed, style]}>
      {React.Children.map(children, (child) => (
        <View style={[styles.column, collapsed && styles.columnCollapsed]}>{child}</View>
      ))}
    </View>
  );
}

export function AdaptiveGrid({
  children,
  minItemWidth = 240,
  maxColumns = 4,
  gap = SIZES.sm,
  style,
}: {
  children: React.ReactNode;
  minItemWidth?: number;
  maxColumns?: number;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const columns = measuredWidth > 0
    ? Math.max(1, Math.min(maxColumns, Math.floor((measuredWidth + gap) / (minItemWidth + gap))))
    : 1;
  const itemWidth = measuredWidth > 0
    ? Math.max(0, (measuredWidth - gap * (columns - 1)) / columns)
    : '100%';

  return (
    <View
      style={[styles.grid, { gap }, style]}
      onLayout={(event) => {
        const nextWidth = Math.round(event.nativeEvent.layout.width);
        setMeasuredWidth((current) => current === nextWidth ? current : nextWidth);
      }}
    >
      {React.Children.map(children, (child) => (
        <View style={{ width: itemWidth as any, maxWidth: '100%' }}>{child}</View>
      ))}
    </View>
  );
}

export function AdaptiveSectionHeading({
  title,
  description,
  action,
  style,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.sectionHeading, style]}>
      <View style={styles.headerCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {!!description && <Text style={styles.sectionDescription}>{description}</Text>}
      </View>
      {!!action && <View style={styles.sectionAction}>{action}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  headerBand: {
    width: '100%',
    backgroundColor: COLORS.backgroundSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  headerInner: {
    width: '100%',
    maxWidth: LAYOUT.contentMaxWidth,
    minHeight: 108,
    alignSelf: 'center',
    paddingTop: SIZES.headerTop,
    paddingHorizontal: SIZES.lg,
    paddingBottom: SIZES.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SIZES.lg,
  },
  headerInnerCompact: {
    minHeight: 94,
    paddingHorizontal: SIZES.md,
    alignItems: 'flex-start',
    gap: SIZES.sm,
  },
  headerCopy: { flex: 1, minWidth: 0 },
  pageTitle: { color: COLORS.textPrimary, fontSize: SIZES.fontXxl, lineHeight: 40, fontWeight: '800', letterSpacing: -0.7 },
  pageTitleCompact: { fontSize: SIZES.fontXl, lineHeight: 32 },
  pageDescription: { maxWidth: LAYOUT.readableMaxWidth, color: COLORS.textSecondary, fontSize: SIZES.fontSm, lineHeight: 20, marginTop: SIZES.xs },
  headerMeta: { marginTop: SIZES.sm },
  headerAction: { flexShrink: 0, alignSelf: 'center' },
  headerActionCompact: { alignSelf: 'flex-start' },
  scrollContent: {
    width: '100%',
    alignSelf: 'center',
    paddingTop: SIZES.lg,
    paddingBottom: SIZES.xxxl + 24,
  },
  scrollContentCompact: { paddingTop: SIZES.md },
  columns: { width: '100%', flexDirection: 'row' },
  columnsCollapsed: { flexDirection: 'column' },
  column: { flex: 1, minWidth: 0 },
  columnCollapsed: { width: '100%', flexGrow: 0, flexShrink: 0, flexBasis: 'auto' },
  grid: { width: '100%', flexDirection: 'row', flexWrap: 'wrap' },
  sectionHeading: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: SIZES.md,
    marginTop: SIZES.lg,
    marginBottom: SIZES.sm,
  },
  sectionTitle: { color: COLORS.textPrimary, fontSize: SIZES.fontLg, lineHeight: 24, fontWeight: '800' },
  sectionDescription: { color: COLORS.textTertiary, fontSize: SIZES.fontXs, lineHeight: 17, marginTop: 2 },
  sectionAction: { minHeight: 44, justifyContent: 'center' },
});

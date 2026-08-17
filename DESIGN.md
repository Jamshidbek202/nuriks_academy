---
name: Nurik's Academy Operations Platform
description: A disciplined branded register for clear, role-aware academy operations.
colors:
  gold: "#D9B84A"
  gold-light: "#E8CC72"
  gold-dark: "#A9882D"
  gold-muted: "#716128"
  background: "#080907"
  background-light: "#0D0E0C"
  background-card: "#11120F"
  background-elevated: "#171813"
  background-subtle: "#0A0B09"
  text-primary: "#F3F0E7"
  text-secondary: "#B6B3AA"
  text-tertiary: "#87877F"
  text-on-gold: "#11110D"
  border: "#292A25"
  border-strong: "#41423B"
  success: "#67A873"
  warning: "#D7A13F"
  error: "#D86B57"
  info: "#7B9FBE"
typography:
  display:
    fontFamily: "System"
    fontSize: "32px"
    fontWeight: 800
    lineHeight: 1.1875
    letterSpacing: "-0.8px"
  headline:
    fontFamily: "System"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.294
    letterSpacing: "normal"
  title:
    fontFamily: "System"
    fontSize: "22px"
    fontWeight: 800
    lineHeight: 1.273
    letterSpacing: "-0.25px"
  body:
    fontFamily: "System"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.467
    letterSpacing: "normal"
  label:
    fontFamily: "System"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.333
    letterSpacing: "0.4px"
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "12px"
  full: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  xxl: "48px"
  xxxl: "64px"
components:
  button-primary:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.text-on-gold}"
    rounded: "{rounded.sm}"
    padding: "0 24px"
    height: "52px"
  input:
    backgroundColor: "{colors.background-light}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
    padding: "12px 16px"
    height: "52px"
  metric-card:
    backgroundColor: "{colors.background-card}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
    padding: "16px"
    height: "96px"
  summary-row:
    backgroundColor: "{colors.background-card}"
    textColor: "{colors.text-primary}"
    padding: "0 16px"
    height: "58px"
  action-row:
    backgroundColor: "{colors.background-card}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
    height: "78px"
  navigation-item:
    backgroundColor: "transparent"
    textColor: "{colors.text-tertiary}"
    padding: "0 4px"
    width: "76px"
    height: "56px"
  navigation-item-active:
    backgroundColor: "transparent"
    textColor: "{colors.gold}"
    padding: "0 4px"
    width: "76px"
    height: "56px"
  login-panel:
    backgroundColor: "{colors.background-card}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "24px"
---

# Design System: Nurik's Academy Operations Platform

## Overview

**Creative North Star: "Nurik's Institutional Register"**

Nurik's Institutional Register makes academy operations feel disciplined, branded, and dependable. Warm-black working fields carry warm-white information; brass gold identifies the current destination and the next valid action; the real academy mark establishes ownership before the interface asks anyone to work. The product is serious and pleasant, never promotional, childish, or styled like a futuristic AI dashboard.

Identity and current operational status lead the reading order. Familiar role tasks follow in stable groups, with one-pixel rules, flat tonal surfaces, compact type, and tabular values doing the organizational work. Decoration stays quiet enough for repeated use at reception, in lessons, and during finance review.

The same world extends to authentication through a compact form over a lightweight cross-platform gradient and sparse static gold specks derived from the public Nurik's Academy site. The atmosphere establishes family resemblance without importing marketing-page scale, motion, or composition.

**Key Characteristics:**

- Warm-black fields and warm-white copy create a focused operational canvas.
- Brass gold marks active navigation, primary action, and decisive links with restraint.
- The real academy mark and role identity lead before grouped work begins.
- One-pixel rules, modest radii, and tabular values support fast scanning.
- A persistent role-specific bottom bar preserves familiar destinations at every width.

## Colors

The palette combines low-chroma warm blacks with a scarce brass accent and semantic status colors that always retain a text cue.

### Primary

- **Academy Brass** (`gold`): primary actions, the active navigation rule, loading indicators, and decisive links.
- **Lit Brass Edge** (`gold-light`): the fine border or highlight on a gold control.
- **Deep Academy Brass** (`gold-dark`): a darker accent step for pressed or emphasized gold states.
- **Muted Academy Brass** (`gold-muted`): low-emphasis brand context that should not compete with action.

### Secondary

- **Confirmation Green** (`success`): completed, active, or healthy states, paired with text.
- **Caution Amber** (`warning`): unresolved, expiring, or attention-needed states.
- **Exception Coral** (`error`): errors, overdue work, destructive choices, and blocked states.
- **Information Blue** (`info`): neutral informational and review states.

### Neutral

- **Warm Black Canvas** (`background`): the application canvas and deepest persistent field.
- **Inset Warm Black** (`background-light`): inputs and quiet inset controls.
- **Register Surface** (`background-card`): bounded records, summary groups, the bottom bar, and form panels.
- **Raised Register** (`background-elevated`): the tonal step for genuinely emphasized surfaces.
- **Quiet Header Band** (`background-subtle`): headers and other low-contrast structural bands.
- **Warm White** (`text-primary`): primary labels, titles, and numbers.
- **Quiet Warm Gray** (`text-secondary`): descriptions and supporting labels.
- **Dim Warm Gray** (`text-tertiary`): metadata, placeholders, and inactive navigation.
- **Ink on Brass** (`text-on-gold`): high-contrast content on gold controls.
- **Hairline Rule** (`border`): routine record and field separation.
- **Strong Rule** (`border-strong`): major boundaries, focused regions, and outlined controls.

### Named Rules

**The Brass Scarcity Rule.** Gold marks the current selection, one primary action, or a decisive link; it is never a decorative wash.

**The Status Is Language Rule.** Semantic color reinforces a visible label, value, or icon; color never carries operational meaning by itself.

## Typography

**Display Font:** System (with the native platform sans-serif fallback)

**Body Font:** System (with the native platform sans-serif fallback)

**Character:** One system workhorse face keeps the product fast, familiar, and resilient across English, Russian, and Uzbek. Hierarchy comes from weight, size, spacing, and alignment rather than a decorative font pairing.

### Hierarchy

- **Display** (800, 32px, 38px line height): rare screen-defining statements and high-level authentication context.
- **Headline** (700, 17px, 22px line height): section headers for the familiar dashboard groups and other operational regions.
- **Title** (800, 22px, 28px line height): person, route, or page context.
- **Body** (400, 15px, 22px line height): record content, instructions, and explanatory copy.
- **Label** (700, 12px, 16px line height, 0.4px tracking): compact metadata and control labels.

### Named Rules

**The Numeric Trust Rule.** Money, dates, times, counts, and dashboard values use tabular numerals.

**The Workhorse Type Rule.** System type carries controls and operational content; custom display type and oversized marketing headlines do not enter the app shell.

## Layout

The core spacing rhythm is 4, 8, 16, 24, 32, 48, and 64px. Standard page padding is 24px on wider screens and 16px below the compact dashboard threshold. The shared content container is capped at 1240px, readable content at 760px, and forms at 560px.

The dashboard keeps its original groups and reading order: Academy overview, Today, Student Status, Staff Management, and, for authorized super administrators, Admin Tools. The overview presents four metrics across when room permits and a 2×2 arrangement on compact screens. Today and Student Status sit side by side at wider widths and stack below 760px. Staff and admin actions use two columns when each row can retain useful width, then become one readable column on compact screens.

Navigation is a persistent bottom bar at every width. Role sets of five or fewer destinations remain centered and width-constrained instead of stretching across a desktop viewport. Larger role sets retain every familiar destination; on narrow screens they scroll horizontally with 76px-wide, 56px-high items so targets remain at least 48px. The bar accounts for the platform safe area and content retains enough bottom padding to remain unobscured.

Authentication remains one compact, centered column. The academy identity leads, the form follows, and recovery or activation links remain full touch targets. The gradient and static specks fill the background only; they never alter the form's geometry.

## Elevation & Depth

The system is flat by default. Tonal shifts and one-pixel rules distinguish resting surfaces; the shared bottom navigation explicitly disables shadow and platform elevation. Small shadow is nearly imperceptible, while medium and large shadows are reserved for menus, modals, and temporary overlays that genuinely sit above the workspace.

### Shadow Vocabulary

- **Quiet Edge** (`0 1px 1px rgba(0,0,0,0.18)`): minimal web separation where a hairline alone is insufficient.
- **Temporary Overlay** (`0 8px 24px rgba(0,0,0,0.18)`): menus, popovers, and medium transient surfaces.
- **Modal Lift** (`0 18px 48px rgba(0,0,0,0.28)`): large modal or overlay separation only.

### Named Rules

**The Flat Register Rule.** Resting work surfaces stay flat; shadow belongs only to a menu, modal, or temporary overlay.

**The Quiet Atmosphere Rule.** The login gradient and gold specks are static background material, never glow, blur, parallax, or continuous animation.

## Shapes

Corners are compact and functional: 4px for small icon frames and details, 6px for buttons, fields, dashboard records, and compact controls, 8px for ordinary cards and the login panel, 10px for larger grouped controls, and 12px only where an established larger shell needs it. Circular status dots, badges, and avatars use the full 999px radius. Structural bands and navigation remain square so their ruled edges join cleanly.

Borders are normally one pixel and low contrast. Stronger rules identify major region boundaries, fields, or explicitly outlined controls; they do not become decorative frames. Content clips only when a bounded control or grouped row set requires it.

## Components

### Buttons

Buttons are direct, compact, and task-specific.

- **Shape:** functional 6px corners with a minimum 48px target; the login primary action is 52px high.
- **Primary:** academy-brass fill, ink-on-brass 800-weight label, and a one-pixel lit-brass border; use once per task context.
- **Hover / Focus:** preserve the color role, show a visible two-pixel brass outline on web, and use restrained opacity feedback for press state.
- **Disabled / Loading:** lower opacity without losing the control's silhouette; replace the label with a correctly colored progress indicator while work is pending.

### Cards / Containers

Containers are bounded operational records, not decorative tiles.

- **Metric Records:** 6px corners, one hairline border, 16px padding, a tabular value, and a short supporting label; four across or 2×2 compact.
- **Summary Groups:** one bounded surface containing 58px ruled rows for Today or Student Status.
- **Action Rows:** 6px corners, a 38px outlined icon frame, label, description, and forward cue; two columns wide and one column compact.
- **Login Panel:** a single 8px form surface with a strong border and 24px padding over the quiet atmosphere.
- **Shadow Strategy:** flat at rest; use the elevation vocabulary only when a container becomes an overlay.

### Inputs / Fields

Inputs feel substantial and native without becoming oversized.

- **Style:** inset-warm-black fill, strong-rule stroke, 6px corners, 16px horizontal padding, and a 52px minimum height.
- **Focus:** a visible academy-brass border or outline without glow or layout shift.
- **Error / Disabled:** use exception coral for error border and supporting copy; disabled states reduce opacity while retaining readable text.
- **Labels:** quiet-warm-gray text at 14px and 600–700 weight, separated from the field by 8px.

### Navigation

The role-filtered navigation stays at the bottom on phone, tablet, and desktop. Each item combines a familiar icon with a short translated label. The active item remains transparent and gains one thin gold top rule; inactive content uses dim warm gray. Five or fewer destinations form a centered constrained group. Larger role sets keep every route and scroll horizontally only when the available width cannot preserve their touch targets. Navigation never uses a filled rounded selection tile.

### Operational Dashboard Groups

Academy overview establishes current counts first. Today and Student Status present familiar summaries in ruled rows. Staff Management and permission-gated Admin Tools follow as labeled action rows. These groups preserve operational memory and route authority; they are not reinterpreted as a timeline, compensation summary, or novel information architecture.

### Login Atmosphere

The login uses the real academy mark, a compact form panel, a lightweight cross-platform warm-black gradient, and sparse static gold specks derived from `nuriks-academy.uz`. It has no continuous animation, blur, glow, promotional copy block, or oversized type. Error and session-ended notices remain visibly distinct through their semantic border and icon colors.

## Do's and Don'ts

### Do:

- **Do** lead with the academy identity and current role or operational status.
- **Do** preserve Academy overview, Today, Student Status, Staff Management, and Admin Tools as the familiar dashboard groups.
- **Do** use gold for the active navigation rule, one primary action, and short decisive links.
- **Do** keep interactive targets at least 48px and inputs at least 52px high.
- **Do** pair every status color with text and use tabular numerals for dates, times, counts, and UZS.
- **Do** keep every role-valid destination reachable in the persistent bottom bar, using horizontal scroll only when required.

### Don't:

- **Don't** replace familiar operational grouping with a timeline, novel dashboard narrative, or compensation-first summary.
- **Don't** move primary navigation away from the persistent bottom bar or change the role's established route set for visual neatness.
- **Don't** turn operational sections into nested floating card stacks or bento layouts.
- **Don't** use large decorative radii, gradient text, texture, heavy blur, glow, huge type, or continuous animation.
- **Don't** fill the active navigation item with a rounded tile; use one thin gold top rule.
- **Don't** use shadows on resting content surfaces, color as the only status cue, or a second primary action in one task context.

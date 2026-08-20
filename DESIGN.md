---
name: Nurik's Academy Operations Platform
description: A disciplined branded register for clear, role-aware academy operations.
colors:
  gold: "#D9B84A"
  gold-light: "#F0D67B"
  gold-dark: "#A9882D"
  gold-muted: "#716128"
  background-solid: "#050604"
  background: "#070806"
  background-light: "#0D100D"
  background-card: "#121510"
  background-elevated: "#191D16"
  background-subtle: "#0A0C09"
  glass: "rgba(20, 24, 19, 0.88)"
  glass-strong: "rgba(25, 29, 23, 0.94)"
  text-primary: "#F3F0E7"
  text-secondary: "#B6B3AA"
  text-tertiary: "#87877F"
  text-on-gold: "#11110D"
  border: "rgba(255, 255, 255, 0.10)"
  border-strong: "rgba(240, 214, 123, 0.25)"
  glass-highlight: "rgba(255, 255, 255, 0.13)"
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
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "24px"
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
    backgroundColor: "rgba(217, 184, 74, 0.14)"
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

Nurik's Institutional Register makes academy operations feel disciplined, branded, and dependable. Warm-black working fields carry warm-white information; brass gold identifies the current destination and the next valid action; the real academy mark establishes ownership before the interface asks anyone to work. A quiet glass layer and restrained atmospheric color give the product finish without turning it into a promotional, childish, or futuristic AI dashboard.

Identity and current operational status lead the reading order. Familiar role tasks follow in stable groups, with one-pixel rules, solid tonal surfaces, compact type, and tabular values doing the organizational work. Decoration stays quiet enough for repeated use at reception, in lessons, and during finance review.

The same world extends to authentication through a compact glass form over a lightweight cross-platform gradient, restrained warm and cool light pools, and sparse static gold specks derived from the public Nurik's Academy site. The atmosphere establishes family resemblance without importing marketing-page scale, motion, or composition.

**Key Characteristics:**

- Warm-black fields and warm-white copy create a focused operational canvas.
- Brass gold marks active navigation, primary action, and decisive links with restraint.
- The real academy mark and role identity lead before grouped work begins.
- One-pixel highlights, generous but controlled radii, and tabular values support fast scanning.
- Liquid-glass material is reserved for the shell and important summaries; ordinary lists stay inexpensive and responsive.
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

- **Warm Black Foundation** (`background-solid`): the deepest persistent shell field.
- **Opaque Working Canvas** (`background`): the route-isolation boundary painted by every tab scene and page.
- **Inset Warm Black** (`background-light`): inputs and quiet inset controls.
- **Register Surface** (`background-card`): bounded records, summary groups, the bottom bar, and form panels.
- **Raised Register** (`background-elevated`): the tonal step for genuinely emphasized surfaces.
- **Quiet Header Band** (`background-subtle`): headers and other low-contrast structural bands.
- **Warm White** (`text-primary`): primary labels, titles, and numbers.
- **Quiet Warm Gray** (`text-secondary`): descriptions and supporting labels.
- **Dim Warm Gray** (`text-tertiary`): metadata, placeholders, and inactive navigation.
- **Ink on Brass** (`text-on-gold`): high-contrast content on gold controls.
- **Hairline Rule** (`border`): routine record and field separation on solid surfaces.
- **Strong Rule** (`border-strong`): major boundaries, focused regions, and outlined controls.
- **Glass Highlight** (`glass-highlight`): the fine light-catching edge on glass panels.

### Named Rules

**The Brass Scarcity Rule.** Gold marks the current selection, one primary action, or a decisive link; it is never a decorative wash.

**The Status Is Language Rule.** Semantic color reinforces a visible label, value, or icon; color never carries operational meaning by itself.

**The Route Isolation Rule.** Every navigator scene, loading view, empty state, and operational page paints an opaque canvas. Atmospheric gradients belong to the active route only; glass is never used as a full-screen foundation.

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

The dashboard keeps every familiar route and authority boundary while using a clearer reading order: one strong Today register, one live academy-status surface, then people/schedule actions and lower-frequency academy tools. The Today register gives the current lesson count visual priority and keeps bookings and student counts compact; it stacks cleanly below 760px. Staff and admin actions use two columns when each row can retain useful width, then become one readable column on compact screens.

Finance is organized by work before terminology. Needs Attention comes first, followed by one coherent Financial Position surface that keeps accrued profit, accrued revenue, and collections visibly distinct. Cash/debt, revenue bridge, obligations, and month close follow as separate solid operational regions. Reception continues to receive its restricted student-payment workspace rather than the centre-wide finance hierarchy.

Navigation is a persistent bottom bar at every width. Role sets of five or fewer destinations remain centered and width-constrained instead of stretching across a desktop viewport. Larger role sets retain every familiar destination; on narrow screens they scroll horizontally with 76px-wide, 56px-high items so targets remain at least 48px. The bar accounts for the platform safe area and content retains enough bottom padding to remain unobscured.

Authentication remains one compact, centered column. The academy identity leads, the form follows, and recovery or activation links remain full touch targets. The gradient and static specks fill the background only; they never alter the form's geometry.

## Elevation & Depth

The system uses three quiet layers: an opaque warm-black route canvas, a route-owned low-contrast atmospheric accent, and solid operational surfaces. True platform blur is limited to the login panel, navigation, and one important summary; repeated scrolling cards use opaque tonal fills and a restrained black shadow, keeping Android, iOS, and web responsive. Gold never becomes a glow.

### Shadow Vocabulary

- **Resting Glass** (`0 8px 22px rgba(0,0,0,0.20)`): low, soft separation for important cards and navigation.
- **Temporary Overlay** (`0 14px 38px rgba(0,0,0,0.28)`): menus, popovers, and medium transient surfaces.
- **Modal Lift** (`0 18px 48px rgba(0,0,0,0.28)`): large modal or overlay separation only.

### Named Rules

**The Layered Register Rule.** Depth communicates grouping, not spectacle: a resting surface may have one soft black shadow, while nested records rely on tonal separation.

**The Quiet Atmosphere Rule.** Gradient pools and gold specks are static background material, never parallax, colored glow, or continuous animation.

**The Trustworthy Motion Rule.** Home sections may enter once with a restrained 6–10px rise and short stagger; Finance may transition only when the user changes tabs. Live money refreshes and all numeric values update directly without counting, bounce, shimmer, or repeated animation. Reduced-motion settings disable these transitions.

## Shapes

Corners are friendly but controlled: 8px for small details, 12px for buttons and compact controls, 16px for fields and ordinary cards, 20px for important grouped panels, and 24px for major authentication or summary surfaces. Circular status dots, badges, and avatars use the full 999px radius. Nested radii step down consistently so panels still read as operational rather than playful.

Borders are normally one pixel and low contrast. Stronger rules identify major region boundaries, fields, or explicitly outlined controls; they do not become decorative frames. Content clips only when a bounded control or grouped row set requires it.

## Components

### Buttons

Buttons are direct, compact, and task-specific.

- **Shape:** controlled 12px corners with a minimum 48px target; the login primary action is 52px high.
- **Primary:** academy-brass fill, ink-on-brass 800-weight label, and a one-pixel lit-brass border; use once per task context.
- **Hover / Focus:** preserve the color role, show a visible two-pixel brass outline on web, and use restrained opacity feedback for press state.
- **Disabled / Loading:** lower opacity without losing the control's silhouette; replace the label with a correctly colored progress indicator while work is pending.

### Cards / Containers

Containers are bounded, mostly solid operational records, not decorative tiles. Glass is an opt-in focal material rather than a global card treatment.

- **Today Register:** one 24px bounded anchor with a dominant current-work value, compact supporting facts, and restrained brand geometry rather than a peer grid of generic KPIs.
- **Financial Position:** one large, solid high-trust surface containing accrued profit as the lead value and ruled accrued-revenue/collection rows; never three unrelated decorative money cards.
- **Summary Groups:** one bounded surface containing 58px ruled rows for Today or Student Status.
- **Action Rows:** 16px corners, a 38px outlined icon frame, label, description, and forward cue; two columns wide and one column compact.
- **Login Panel:** a single 24px blurred form surface with a highlight border and 24px padding over the quiet atmosphere.
- **Shadow Strategy:** one soft black resting shadow may separate a major raised surface; nested rows stay tonal and shadow-free.

### Inputs / Fields

Inputs feel substantial and native without becoming oversized.

- **Style:** inset-warm-black fill, strong-rule stroke, 16px corners, 16px horizontal padding, and a 52px minimum height.
- **Focus:** a visible academy-brass border or outline without glow or layout shift.
- **Error / Disabled:** use exception coral for error border and supporting copy; disabled states reduce opacity while retaining readable text.
- **Labels:** quiet-warm-gray text at 14px and 600–700 weight, separated from the field by 8px.

### Navigation

The role-filtered navigation stays at the bottom on phone, tablet, and desktop. The bar uses a restrained blurred surface and glass highlight. Each item combines a familiar icon with a short translated label. The active item gains a low-opacity gold pill and a thin gold rule; inactive content uses dim warm gray. Five or fewer destinations form a centered constrained group. Larger role sets keep every route and scroll horizontally only when the available width cannot preserve their touch targets.

### Operational Dashboard Groups

Today establishes current work first. Academy status presents current population, team, and student-journey facts inside one live register. Staff Management and permission-gated Admin Tools follow as labeled action rows. These groups preserve operational memory and route authority; they are not reinterpreted as a timeline or compensation summary.

### Login Atmosphere

The login uses the real academy mark, a compact blurred form panel, a lightweight cross-platform warm-black gradient, restrained warm/cool light pools, and sparse static gold specks derived from `nuriks-academy.uz`. It has no continuous animation, colored glow, promotional copy block, or oversized type. Error and session-ended notices remain visibly distinct through their semantic border and icon colors.

### Learning Illustration

Illustration is brand-owned, geometric, and lightweight: the Nurik's mark, open-book/learning glyphs, orbital lines, and sparse points assembled from cross-platform vector icons and native shapes. It may support Login and the Student/Parent learning identity, but never Finance or dense staff records. Stock characters, mascots, classroom clip-art, and generic startup illustration libraries are excluded.

## Do's and Don'ts

### Do:

- **Do** lead with the academy identity and current role or operational status.
- **Do** preserve Academy overview, Today, Student Status, Staff Management, and Admin Tools as the familiar dashboard groups.
- **Do** use gold for the active navigation rule, one primary action, and short decisive links.
- **Do** keep interactive targets at least 48px and inputs at least 52px high.
- **Do** pair every status color with text and use tabular numerals for dates, times, counts, and UZS.
- **Do** keep every role-valid destination reachable in the persistent bottom bar, using horizontal scroll only when required.
- **Do** keep route canvases, dense lists, forms, and modal cards opaque; use glass only for bounded focal surfaces.

### Don't:

- **Don't** replace familiar operational grouping with a timeline, novel dashboard narrative, or compensation-first summary.
- **Don't** move primary navigation away from the persistent bottom bar or change the role's established route set for visual neatness.
- **Don't** turn operational sections into nested floating card stacks or bento layouts.
- **Don't** use bubble-like radii, gradient text, texture, heavy full-screen blur, colored glow, huge type, or continuous animation.
- **Don't** make the active navigation pill brighter than the primary action or remove its thin gold rule.
- **Don't** stack multiple shadows, use color as the only status cue, or introduce a second primary action in one task context.
- **Don't** make a navigator scene transparent or allow inactive route content to show beneath the active page.

---
name: Nurik's Academy Operations Platform
description: A serious, ledger-led operations system for clear daily work and traceable finance.
colors:
  gold: "#E0BE45"
  gold-light: "#F0D56F"
  gold-dark: "#B89326"
  gold-muted: "#746421"
  background: "#090A08"
  background-light: "#0D0F0C"
  background-card: "#11130F"
  background-elevated: "#171913"
  background-subtle: "#0B0D0A"
  text-primary: "#F4F1E7"
  text-secondary: "#B4B4AA"
  text-tertiary: "#85877D"
  text-on-gold: "#14140E"
  border: "#292C24"
  border-strong: "#41453A"
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
    padding: "13px 24px"
    height: "48px"
  button-secondary:
    backgroundColor: "{colors.background-light}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
    padding: "13px 24px"
    height: "48px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
    padding: "13px 24px"
    height: "48px"
  input:
    backgroundColor: "{colors.background-light}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
    padding: "13px 16px"
    height: "52px"
  card:
    backgroundColor: "{colors.background-card}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "24px"
  navigation-item:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary}"
    padding: "0 16px"
    height: "48px"
  navigation-item-active:
    backgroundColor: "transparent"
    textColor: "{colors.gold}"
    padding: "0 16px"
    height: "48px"
  ledger-row:
    backgroundColor: "{colors.background-card}"
    textColor: "{colors.text-primary}"
    padding: "0 16px"
    height: "88px"
---

# Design System: Nurik's Academy Operations Platform

## Overview

**Creative North Star: "Day Ledger"**

Day Ledger turns academy operations into one continuous working register. Ink-black surfaces hold warm-white information, while brass gold identifies the current destination, the next valid action, and the moments that require deliberate attention. The mood is serious, direct, trustworthy, and pleasant: operational rather than promotional.

Structure comes from tonal bands, hairline rules, aligned columns, and a visible chronology instead of stacked decorative cards. Wide screens use a compact role-aware rail and ledger columns; compact screens move navigation to a five-destination bottom bar and collapse records into a single readable flow. Small functional corners soften controls without making the product feel bubbly.

The login surface shares the same materials, logo, typography, borders, and gold action language. Across every surface, familiar controls, multilingual resilience, exact financial reading, and fast mobile work take precedence over decoration.

**Key Characteristics:**

- Ink-black tonal bands create the working canvas.
- Brass gold marks active navigation and the single primary action.
- Warm-white type and tabular numerals keep records legible.
- Hairline rules organize chronology, columns, and grouped records.
- Compact radii and restrained shadows keep the interface operational.

## Colors

The palette is a warm black-and-gold working system with low-chroma neutrals and restrained semantic signals.

### Primary

- **Ledger Brass Gold** (`gold`, #E0BE45): the primary action, active navigation marker, loading tint, and decisive text link.
- **Highlight Brass** (`gold-light`, #F0D56F): the fine border on gold controls and the brightest edge of the brand accent.
- **Deep Brass** (`gold-dark`, #B89326): a darker accent step for states that need more weight than the base gold.
- **Muted Brass** (`gold-muted`, #746421): a subdued accent step for low-emphasis gold context.

### Secondary

- **Confirmation Green** (`success`, #67A873): completed, open, or healthy states, always paired with a text label.
- **Caution Amber** (`warning`, #D7A13F): unresolved or closing states that need attention without implying failure.
- **Exception Coral** (`error`, #D86B57): errors, overdue work, and destructive or blocked states.
- **Information Blue** (`info`, #7B9FBE): neutral review and transfer-information states.

### Neutral

- **Ink Black** (`background`, #090A08): the app canvas and deepest persistent surface.
- **Ledger Ink** (`background-light`, #0D0F0C): inputs, quiet controls, and inset working areas.
- **Register Surface** (`background-card`, #11130F): primary records, form panels, and bounded sections.
- **Raised Register** (`background-elevated`, #171913): the tonal step reserved for genuinely raised or emphasized surfaces.
- **Deep Band** (`background-subtle`, #0B0D0A): navigation rails, headers, and quieter structural bands.
- **Warm Chalk** (`text-primary`, #F4F1E7): primary labels, titles, and numbers.
- **Quiet Parchment** (`text-secondary`, #B4B4AA): explanatory copy and secondary labels.
- **Dim Register** (`text-tertiary`, #85877D): metadata, placeholders, and de-emphasized states.
- **Ink on Brass** (`text-on-gold`, #14140E): high-contrast content placed on gold actions or markers.
- **Hairline Rule** (`border`, #292C24): routine row, field, and region separation.
- **Strong Rule** (`border-strong`, #41453A): major boundaries and outlined controls.

### Named Rules

**The Brass Scarcity Rule.** Gold marks the current selection, one primary action, or a decisive link; it is never a decorative wash.

## Typography

**Display Font:** System (with the native platform sans-serif fallback)
**Body Font:** System (with the native platform sans-serif fallback)

**Character:** One system workhorse face keeps the product fast, familiar, and multilingual. Hierarchy comes from weight, size, spacing, and alignment rather than from a decorative font pairing.

### Hierarchy

- **Display** (800, 32px, 38px line height): high-level authentication and rare screen-defining statements.
- **Headline** (700, 17px, 22px line height): section headers and grouped ledger regions.
- **Title** (800, 22px, 28px line height): route title, current date, and primary page context.
- **Body** (400, 15px, 22px line height): record content, instructions, and explanatory copy.
- **Label** (700, 12px, 16px line height, 0.4px tracking): compact metadata and control labels; register column labels may use uppercase with wider tracking.

### Named Rules

**The Numeric Trust Rule.** Money, dates, times, and counts always use tabular numerals.

## Layout

The core spacing rhythm is 4, 8, 16, 24, 32, 48, and 64px. Standard page padding is 24px on wide screens and 16px on compact screens. The shared content container is capped at 1240px, readable content at 760px, forms at 560px, and the desktop navigation rail at 216px; the dense dashboard may extend to 1540px when its ledger columns require it.

The adaptive shell uses compact navigation below 1024px and a left rail from 1024px upward. The dashboard uses a single-column phone treatment below 620px and restores its schedule/exception split at 1080px; authentication changes to its two-panel composition at 900px. Mobile navigation is 70px tall, routine controls meet a 48px touch target, and text fields use a 52px minimum height.

Rows align to the work: schedule and exception rows are 88–96px, compact operational rows are at least 66px, and section headers range from 54–70px. On compact screens, content order replaces column compression: the timeline reads first, then exceptions, financial context, and lower operational records.

## Elevation & Depth

The system is flat by default. Tonal shifts and one-pixel rules distinguish resting surfaces; the shared navigation explicitly disables shadow and elevation. Small shadow is nearly imperceptible, while medium and large shadows are reserved for menus, modals, and temporary overlays that genuinely sit above the workspace.

### Shadow Vocabulary

- **Quiet Edge** (`0 1px 1px rgba(0,0,0,0.18)`): minimal web separation where a hairline alone is insufficient.
- **Temporary Overlay** (`0 8px 24px rgba(0,0,0,0.18)`): menus, popovers, and medium transient surfaces.
- **Modal Lift** (`0 18px 48px rgba(0,0,0,0.28)`): large modal or overlay separation only.

### Named Rules

**The Flat Register Rule.** Resting work surfaces stay flat; shadow belongs only to a menu, modal, or temporary overlay.

## Shapes

Corners are compact and functional: 4px for the smallest details, 6px for buttons and compact controls, 8px for fields and ordinary bounded records, 10px for larger grouped controls, and 12px for authentication panels. Circular status dots, badges, and avatars use the full 999px radius. Large structural regions may stay square so their ruled edges join cleanly.

Borders are normally one pixel and low contrast. Stronger rules appear at major region boundaries or on outlined controls; they do not become decorative frames. Content clips only when a bounded control requires it.

## Components

### Buttons

Buttons are direct, compact, and task-specific.

- **Shape:** gently curved functional corners (6px), at least 48px high, with 24px horizontal and 13px vertical padding.
- **Primary:** brass-gold background, ink-on-gold 700-weight label, and a one-pixel highlight-brass border; use once per task context.
- **Hover / Focus:** preserve the same color role, show a visible gold-family focus outline on web, and use restrained opacity feedback for press state.
- **Secondary:** ledger-ink background with a hairline-rule border and warm-chalk label.
- **Outline:** transparent background with a strong-rule border and warm-chalk label.
- **Disabled / Loading:** reduce the control to 50% opacity; replace the label with a spinner using the correct foreground color.

### Cards / Containers

Cards are bounded records, not decorative tiles.

- **Corner Style:** ordinary cards use 8px corners; authentication panels use 12px corners where two regions form one shell.
- **Background:** register-surface for primary records and ledger-ink for inset areas.
- **Shadow Strategy:** flat at rest; use the elevation vocabulary only when the container becomes an overlay.
- **Border:** one-pixel hairline rule.
- **Internal Padding:** 24px for the shared card primitive; dense ledger regions use 16px.

### Inputs / Fields

Inputs feel substantial and native without becoming oversized.

- **Style:** ledger-ink fill, hairline-rule stroke, 6px corners, 16px horizontal padding, and a 52px minimum height.
- **Focus:** a visible gold-family border or outline without glow or layout shift.
- **Error / Disabled:** switch the stroke and supporting copy to exception coral; disabled states reduce opacity while retaining readable text.
- **Labels:** quiet-parchment text at 14px and 600–700 weight, separated from the field by 4–8px.

### Navigation

Wide screens use a 216px role-filtered rail with 48px rows; compact screens use a 70px bottom bar with no more than five role-valid destinations. Icons support short labels. The active item remains transparent and gains one two-pixel gold edge marker—left on the rail, top on the bottom bar—while inactive labels use quiet parchment. Navigation never uses a filled rounded selection tile.

### Day Ledger Row

The signature row aligns time, chronology, event, owner, location, and status into one scan path. A one-pixel vertical register line joins small circular status markers; each status includes a short uppercase label and semantic color. On compact screens, owner and location become tertiary metadata under the event rather than squeezed columns.

## Do's and Don'ts

### Do:

- **Do** use gold for the active navigation marker, the primary action, and short decisive links.
- **Do** organize dense information with one-pixel rules, flat tonal bands, and explicit labels.
- **Do** keep interactive targets at least 48px high and inputs at least 52px high.
- **Do** pair every status color with text and use tabular numerals for dates, times, counts, and UZS.
- **Do** collapse wide ledger columns into a single readable flow on compact screens.

### Don't:

- **Don't** turn operational sections into nested floating card stacks.
- **Don't** use large decorative radii, gradients, texture, heavy blur, or custom-display typography.
- **Don't** fill the active navigation item with a rounded tile; use one gold edge marker.
- **Don't** use shadows on resting content surfaces or color as the only status cue.
- **Don't** introduce a second primary action inside the same task context.

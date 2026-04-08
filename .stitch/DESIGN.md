# Design System: Financials Dashboard — Parchment Ledger
**Project ID:** 7116678432859564628
**Design System Asset:** assets/4a1d3b2f91214b21935a4ede2dc01a85

---

## 1. Visual Theme & Atmosphere

**"The Tactile Editorial"** — Personal finance transformed into a curated journal. Parchment-inspired palette and Inter typography turn financial data into a premium, calm experience. Rejects the "bank spreadsheet" aesthetic in favour of a high-end custom-bound ledger feel.

Key principles:
- **No-Line Rule:** No 1px borders for sectioning. Boundaries defined by background colour shifts (tonal layering) only.
- **Zero Divider Rule:** No dividers between list items. Use 16–24px vertical whitespace instead.
- **Glassmorphism:** Floating elements use `surface_container_lowest` at 80% opacity + 12px `backdrop-blur`.
- **Ambient Shadows Only:** `box-shadow: 0 12px 40px rgba(27, 28, 27, 0.04)` — barely there, like a change in ambient light.

---

## 2. Color Palette & Roles

### Surface Hierarchy (stacked layers of fine paper)
| Token | Hex | Role |
|-------|-----|------|
| `surface` | `#faf9f7` | Base canvas — foundational parchment |
| `surface_container_lowest` | `#ffffff` | Cards & primary interactive modules |
| `surface_container_low` | `#f4f3f1` | Distinct functional areas, recessed sections |
| `surface_container` | `#efeeec` | Secondary content buckets |
| `surface_container_high` | `#e9e8e6` | Active states, floating elements |
| `surface_container_highest` | `#e3e2e0` | Strongest contrast surface |
| `surface_dim` | `#dbdad8` | Dimmed/disabled surfaces |

### Brand & Semantic Colours
| Token | Hex | Role |
|-------|-----|------|
| `primary` | `#006c44` | Deep forest green — CTAs, active nav indicator line |
| `primary_container` | `#4caf7d` | Sage green — income figures, success states, growth sparklines |
| `on_primary` | `#ffffff` | Text on primary buttons |
| `on_primary_container` | `#003d25` | Text on primary container |
| `secondary` | `#615e57` | Warm brown — secondary text, subdued UI |
| `secondary_container` | `#e7e2d9` | Category pills, secondary button fills |
| `tertiary` | `#b02d29` | Deep red — expense figures, loss states |
| `tertiary_container` | `#ff6f65` | Bright red container |
| `on_surface` | `#1b1c1b` | Primary text (near-black, never pure black) |
| `on_surface_variant` | `#3e4942` | Secondary text, metadata |
| `outline` | `#6e7a71` | Subtle structural lines if absolutely needed |
| `outline_variant` | `#bdcabf` | Ghost borders at 15% opacity |
| `background` override | `#EDECEA` | Page background (warm off-white parchment) |
| `primary` override | `#4CAF7D` | Sage green accent |
| `secondary` override | `#37352F` | Warm charcoal |
| `tertiary` override | `#E5534B` | Ember red |
| `error` | `#ba1a1a` | Destructive / critical errors |
| `inverse_primary` | `#77daa4` | Light green for dark backgrounds |

### Signature Gradient
Main CTAs and hero visuals: `linear-gradient(135deg, #006c44 0%, #4caf7d 100%)`

---

## 3. Typography Rules

**Font:** Inter exclusively — used as a Swiss-style editorial tool, not a system fallback.

| Style | Usage | Treatment |
|-------|-------|-----------|
| Display | Big numbers, high-level summaries | `font-semibold`, letter-spacing `-0.02em`, `on_surface` colour |
| Headline | Primary narrative, section titles | `font-semibold`, `on_surface` (#1b1c1b) |
| Title | Card headings | `font-medium` |
| Body | Financial data rows | `secondary` (#615e57), line-height 1.6 |
| Label | Metadata, timestamps | `font-medium`, small, `on_surface_variant` |

**Financial figures:** Always `tabular-nums` — ensures decimal alignment.
**Icons:** 16px, `strokeWidth={1.5}` — wireframe feel, never chunky.

---

## 4. Component Stylings

### Buttons
- **Primary:** `primary` (#006c44) background → `on_primary` (#fff) text, `rounded-2xl` (16px), gradient on hover
- **Secondary:** `secondary_container` (#e7e2d9) background, `on_surface` text — feels integrated
- **Active/Nav pill:** `surface_container_high` (#e9e8e6) or `primary_fixed` (#93f7bf) tint

### Cards / Containers
- `surface_container_lowest` (#ffffff) on `surface` (#faf9f7) background — natural lift without shadow
- Corners: `rounded-2xl` (16px minimum — "everything honed and softened")
- Shadow: `box-shadow: 0 12px 40px rgba(27, 28, 27, 0.04)` — ambient, barely visible
- No internal dividers — use 16–24px vertical spacing between rows

### Inputs / Forms
- Avoid "box" look — use `surface_container_low` (#f4f3f1) background, no border by default
- Focus: background transitions to `surface_container_lowest` (#fff), ghost border at 40% opacity
- Radius: `rounded-xl` (12px)

### Navigation Sidebar
- White card (`surface_container_lowest`), `rounded-2xl`, floating with 12–16px margin from edge
- Active item: pill shape with `secondary_container` (#e7e2d9) or `surface_container_high` fill
- Icons: 16px, `strokeWidth={1.5}`

### Data Visualization
- Sparklines: `primary` (#006c44) for growth, `tertiary` (#b02d29) for loss, 2.5px lines with rounded caps
- Charts: Income in `primary_container` (#4caf7d), Expenses in `tertiary_container` (#ff6f65)
- Category pills: `secondary_container` (#e7e2d9) background, small, `rounded-full`

### Glassmorphism (dropdowns, modals, floating panels)
- `surface_container_lowest` at 80% opacity + `backdrop-blur: 12px`
- Allows warm parchment tones to bleed through ("frosted vellum" effect)

---

## 5. Layout Principles

- **Sidebar:** 220px white card, floats with margin, does NOT flush to edge
- **No-Line boundaries:** Sidebar/content separation via tonal step only, no stroke
- **Asymmetric spacing:** Headers far left, actions far right with intentional dead space between
- **Spacing scale:** 2× multiplier — generous, breathing margins
- **Grid:** 2-column for charts, 3-column for metrics, full-width for tables
- **Page background:** `#EDECEA` (warm off-white parchment, the "desk surface")

---

## 6. Design System Notes for Stitch Generation

> Copy this entire block into every Stitch baton prompt.

```
DESIGN SYSTEM — Parchment Ledger (Financials Dashboard)

Creative direction: "The Tactile Editorial" — premium finance journal aesthetic. Parchment warmth, Inter typography, tonal layering over hard borders. Notion meets a custom-bound ledger.

FONT: Inter throughout.

BACKGROUND: Warm parchment #EDECEA (page), #faf9f7 (surface), #ffffff (cards).
Surface hierarchy: #faf9f7 (base) → #f4f3f1 (sections) → #ffffff (cards/interactive).

KEY COLOURS:
- Primary green (income, success, growth): #006c44 deep / #4caf7d sage
- Red (expenses, loss): #b02d29 deep / #E5534B ember / #ff6f65 container
- Primary text: #1b1c1b (near-black, never pure black)
- Secondary text: #615e57 (warm brown)
- Labels/metadata: #3e4942
- Secondary container (pills, secondary bg): #e7e2d9
- Borders (ghost only, 15% opacity): #bdcabf

SIGNATURE GRADIENT (CTAs, hero): linear-gradient(135deg, #006c44 0%, #4caf7d 100%)

RULES:
- NO 1px borders for sectioning — use tonal background shifts only
- NO dividers between list rows — use 16-24px whitespace
- Glassmorphism on floating elements: 80% opacity + 12px backdrop-blur
- Ambient shadow only: box-shadow 0 12px 40px rgba(27,28,27,0.04)
- Corners: rounded-2xl (16px) minimum on all containers
- Icons: strokeWidth 1.5, 16px
- Financial figures: tabular-nums always

COMPONENTS:
- Cards: white (#ffffff) on parchment, rounded-2xl, ambient shadow
- Nav sidebar: 220px white card, floating with margin, active items on #e7e2d9 pill
- Buttons: primary = deep green #006c44 fill + white text, rounded-2xl
- Inputs: #f4f3f1 bg, no default border, rounded-xl, white bg on focus
- Category pills: #e7e2d9 bg, rounded-full, small
```

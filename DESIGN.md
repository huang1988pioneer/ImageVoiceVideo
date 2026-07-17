---
name: Image Voice Video
description: Dark night-studio console for still → multi-language narrated video
colors:
  signal-teal: "#14b8a6"
  signal-teal-light: "#5eead4"
  signal-teal-deep: "#0f766e"
  sky-accent: "#38bdf8"
  cyan-accent: "#22d3ee"
  night-void: "#070b14"
  night-panel: "#0c1220"
  glass-header: "#0c1220B8"
  ink-primary: "#EBF0F8"
  ink-secondary: "#9AA3B2"
  ink-muted: "#6B7385"
  border-ghost: "#FFFFFF17"
  border-strong: "#FFFFFF24"
  generate-start: "#0d9488"
  generate-mid: "#0891b2"
  generate-end: "#0284c7"
typography:
  display:
    fontFamily: "Inter, Noto Sans TC, Microsoft JhengHei, system-ui, sans-serif"
    fontSize: "1.02rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Inter, Noto Sans TC, Microsoft JhengHei, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.02em"
  title:
    fontFamily: "Inter, Noto Sans TC, Microsoft JhengHei, system-ui, sans-serif"
    fontSize: "0.9rem"
    fontWeight: 700
    lineHeight: 1.35
  body:
    fontFamily: "Inter, Noto Sans TC, Microsoft JhengHei, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Inter, Noto Sans TC, Microsoft JhengHei, system-ui, sans-serif"
    fontSize: "0.68rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.12em"
rounded:
  sm: "8px"
  md: "12px"
  lg: "14px"
  xl: "16px"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  panel-gap: "16px"
  page-inline: "28px"
  card-pad: "18px"
components:
  button-primary:
    backgroundColor: "{colors.generate-start}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    padding: "15px 20px"
    typography: "{typography.headline}"
  button-primary-hover:
    backgroundColor: "{colors.generate-mid}"
    textColor: "#FFFFFF"
  button-segment:
    backgroundColor: "#FFFFFF0A"
    textColor: "{colors.ink-secondary}"
    rounded: "10px"
    padding: "8px 18px"
  button-segment-active:
    backgroundColor: "#14B8A629"
    textColor: "{colors.signal-teal-light}"
    rounded: "10px"
    padding: "8px 18px"
  card-surface:
    backgroundColor: "#FFFFFF0B"
    textColor: "{colors.ink-primary}"
    rounded: "{rounded.lg}"
    padding: "14px 16px"
  input-field:
    backgroundColor: "#FFFFFF0A"
    textColor: "{colors.ink-primary}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
  chip-status:
    backgroundColor: "#14B8A61A"
    textColor: "{colors.signal-teal-light}"
    rounded: "{rounded.pill}"
    padding: "5px 11px"
  dropzone:
    backgroundColor: "#00000040"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
---

# Design System: Image Voice Video

## 1. Overview

**Creative North Star: "The Night Studio Console"**

This is a dark production desk for content creators who need a narrated clip from a still—fast. Surfaces sit on a near-black void (`#070b14`) with translucent glass panels; teal signal lights mark readiness and selection; the live canvas is the stage. Density is moderate on the control rail and generous around the preview: the interface never competes with the frame being authored.

Personality is **fast, clear, capable** (from PRODUCT.md). Type is a single technical sans stack (Inter + Noto Sans TC) for bilingual zh-TW / Latin UI. Motion stays responsive—status pulses, hover lifts on the primary CTA—not scroll choreography. The system explicitly rejects **generic SaaS dashboards**: no sidebar nav forests, no metric cards, no enterprise gray chrome. It is a focused creator workspace with one continuous flow.

**Key Characteristics:**
- Night void base with teal/sky signal accents (restrained color strategy: accent ≤ ~10% of surface)
- Preview-first split: compact left controls, sticky right stage
- Glass header and card surfaces via blur + hairline borders
- One loud primary action: **生成影片**
- Bilingual-ready type; short zh-TW status copy

## 2. Colors

Palette character: deep night neutrals with sparse **Signal Teal**—live/ready energy, never a decorative wash.

### Primary
- **Signal Teal** (`#14b8a6` / `--teal`): Selection, active segments, status dots, accent borders, slider accents. Use sparingly so it reads as “live signal.”
- **Signal Teal Light** (`#5eead4` / `--teal-light`): Active text on dark teal tints, logo icon, badge labels.
- **Signal Teal Deep** (`#0f766e` / `--teal-dark`): Darker support for gradients and pressed depth.

### Secondary
- **Sky Accent** (`#38bdf8` / `--sky`) and **Cyan Accent** (`#22d3ee` / `--cyan`): Ambient glows, logo gradient companion, generate-button spectrum end. Support the primary; never replace it as the default interactive color.

### Neutral
- **Night Void** (`#070b14` / `--bg-base`): Full-app body background.
- **Night Panel** (`#0c1220`): Preview stage and elevated panel tints.
- **Glass Header** (`rgba(12, 18, 32, 0.72)` / `--bg-glass`): Sticky header bar with backdrop blur.
- **Ink Primary** (`rgba(255,255,255,0.92)`): Body and primary UI text. Must maintain ≥4.5:1 on night surfaces.
- **Ink Secondary** (`rgba(255,255,255,0.68)` / `--text-secondary`): Labels and secondary copy.
- **Ink Muted** (`rgba(255,255,255,0.52)` / `--text-muted`): Meta tags and subdued helpers—never sole body text on large blocks.
- **Border Ghost / Strong** (`rgba(255,255,255,0.09)` / `0.14`): Card and control outlines.

### Named Rules
**The Signal Teal Rule.** Teal marks state (ready, selected, recording)—not large fills. If a full panel is teal, the system has failed.

**The Night Void Rule.** Body background stays near-black (`#070b14` or tonal siblings). No cream/sand paper, no purple AI-gradient body.

## 3. Typography

**Display Font:** Inter (with Noto Sans TC, Microsoft JhengHei, system-ui)
**Body Font:** Inter (with Noto Sans TC, Microsoft JhengHei, system-ui)
**Label/Mono Font:** Same stack; labels use weight and tracking, not a second family

**Character:** One geometric-humanist sans for UI chrome and CJK. Tight logo title; quiet section labels; bold CTA. No serif display—this is a console, not a magazine.

### Hierarchy
- **Display** (800, ~1.02rem, lh 1.2, tracking −0.03em): App wordmark only. Keep letter-spacing ≥ −0.04em floor.
- **Headline** (700, 1rem, tracking 0.02em): Primary button label, section emphasis.
- **Title** (700, ~0.9rem): Card headers, result titles.
- **Body** (400, 0.875–0.9rem, lh 1.6): Status bar, helper text, form values. Prefer short lines in the control rail.
- **Label** (700, 0.68rem, tracking 0.12em, uppercase): Section labels (`.section-label`)—use **sparingly** as system chrome for the four workflow steps, not as a kicker on every block.

### Named Rules
**The One Stack Rule.** Do not introduce a second display family for “premium.” Bilingual clarity beats decorative pairing.

**The Label Budget Rule.** Uppercase tracked labels are reserved for the main workflow steps. Do not stamp a kicker above every subsection.

## 4. Elevation

Hybrid: **tonal glass + soft depth**. Depth comes first from translucent surfaces and hairline borders on the night void; shadows are structural for the preview stage and primary CTA, not decorative under every card.

### Shadow Vocabulary
- **Card rest** (`box-shadow: 0 2px 12px rgba(0, 0, 0, 0.25)` / `--shadow-sm`): Default panel lift—subtle.
- **Preview / stage** (`box-shadow: 0 8px 40px rgba(0, 0, 0, 0.45)` / `--shadow`): Frames the hero canvas.
- **CTA ambient** (`0 4px 20px rgba(8, 145, 178, 0.4)` resting; stronger on hover): Teal-tinted glow on **生成影片** only.
- **Signal glow** (`0 0 8px` teal on status dots): Live indicators, not card decoration.

### Named Rules
**The No Ghost-Card Rule.** Never pair a 1px border with a soft wide drop shadow (blur ≥ 16px) on the same control for decoration. Cards: border + light shadow-sm **or** stronger shadow without competing border noise. Preview may use the deep shadow as the stage frame.

**The Flat-By-Default Controls Rule.** Segment buttons and list rows stay flat; elevation appears on hover/active border and tint, not floating shadows.

## 5. Components

Character line: **sharp utility, preview-first**—compact controls; hero is the canvas; generate is the only loud button.

### Buttons
- **Shape:** Moderately rounded (`12px` / `--radius-md`) for primary; `10px` for segments.
- **Primary (生成影片):** Full-width gradient `#0d9488 → #0891b2 → #0284c7`, white 700 text, padding `15px 20px`. Hover: translateY(−2px), brighter filter, deeper teal glow. Disabled: muted flat fill, no glow.
- **Segment / format chips:** Ghost fill `rgba(255,255,255,0.04)`, border ghost; active: teal border + `rgba(20,184,166,0.16)` fill + teal-light text.
- **Focus:** Global `:focus-visible` ring `2px solid rgba(20, 184, 166, 0.7)` offset 2px.

### Chips
- **Status badge (就绪 / 生成中):** Pill (`999px`), teal-tint fill, teal-light text, 6px live dot.
- **Preview meta tags:** Small pills, ghost fill, muted text for resolution / orientation / line counts.

### Cards / Containers
- **Corner Style:** `14px` (`--radius-lg`); keep on the `8 / 12 / 14 / 16` scale.
- **Background:** `rgba(255,255,255,0.045)` + light blur.
- **Border:** `1px solid` ghost; hover → strong. Prefer border alone over border + soft wide shadow.
- **Shadow Strategy:** Minimal on cards; stage chrome stays flat so nested panels don't stack.
- **Internal Padding:** `18px` (`--card-pad-*`); header row with optional step index badge; panel gap `16px`.

### Inputs / Fields
- **Style:** Dark translucent fields, ghost borders, `12px` radius; teal accent-color on sliders.
- **Focus:** Teal focus ring via global focus-visible; active segments use teal border.
- **Dropzone:** Dashed/tonal empty state; active drag = teal wash + outer ring `0 0 0 3px rgba(20,184,166,0.15)`.

### Navigation
- **Sticky glass header** only—no app sidebar. Logo mark (teal gradient tile) + bilingual wordmark + status chip. Mobile: bottom dock for status + generate.

### Signature: Live Preview Stage
- Device-like frame with optional portrait notch; canvas never crops the export aspect.
- Meta row under canvas (resolution, orientation, segment counts).
- This is the product’s visual hero; controls orbit it.

## 6. Do's and Don'ts

### Do:
- **Do** keep one continuous workspace: image → script → tracks → settings → preview → generate.
- **Do** treat the preview as source of truth for framing, subtitles, and orientation.
- **Do** use Signal Teal for state and primary interactive affordances only.
- **Do** maintain readable ink: prefer `--text` / ink-primary for body; bump contrast rather than “elegant gray.”
- **Do** honor `prefers-reduced-motion` for pulses and entrance motion.
- **Do** keep the generate button the single dominant CTA on the screen.

### Don't:
- **Don't** look like a **generic SaaS dashboard**—no sidebar navigation forests, metric cards, or enterprise gray chrome (PRODUCT.md anti-reference).
- **Don't** use gradient text on product chrome (logo wordmark is the only existing exception; do not expand the pattern).
- **Don't** use side-stripe borders (`border-left`/`border-right` > 1px) as accent on cards or alerts.
- **Don't** add decorative CSS grid overlays or diagonal stripe backgrounds as “tech texture.”
- **Don't** stack identical icon+title+text marketing cards; this is a tool, not a landing.
- **Don't** put an uppercase tracked eyebrow on every subsection—workflow step labels only.
- **Don't** ship border-radius ≥ 32px on cards or panels; stay on the `8 / 12 / 16 / 22` scale.
- **Don't** pair 1px border + soft wide shadow (blur ≥ 16px) on the same decorative card (ghost-card ban).

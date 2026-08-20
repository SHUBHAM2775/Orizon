# Design System — [PROJECT_NAME]

This is the resolved visual direction for the product. It exists so the
UI doesn't drift into generic "AI-generated dashboard" territory (cream +
terracotta serif, near-black + neon accent, or broadsheet hairline-rule
layouts — all explicitly avoided here). Every choice below is grounded in
the actual subject: a credit underwriter reviewing a case file and
stamping a decision on it, with a visible paper trail behind every stamp.

## Concept: "The Case File"

An underwriter's real-world workflow is a physical metaphor already —
applications arrive as **case files**, get reviewed, annotated, and
**stamped** (approved / rejected / referred). The product should look and
feel like a well-run records office: precise, paper-grounded, quietly
authoritative — not like a generic SaaS dashboard, and not like a
consumer fintech app.

This is the signature idea the whole system hangs on: **decisions look
like stamps on a ledger page, not toast notifications.**

## Color Tokens

| Token | Hex | Use |
|---|---|---|
| `--paper` | `#EEF2ED` | Base background — a pale ledger-green, not cream. Evoke old accounting ledger paper, not a "warm neutral SaaS" tone. |
| `--ink` | `#1C2622` | Primary text, borders, structural lines — near-black with a green undertone, not pure black. |
| `--ink-muted` | `#5B655F` | Secondary text, captions, metadata. |
| `--brass` | `#B8862E` | Primary accent — used sparingly: active tab, primary buttons, focus states. Reads as an ink-stamp gold/brass, not a generic "brand purple/blue." |
| `--approve` | `#2F6B45` | Semantic: Approved / Pass. Deep stamp-ink green. |
| `--reject` | `#9C2B2B` | Semantic: Hard Reject / Fail. Deep stamp-ink red, not a bright alert red. |
| `--exception` | `#B5791E` | Semantic: Exception / pending human review. Amber, distinct from `--brass` by being slightly more orange. |

Do not introduce additional hues beyond these seven without updating this
file. Status colors (`--approve`, `--reject`, `--exception`) are reserved
exclusively for decision states — never reuse them for unrelated UI (e.g.,
don't use `--approve` green for a generic "success" toast unrelated to a
credit decision).

## Typography

| Role | Typeface direction | Notes |
|---|---|---|
| Display / headings | A slab serif with mechanical, typewritten character (e.g., in the spirit of **Fraunces** at heavier weights, or **Tiempos Headline** if licensed) | Used sparingly — page titles, the decision stamp itself. Not used for body copy. |
| Body / UI | A clean, slightly condensed grotesk (e.g., **Inter** or **IBM Plex Sans**) | Everything else: nav, forms, buttons, table text. |
| Data / numeric | A monospace face (e.g., **IBM Plex Mono** or **JetBrains Mono**) | Reserved for numbers specifically: CIBIL scores, FOIR %, amounts, thresholds, timestamps. This is the detail that makes the product feel like a real financial instrument — numbers should always visually read as data, distinct from prose. |

Type scale: keep it restrained — 4–5 sizes total. Avoid decorative weight
jumps. Numeric/mono elements should be tabular-figures where supported, so
columns of numbers align.

## Layout Principles

- **Sidebar as a folder tab rail**, not a generic icon nav. Each primary
  section (Applications, Exception Queue, Rule Configuration, Audit Log)
  reads as a labeled tab, consistent with the case-file metaphor.
- **Cards read as index cards / case files**: subtle top-edge "tab" detail,
  hairline border in `--ink` at low opacity, generous internal padding.
  Avoid heavy drop shadows or glassmorphism — flat, paper-like depth only
  (a single 1px border + very subtle offset shadow is enough).
- **Data-dense tables** (applicant lists, rule tables, audit logs) should
  use the monospace token for all numeric columns and keep row height
  tight — this is an operations tool, not a marketing page. Density is a
  feature here, not a flaw to soften.
- Avoid rounded-pill buttons and heavy border-radius throughout — use a
  small, consistent radius (2–4px) that reads as "official document,"
  not "consumer app."

### Wireframe sketch — Analyst dashboard

```
┌──────────┬──────────────────────────────────────────────┐
│ [TAB]    │  Applications                    + New Case   │
│ Applica- │  ┌────────────────────────────────────────┐  │
│ tions    │  │ APP1001  Priya S.   ●APPROVED   ₹5,00,000│  │
│          │  ├────────────────────────────────────────┤  │
│ [TAB]    │  │ APP1002  Rohan K.   ●EXCEPTION-L1        │  │
│ Exception│  ├────────────────────────────────────────┤  │
│ Queue    │  │ APP1003  Meera J.   ●HARD REJECT         │  │
│          │  └────────────────────────────────────────┘  │
│ [TAB]    │                                                │
│ Rule     │                                                │
│ Config   │                                                │
│ (admin)  │                                                │
│          │                                                │
│ [TAB]    │                                                │
│ Audit Log│                                                │
└──────────┴──────────────────────────────────────────────┘
```

## Signature Element: The Stamp

When an evaluation resolves, the final decision renders as a **rotated
ink-stamp seal** (CSS-drawn, not an image) — circular or rounded-rect
outline in the relevant semantic color (`--approve` / `--reject` /
`--exception`), slightly rotated (−4° to −7°), with a subtly irregular
"ink" edge (achievable via an SVG filter or a textured border), containing
the decision text in the display typeface. Directly beneath it, in mono
type, the triggering rule/reason code — like a ledger annotation next to
a stamp.

This single moment carries the "boldness" of the design (per design
principles: spend boldness in one place, keep everything else quiet). It
should appear once per evaluation view — do not scatter stamp-style
elements elsewhere in the UI, or it loses its weight.

Motion: the stamp should animate in once, on resolution — a quick
scale/rotate "press down" (150–200ms), not a looping or ambient animation.
Respect `prefers-reduced-motion` — fall back to an instant appearance.

## Explicit anti-patterns (do not do these)

- No cream (`#F4F1EA`) background with terracotta (`#D97757`) accent.
- No near-black background with a single neon accent.
- No numbered `01 / 02 / 03` markers unless the content is a genuine
  ordered sequence (e.g., onboarding steps) — do not use them decoratively
  on dashboard cards.
- No gradient-filled hero sections, no glassmorphism, no floating pill
  navbars.
- No generic "success toast" green for anything other than an Approved
  decision — status colors are reserved, not decorative.

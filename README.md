# Random Aesthetic Generator (Vanilla) — “Neutral Studio”

A portfolio-grade web app that generates cohesive **design-token color palettes** and **font pairings** (display + body) with **contrast guardrails**, **locks**, **history**, **favorites**, **shareable URLs**, and **copy/export** utilities.

✅ **Tech:** Vanilla HTML/CSS/JS (no frameworks, no build tools)  
✅ **Delivery:** One static file — `index.html`  
✅ **Goal:** Demonstrate product polish + design-system thinking + engineering quality

---

## Table of Contents

- [Demo / What it does](#demo--what-it-does)
- [Key Features](#key-features)
- [How to Run](#how-to-run)
- [How to Use](#how-to-use)
- [Generated Design Tokens](#generated-design-tokens)
- [Contrast Guardrails](#contrast-guardrails)
- [Locks (Controlled Randomness)](#locks-controlled-randomness)
- [History & Favorites (Persistence)](#history--favorites-persistence)
- [Shareable Links (URL State)](#shareable-links-url-state)
- [Exports](#exports)
- [Accessibility](#accessibility)
- [Engineering Notes](#engineering-notes)
- [Customization Ideas](#customization-ideas)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Demo / What it does

Click **Generate** to produce:

1. A tokenized palette with roles:
   - `bg`, `surface`, `text`, `muted`, `primary`, `accent`
2. A sensible font pairing:
   - **Display** font for headings
   - **Body** font for paragraphs/UI copy

Everything updates instantly in a **live preview** that behaves like a real UI.

---

## Key Features

### 1) Seeded Generation (Reproducible)

- Each result has a **seed**.
- The seed feeds a deterministic PRNG so the same seed yields the same aesthetic.
- Seed is copyable and included in the share link.

### 2) Token-Based Palette + Live Preview

- Swatches are not just decorative — the palette is applied as **real tokens**.
- Preview includes common UI elements:
  - top nav links
  - hero title + paragraph
  - primary/secondary/accent buttons
  - badge/tag
  - cards on a surface token
  - input field styles

### 3) Guardrails / Quality

- Contrast checks (WCAG-style ratio) for:
  - Text on background
  - Text on surface
  - Text on primary button
- If anything fails, **Auto-fix** becomes available.

### 4) Control Without Killing Randomness

- Lock the **entire palette** (regen fonts only)
- Lock **fonts** (regen palette only)
- Lock individual **token colors** (keep certain roles while regenerating others)
- Generate in:
  - **Light** or **Dark** mode
  - Mood presets: **Minimal, Bold, Pastel, Neon, Earthy**

### 5) Save, History, Favorites

- History of the last **~12** generations
- Favorites with a star button (persisted)
- Click any history/favorite item to **restore**

### 6) Export + Share

- Copy **CSS variables** snippet
- Copy **Google Fonts** snippet (link tags + font-family vars)
- Copy a **shareable link** that recreates the same aesthetic

---

## How to Run

### Option A: Open the file directly

1. Download/clone the project
2. Open `index.html` in your browser

### Option B: Use a small local server (recommended)

Some browsers apply stricter behavior on `file://` pages.

If you have Node.js installed:

```bash
npx serve
```

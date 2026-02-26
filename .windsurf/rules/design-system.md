---
trigger: model_decision
description: Neo-brutalism design system patterns and color palette
---

# Neo-Brutalism Design System Rules

## Color Palette (Dark Mode)
- **Primary Colors:**
  - `--deep-charcoal: #1E1B24` - Main background
  - `--dark-slate: #2A2633` - Panel/secondary background
  - `--neo-black: #000000` - Borders and shadows
- **Accent Colors:**
  - `--electric-yellow: #FDC500` - Primary highlights
  - `--hot-pink: #FF40A0` - Secondary highlights
  - `--electric-purple: #A37DFF` - Tertiary highlights
  - `--neon-green: #39FF14` - Success/active states
- **Text Colors:**
  - `--neo-fg: #FFFFFF` - Primary text
  - `--neo-text: #f8f6ff` - Slightly warmer text
  - `--neo-muted: rgba(248, 246, 255, 0.5)` - Muted text

## Typography
- **Font Family:** 'Space Grotesk', system-ui, -apple-system, sans-serif
- **Font Weights:** 600 (regular), 800 (semibold), 900 (bold)
- **Letter Spacing:** 
  - Headers: -0.03em to -0.02em (tight)
  - Buttons/Labels: 0.05em to 0.1em (expanded)
- **Text Transform:** Uppercase for headers and buttons
- **Text Effects:**
  - Headers: `text-shadow: 4px 4px 0 var(--accent-color)`
  - Headers: `-webkit-text-stroke: 2px var(--neo-black)`

## Border & Shadow System
- **Border Width:** 4px (consistent across all elements)
- **Border Style:** Solid
- **Shadow System:**
  - Default: `box-shadow: 6px 6px 0 var(--neo-black)`
  - Hover: `box-shadow: 10px 10px 0 var(--neo-black)`
  - Active: `box-shadow: 0 0 0 var(--neo-black)`
  - Large elements: `box-shadow: 8px 8px 0 var(--neo-black)`

## Spacing & Layout
- **Grid Background:** `radial-gradient(var(--dark-slate) 2px, transparent 2px)` with 24px spacing
- **Padding:** 
  - Small: 0.5rem to 1rem
  - Medium: 1.5rem to 2rem
  - Large: 2.5rem to 4rem
- **Gap:** 0.5rem to 4rem depending on context
- **Border Radius:** None (sharp corners for brutalist aesthetic)

## Button Patterns
- **Base Styles:**
  - Background: `var(--dark-slate)`
  - Border: `var(--neo-border)`
  - Shadow: `var(--neo-shadow)`
  - Transition: `all 0.2s cubic-bezier(0.25, 1, 0.5, 1)`
- **Hover States:**
  - Transform: `translate(-2px, -2px)`
  - Background: `var(--electric-purple)` or `var(--electric-yellow)`
  - Text: `var(--neo-black)`
- **Active States:**
  - Transform: `translate(4px, 4px)`
  - Shadow: `0 0 0 var(--neo-black)`

## Title Bar Specific
- **Height:** 44px (`--neo-titlebar-height`)
- **Layout:** Grid with `1fr max-content` columns
- **Controls:** 44px × 44px buttons
- **Control Colors:**
  - Default: `#2a2633` background, `#f1f0f2` text
  - Minimize/Maximize hover: `#f7f2c1` background
  - Close hover: `#c73638` background
  - General hover: `var(--electric-purple)` background

## Animation & Transitions
- **View Transitions:** Use View Transitions API for route changes
- **Timing Functions:** 
  - General: `cubic-bezier(0.25, 1, 0.5, 1)`
  - Desktop: `cubic-bezier(0.22, 1, 0.36, 1)`
  - Mobile: `cubic-bezier(0.16, 1, 0.3, 1)`
- **Animation Durations:** 0.2s (interactions), 0.4s-0.55s (page transitions)

## Responsive Design
- **Fluid Typography:** Use `clamp()` for scalable fonts
- **Breakpoint Considerations:** Adjust spacing and sizes for mobile
- **Tauri Specific:** Account for title bar height in layouts

## Component Specific Patterns
- **Cards/Panels:** `var(--dark-slate)` background with borders and shadows
- **Badges:** `var(--electric-yellow)` background with `var(--neo-black)` text
- **Placeholders:** Centered with large text and bordered descriptions
- **Form Elements:** Follow button patterns with appropriate sizing

## Custom Properties Usage
- Always use CSS custom properties for colors and spacing
- Define component-specific variables when needed
- Maintain consistency across all components
- Use `data-tauri="true"` for Tauri-specific styles

---
trigger: file_save
description: Animation patterns and interaction design rules
---

# Animation & Interaction Rules

## View Transitions API
- **Route Changes:** Always use View Transitions API for smooth page transitions
- **Desktop Transitions:** 
  - Duration: 0.5s
  - Timing: `cubic-bezier(0.22, 1, 0.36, 1)`
  - Transform: Vertical movement (translateY)
- **Mobile Transitions:**
  - Duration: 0.55s
  - Timing: `cubic-bezier(0.16, 1, 0.3, 1)`
  - Transform: Horizontal movement with blur effect

## Button Interactions
- **Hover Animation:**
  - Transform: `translate(-2px, -2px)`
  - Shadow: `6px 6px 0 var(--neo-black)`
  - Duration: 0.2s
  - Timing: `cubic-bezier(0.25, 1, 0.5, 1)`
- **Active Animation:**
  - Transform: `translate(4px, 4px)`
  - Shadow: `0 0 0 var(--neo-black)`
  - Immediate response
- **Focus States:** Match hover states with `outline: none`

## Audio Visualization Animations
- **Spectrum Bars:** 
  - Update frequency: 60fps maximum
  - Use `requestAnimationFrame` for smooth updates
  - Height transitions: 0.1s ease-out
- **Waveform Canvas:** 
  - Real-time drawing with minimal lag
  - Use `requestAnimationFrame` for rendering
  - Clear and redraw each frame for smooth animation

## Loading & Progress States
- **Skeleton Screens:** 
  - Subtle shimmer effect
  - Maintain brutalist borders
  - Use `var(--dark-slate)` background
- **Progress Indicators:**
  - Animated progress bars with electric yellow fill
  - Smooth transitions between values
  - Maintain 4px border consistency

## Micro-interactions
- **Icon Animations:**
  - SVG icons: Transform origin at `50% 65%`
  - Scale effects on hover: `scale(1.1)`
  - Color transitions: 0.5s ease
- **Text Effects:**
  - Letter spacing animations for emphasis
  - Color transitions: 0.5s ease
  - Maintain uppercase transformation

## Page Transition Animations
- **Fade Out:** `opacity: 1 → 0`
- **Fade In Scale:** `opacity: 0 → 1` + `scale(0.95 → 1)`
- **Audio Setup Exit:** `scale(1 → 0.96)` + `translateX(0 → -12px)`
- **Audio Setup Enter:** `scale(1.02 → 1)` + `translateX(16 → 0)` + `blur(4px → 0)`

## Performance Guidelines
- **GPU Acceleration:** Use `transform` and `opacity` for animations
- **Avoid Layout Thrashing:** Batch DOM reads and writes
- **Debounce High-Frequency Updates:** Throttle spectrum updates to ~100ms
- **Use CSS Custom Properties:** For dynamic color and spacing changes

## Accessibility Considerations
- **Reduced Motion:** Respect `prefers-reduced-motion` media query
- **Animation Duration:** Keep under 0.6s for most interactions
- **Focus Management:** Maintain focus during transitions
- **Screen Readers:** Ensure animations don't interfere with screen readers

## Responsive Animations
- **Mobile Adjustments:** Reduce animation complexity on smaller screens
- **Touch Targets:** Ensure 44px minimum touch targets
- **Viewport Considerations:** Adjust animation scale based on viewport size

## Debugging & Testing
- **Animation Inspector:** Use browser dev tools to debug animations
- **Performance Monitoring:** Monitor frame rates during complex animations
- **Cross-browser Testing:** Ensure animations work consistently
- **Device Testing:** Test on actual devices, not just emulators

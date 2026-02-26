---
trigger: model_decision
description: Audio visualization and spectrum display patterns
---

# Audio Visualization Rules

## Spectrum Visualization
- **Update Frequency:** Limit to 60fps maximum using `requestAnimationFrame`
- **Bar Count:** Use `SPECTRUM_BAR_COUNT` constant (defined in constants.ts)
- **Data Source:** Use real RMS levels from Rust backend, not random values
- **Distribution:** Create bell-curve distribution from single RMS value
  - Center bars: Full intensity
  - Edge bars: 60% quieter (scale factor)
  - Add subtle random variation (±15%)

## Canvas Rendering
- **Rendering Context:** Use `CanvasRenderingContext2D` for 2D visualizations
- **Clear Method:** Clear canvas each frame for smooth animation
- **Drawing Method:** 
  - Use `fillRect()` for spectrum bars
  - Maintain consistent bar width and spacing
  - Use CSS custom properties for colors
- **Performance:** 
  - Batch draw operations
  - Avoid unnecessary state changes
  - Use `requestAnimationFrame` for timing

## Real-time Audio Levels
- **Event Source:** Listen to `audio-level` events from Tauri backend
- **Event Frequency:** ~100ms intervals (configured in Rust)
- **Level Range:** 0.0 to 1.0 (normalized RMS)
- **Smoothing:** Apply slight smoothing to avoid jittery visualization
- **Zero Level:** Use `SPECTRUM_ZERO_LEVELS` for silent state

## Color Schemes
- **Active State:** `var(--electric-purple)` or `var(--neon-green)`
- **Inactive State:** `var(--dark-slate)` or muted colors
- **Peak Levels:** `var(--electric-yellow)` for high amplitude
- **Background:** `var(--deep-charcoal)` or transparent

## Responsive Design
- **Container Sizing:** Use percentage-based widths
- **Bar Sizing:** Calculate bar width based on container size
- **Mobile Optimization:** Reduce bar count on smaller screens
- **High-DPI Support:** Account for device pixel ratio

## Performance Optimization
- **Throttling:** Throttle updates to prevent excessive rendering
- **Memory Management:** Clean up animation frames on unmount
- **CPU Usage:** Monitor CPU usage during visualization
- **Frame Rate:** Maintain consistent 60fps target

## Interaction Patterns
- **Click Events:** Handle clicks on visualization if needed
- **Hover States:** Show tooltips or additional information
- **Keyboard Navigation:** Support keyboard controls if applicable
- **Touch Support:** Optimize for touch devices

## Accessibility
- **Screen Readers:** Provide alternative text descriptions
- **High Contrast:** Ensure sufficient color contrast
- **Reduced Motion:** Respect motion preferences
- **Alternative Indicators**: Provide non-visual indicators

## Data Processing
- **FFT Analysis:** Use Web Audio API for frequency analysis if needed
- **Smoothing Algorithms:** Apply exponential smoothing to levels
- **Peak Detection:** Identify and highlight peak frequencies
- **Dynamic Range:** Adjust visualization based on input levels

## Component Integration
- **React Hooks:** Use custom hooks for visualization logic
- **State Management:** Manage visualization state efficiently
- **Props Interface:** Define clear props for visualization components
- **Event Handling:** Handle audio events appropriately

## Debugging & Testing
- **Visual Debugging:** Show frequency data in development
- **Performance Monitoring:** Monitor frame rates and CPU usage
- **Unit Testing:** Test visualization algorithms
- **Integration Testing:** Test with real audio data

## Browser Compatibility
- **Canvas API:** Ensure Canvas 2D support
- **RequestAnimationFrame:** Use fallback if needed
- **Performance API:** Monitor performance across browsers
- **Feature Detection:** Detect and handle missing features

## File Structure
```
audio-visualization/
├── components/
│   ├── SpectrumVisualizer.tsx
│   ├── WaveformDisplay.tsx
│   └── AudioLevelMeter.tsx
├── hooks/
│   ├── useAudioVisualization.ts
│   └── useSpectrumData.ts
├── utils/
│   ├── audioProcessing.ts
│   └── visualizationHelpers.ts
└── types/
    └── visualization.ts
```

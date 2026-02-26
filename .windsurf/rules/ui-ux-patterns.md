---
trigger: always_on
description: UI/UX patterns and accessibility rules
---

# UI/UX Patterns Rules

## Custom Title Bar
- **Window Controls**: Ensure minimize/maximize/close work on all platforms
- **Drag Regions**: Use `data-tauri-drag-region` for proper dragging
- **Double-click**: Handle double-click for maximize/restore
- **Visual Feedback**: Provide hover and active states for controls

## Audio Visualization
- **Spectrum Bars**: Use smooth animations for spectrum visualization
- **Performance**: Limit spectrum update frequency to 60fps
- **Responsive**: Adapt spectrum visualization to window size
- **Accessibility**: Provide alternative indicators for visual impairments

## Recording Controls
- **Clear States**: Visually distinguish recording/paused/stopped states
- **Large Touch Targets**: Ensure buttons are large enough for touch
- **Keyboard Navigation**: Support keyboard shortcuts for all controls
- **Visual Feedback**: Provide immediate visual feedback for actions

## Responsive Design
- **Window Sizes**: Support common window sizes and orientations
- **Scaling**: Ensure UI scales properly on high-DPI displays
- **Mobile Considerations**: Prepare for potential mobile deployment
- **Text Readability**: Ensure text is readable at all scales

## Accessibility
- **ARIA Labels**: Add appropriate ARIA labels to all controls
- **Screen Readers**: Ensure screen reader compatibility
- **Keyboard Navigation**: Full keyboard navigation support
- **Color Contrast**: Maintain sufficient color contrast ratios

## Loading States
- **Skeleton Screens**: Use skeleton screens for loading states
- **Progress Indicators**: Show progress for long-running operations
- **Error States**: Provide clear error messages and recovery options
- **Empty States**: Handle empty states gracefully

## Micro-interactions
- **Hover States**: Provide clear hover states for interactive elements
- **Transitions**: Use smooth transitions for state changes
- **Feedback**: Provide immediate feedback for user actions
- **Animations**: Keep animations subtle and performant

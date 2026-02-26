---
trigger: file_save
description: React patterns for audio recording hooks
---

# React Audio Hooks Rules

## Hook Dependencies
- **Dependency arrays**: Include all external dependencies in useCallback/useEffect
- **Stale closures**: Avoid stale closures in audio recording state
- **Cleanup functions**: Always return cleanup functions that stop recording/listeners
- **Ref usage**: Use refs for values that shouldn't trigger re-renders (timers, streams)

## Audio Recording State
- **State updates**: Batch state updates to prevent unnecessary re-renders
- **Status transitions**: Ensure proper state transitions (idle → recording → stopped)
- **Error boundaries**: Handle errors gracefully without crashing the UI
- **Loading states**: Show appropriate loading states during async operations

## Performance
- **Spectrum visualization**: Use requestAnimationFrame for smooth spectrum updates
- **Event throttling**: Throttle high-frequency events (audio levels) to ~100ms
- **Memory cleanup**: Clear object URLs, stop streams, remove event listeners
- **Timer management**: Use clearInterval/setTimeout consistently

## Tauri Integration
- **Event listeners**: Use `listenToAudioLevels()` for real-time audio levels
- **Command calls**: Handle Tauri command errors with try-catch
- **Platform detection**: Use `isTauriRuntime()` for platform-specific behavior
- **File handling**: Use `convertFilePathToUrl()` for recorded files

## TypeScript
- **Type safety**: Strict typing for all Tauri event payloads
- **Interface consistency**: Keep TypeScript interfaces in sync with Rust structs
- **Error types**: Use proper error types for different failure modes
- **Generic types**: Use generics for reusable audio hook patterns

## UI Updates
- **Debounced updates**: Debounce UI updates that don't need to be real-time
- **Conditional rendering**: Only render spectrum when actively recording
- **Accessibility**: Add ARIA labels for audio controls
- **Responsive design**: Ensure spectrum visualization works on different screen sizes

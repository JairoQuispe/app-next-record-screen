---
trigger: always_on
description: Tauri integration patterns and best practices
---

# Tauri Integration Rules

## Event System
- **Event naming**: Use kebab-case for event names (e.g., "audio-level", "capture-started")
- **Event payloads**: All event payloads must be `serde::Serialize` and have corresponding TypeScript interfaces
- **Event cleanup**: Always provide unlisten functions for event listeners in useEffect cleanup
- **Event frequency**: Limit high-frequency events to ~100ms intervals (e.g., audio levels)

## Command Patterns
- **Async commands**: Use `tauri::async_runtime::spawn_blocking` for blocking operations
- **Error handling**: Return `Result<T, AppError>` from all commands
- **State management**: Use `Arc<Mutex<T>>` for shared state between commands
- **AppHandle**: Pass `AppHandle` to commands that need to emit events

## Window Management
- **Custom title bar**: Use dynamic imports for `@tauri-apps/api/window` to avoid bundling issues
- **Window controls**: Ensure minimize/maximize/close buttons work via `getCurrentWindow()`
- **Drag regions**: Use `data-tauri-drag-region` for custom title bar dragging
- **Window state**: Persist window state appropriately

## Asset Protocol
- **Scope restrictions**: Limit asset protocol to specific directories ($TEMP, $HOME, etc.)
- **File URLs**: Use `convertFileSrc()` for proper asset URL conversion
- **Security**: Never expose system files through asset protocol

## Security
- **CSP**: Maintain strict Content Security Policy in tauri.conf.json
- **Permissions**: Validate all file system operations
- **API exposure**: Only expose necessary Tauri APIs to frontend

## Performance
- **withGlobalTauri**: Enable for faster event delivery
- **Bundle size**: Tree-shake Tauri APIs, use dynamic imports for optional features
- **Startup time**: Minimize initialization time for critical features

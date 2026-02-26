---
trigger: always_on
description: Enforce Rust performance patterns for audio capture
---

# Rust Performance Rules for Audio Capture

## Hot Path Optimization
- **No allocations in audio capture loop**: Never allocate in `capture_loop` or `drain_packets`
- **Prefer stack over heap**: Use stack-allocated buffers for temporary audio data
- **Zero-copy patterns**: Use `std::slice::from_raw_parts` instead of copying audio data
- **Avoid Vec::new() in hot paths**: Pre-allocate buffers before capture starts

## WASAPI Specific
- **COM initialization**: Always use `ComGuard` RAII pattern for WASAPI operations
- **Event-driven over polling**: Prefer `AUDCLNT_STREAMFLAGS_EVENTCALLBACK` with `WaitForSingleObject`
- **Minimal blocking**: Never block in audio capture thread, use atomic flags for communication
- **Proper cleanup**: Ensure `LoopbackSession::drop` stops audio client and frees format

## Memory Management
- **Small stack threads**: Use `std::thread::Builder().stack_size(512 * 1024)` for capture threads
- **Avoid Arc<Mutex> in hot paths**: Use `AtomicBool` for stop flags, `Arc` only for shared state
- **Buffer sizes**: Use 256KB buffers for file I/O, 48K sample buffers for audio processing

## Error Handling
- **Fast error paths**: Use `Result` with `?` operator, avoid expensive error formatting in hot paths
- **Structured errors**: Use `AppError` with error codes for frontend communication
- **No panics in capture**: Never panic in audio capture thread, handle errors gracefully

## Dependencies
- **Minimal Windows features**: Only enable required Windows API features in Cargo.toml
- **Avoid heavy crates**: Prefer `std` over external crates for audio processing
- **Release optimizations**: Ensure LTO, codegen-units=1, panic=abort in release profile

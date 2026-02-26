---
trigger: always_on
description: Testing and code quality rules
---

# Testing & Code Quality Rules

## Rust Testing
- **Unit Tests**: Test all audio processing functions
- **Integration Tests**: Test Tauri commands end-to-end
- **Mock WASAPI**: Mock WASAPI for testing on non-Windows platforms
- **Error Paths**: Test all error handling paths

## Frontend Testing
- **Hook Testing**: Test custom hooks with React Testing Library
- **Component Testing**: Test UI components with user interactions
- **Event Testing**: Test Tauri event listeners and emitters
- **Error Boundaries**: Test error handling in components

## Audio Testing
- **Format Validation**: Test audio format parsing and conversion
- **File Writing**: Test WAV file generation and integrity
- **Real-time Processing**: Test audio level calculation accuracy
- **Performance**: Test audio processing performance under load

## Code Quality
- **Clippy**: Pass all clippy lints, deny warnings in CI
- **Rustfmt**: Consistent code formatting
- **TypeScript**: Strict TypeScript configuration
- **ESLint**: Consistent frontend code style

## Integration Testing
- **E2E Tests**: Test complete recording workflows
- **Platform Tests**: Test on Windows, macOS, Linux
- **Permission Tests**: Test various permission states
- **Error Recovery**: Test error recovery scenarios

## Performance Testing
- **Memory Usage**: Monitor memory during long recordings
- **CPU Usage**: Ensure CPU usage stays reasonable
- **File I/O**: Test file writing performance
- **UI Responsiveness**: Test UI remains responsive during recording

## Continuous Integration
- **Automated Tests**: Run all tests on every commit
- **Build Verification**: Ensure builds succeed on all platforms
- **Security Scanning**: Scan for security vulnerabilities
- **Dependency Updates**: Automate dependency updates safely

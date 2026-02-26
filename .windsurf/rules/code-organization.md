---
trigger: file_save
description: Code organization and module boundaries
---

# Code Organization Rules

## Module Boundaries

### Rust Backend (src-tauri/src/)
- **audio/**: All audio-related code
  - `mod.rs`: Module exports and platform stubs
  - `wasapi.rs`: Windows WASAPI implementation
  - `wav.rs`: WAV file writing
  - `capture.rs`: Capture thread management
- **commands.rs**: Tauri command handlers only
- **error.rs**: Error types and handling
- **tray.rs**: System tray implementation
- **lib.rs**: App entry point and state setup

### Frontend (src/)
- **features/**: Feature-specific modules
  - `audio-recorder/`: Complete audio recorder feature
    - `model/`: Business logic and hooks
    - `ui/`: React components
    - `lib/`: Feature-specific utilities
- **shared/**: Cross-feature utilities
  - `lib/runtime/`: Tauri runtime utilities
  - `ui/`: Shared UI components

## File Naming Conventions
- **Rust**: `snake_case.rs` for modules, `PascalCase` for types/structs
- **TypeScript**: `PascalCase.tsx` for components, `camelCase.ts` for utilities
- **CSS**: `kebab-case.css` following component names
- **Tests**: `mod_tests.rs` for Rust modules, `*.test.ts` for TypeScript

## Import Patterns
- **Absolute imports**: Use `@shared/lib/runtime/` for shared utilities
- **Relative imports**: Use relative imports within feature modules
- **Tauri APIs**: Use dynamic imports for optional Tauri features
- **Type exports**: Export types from index files for clean imports

## Dependencies
- **Feature-specific**: Keep dependencies close to where they're used
- **Shared utilities**: Avoid circular dependencies between shared modules
- **Platform code**: Keep platform-specific code behind feature flags
- **External crates**: Minimize external dependencies, prefer std library

## Documentation
- **Rust**: Document all public APIs with examples
- **TypeScript**: JSDoc comments for complex functions
- **Components**: Prop descriptions and usage examples
- **Configuration**: Comment all non-obvious configuration options

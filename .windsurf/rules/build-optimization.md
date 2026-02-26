---
trigger: always_on
description: Build and deployment optimization rules
---

# Build & Optimization Rules

## Cargo Configuration
- **Release profile**: Always enable LTO, codegen-units=1, strip=symbols
- **Panic strategy**: Use `panic = "abort"` in release to reduce binary size
- **Optimization level**: Set `opt-level = "s"` for size optimization
- **Target-specific**: Use different features per target platform

## Dependencies
- **Feature flags**: Minimize features in Windows dependencies
- **Version pinning**: Pin critical dependencies to avoid breaking changes
- **Audit dependencies**: Regularly audit for security vulnerabilities
- **Alternative crates**: Prefer smaller, more focused crates

## Tauri Configuration
- **Asset protocol**: Restrict to specific directories only
- **Window settings**: Optimize default window size and decorations
- **Bundle configuration**: Configure appropriate bundle formats per platform
- **Security settings**: Enable all security features

## Frontend Build
- **Tree shaking**: Ensure unused code is eliminated
- **Code splitting**: Split code by routes/features
- **Asset optimization**: Optimize images and fonts
- **Bundle analysis**: Regularly analyze bundle size

## Performance Monitoring
- **Build time**: Monitor build times and optimize slow steps
- **Binary size**: Track binary size changes
- **Startup time**: Measure and optimize application startup
- **Memory usage**: Monitor memory consumption during recording

## Release Process
- **Version consistency**: Keep package.json and Cargo.toml versions in sync
- **Changelog**: Maintain changelog for releases
- **Testing**: Run full test suite before releases
- **Signing**: Code sign releases for distribution

## Platform-Specific
- **Windows**: Optimize for Windows-specific APIs and features
- **macOS**: Handle macOS-specific requirements
- **Linux**: Consider Linux distribution requirements
- **Mobile**: Prepare for mobile builds if needed

---
trigger: model_decision
description: Security and permission handling rules
---

# Security & Permissions Rules

## Tauri Security
- **CSP Policy**: Maintain strict Content Security Policy
- **Asset Protocol**: Never expose system files broadly
- **API Capabilities**: Only expose necessary Tauri APIs
- **Sandbox**: Keep application sandboxing enabled

## Audio Permissions
- **Microphone**: Properly request and handle microphone permissions
- **System Audio**: Validate system audio capture availability
- **Permission States**: Handle all permission states (granted/denied/prompt)
- **Error Handling**: Graceful degradation when permissions denied

## File System Access
- **Scoped Access**: Limit file access to specific directories
- **File Validation**: Validate file paths and extensions
- **Temporary Files**: Clean up temporary files after use
- **User Consent**: Always get user consent for file operations

## Windows Security
- **COM Security**: Proper COM initialization and cleanup
- **UAC**: Handle UAC elevation appropriately
- **Windows APIs**: Use Windows APIs with proper security context
- **Error Codes**: Handle Windows security error codes

## Data Protection
- **Sensitive Data**: Never log sensitive audio data
- **Temporary Storage**: Encrypt sensitive temporary data
- **Network**: No unnecessary network connections
- **Telemetry**: Opt out of telemetry unless explicitly enabled

## Input Validation
- **File Paths**: Validate all file path inputs
- **User Input**: Sanitize all user inputs
- **API Parameters**: Validate all Tauri command parameters
- **Event Data**: Validate event payload data

## Error Information
- **Error Messages**: Don't expose sensitive system information
- **Stack Traces**: Avoid exposing stack traces in production
- **Debug Info**: Limit debug information in release builds
- **Logging**: Use appropriate logging levels

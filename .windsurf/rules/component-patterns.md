---
trigger: model_decision
description: React component patterns and structure
---

# React Component Patterns Rules

## Component Architecture
- **Feature-Based Structure:** Organize components by feature (audio-recorder/, selection/)
- **Shared Components:** Place reusable components in shared/ui/
- **Component Files:** 
  - ComponentName.tsx (main component)
  - ComponentName.css (styles)
  - ComponentName.test.tsx (tests)
  - index.ts (exports)

## Naming Conventions
- **Components:** PascalCase (e.g., `AudioRecorderPage`, `TitleBar`)
- **CSS Classes:** kebab-case with `neo-` prefix (e.g., `neo-titlebar`, `neo-back-button`)
- **Props:** camelCase with descriptive names
- **Custom Hooks:** camelCase starting with `use` (e.g., `useAudioRecorder`)

## Props Patterns
- **Interface Definitions:** Always define TypeScript interfaces for props
- **Optional Props:** Use `?` for optional props with sensible defaults
- **Children Prop:** Use `ReactNode` type for children prop
- **Event Handlers:** Prefix with `on` (e.g., `onStartRecording`, `onStop`)

## State Management
- **Local State:** Use `useState` for component-specific state
- **Shared State:** Use custom hooks for complex state logic
- **Refs:** Use `useRef` for values that shouldn't trigger re-renders
- **Context:** Use sparingly, prefer prop drilling or state management libs

## Hook Patterns
- **Custom Hooks:** Extract complex logic into custom hooks
- **Dependency Arrays:** Always include all external dependencies
- **Cleanup Functions:** Return cleanup functions from useEffect
- **Memoization:** Use `useMemo` and `useCallback` for performance

## CSS-in-JS Patterns
- **CSS Modules:** Use separate CSS files with consistent naming
- **CSS Custom Properties:** Use for dynamic values and theming
- **Responsive Design:** Use mobile-first approach with media queries
- **Tauri Specific:** Use `[data-tauri="true"]` for desktop-specific styles

## File Organization
```
feature-name/
├── model/
│   ├── hooks/
│   ├── types.ts
│   └── constants.ts
├── ui/
│   ├── ComponentName.tsx
│   ├── ComponentName.css
│   └── ComponentName.test.tsx
├── lib/
│   └── utilities.ts
└── index.ts
```

## Component Patterns
- **Container Components:** Handle data fetching and state management
- **Presentational Components:** Focus on rendering and UI
- **Higher-Order Components:** Use for cross-cutting concerns
- **Compound Components:** For related components that work together

## Error Boundaries
- **Error Boundaries:** Wrap components that might throw errors
- **Error Handling:** Provide graceful error states
- **Error Reporting:** Log errors appropriately
- **User Feedback:** Show user-friendly error messages

## Performance Patterns
- **React.memo:** Use for components that re-render unnecessarily
- **useMemo:** Memoize expensive calculations
- **useCallback:** Memoize event handlers
- **Code Splitting:** Use lazy loading for large components

## Testing Patterns
- **Component Testing:** Use React Testing Library
- **Hook Testing:** Test custom hooks separately
- **Integration Testing:** Test component interactions
- **Accessibility Testing:** Include a11y tests

## Documentation Patterns
- **JSDoc Comments:** Document complex functions and props
- **Storybook:** Use for component documentation
- **README Files:** Document feature-specific patterns
- **Type Definitions:** Use TypeScript for self-documenting code

## Tauri-Specific Patterns
- **Platform Detection:** Use `isTauriRuntime()` for conditional logic
- **Window Controls:** Handle desktop-specific window controls
- **File System:** Use Tauri APIs for file operations
- **Event System:** Use Tauri event system for IPC

## Accessibility Patterns
- **ARIA Labels:** Add appropriate ARIA labels
- **Keyboard Navigation:** Support keyboard shortcuts
- **Focus Management:** Manage focus appropriately
- **Screen Readers:** Ensure screen reader compatibility

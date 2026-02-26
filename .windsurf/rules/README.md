# Windsurf Workspace Rules for recogni

Este conjunto de reglas está diseñado específicamente para el proyecto **recogni**, una aplicación de escritorio para captura de audio construida con Tauri v2 + React + TypeScript.

## Reglas Disponibles

### 🎨 Diseño y Sistema Visual
- **design-system.md** - Sistema de diseño Neo-brutalism, paleta de colores y tipografía
- **animation-interactions.md** - Patrones de animación e interacciones
- **component-patterns.md** - Patrones de componentes React y estructura
- **audio-visualization.md** - Visualización de audio y spectrum display

### 🚀 Rendimiento y Optimización
- **rust-performance.md** - Patrones de rendimiento para Rust en captura de audio
- **build-optimization.md** - Optimización de build y configuración de Cargo

### 🔧 Integración Tauri
- **tauri-integration.md** - Patrones de integración con Tauri y eventos
- **security-permissions.md** - Seguridad y manejo de permisos

### ⚛️ Frontend y React
- **react-audio-hooks.md** - Patrones para hooks de audio en React
- **ui-ux-patterns.md** - Patrones de UI/UX y accesibilidad

### 📁 Organización del Código
- **code-organization.md** - Estructura de módulos y convenciones
- **testing-quality.md** - Testing y calidad del código

## Cómo Funcionan

Las reglas se activan automáticamente según los triggers definidos:
- `file_save` - Se ejecutan al guardar archivos
- `model_decision` - Se ejecutan cuando el modelo toma decisiones
- Puedes agregar más triggers según necesites

## Configuración Recomendada

1. **Activa todas las reglas** para obtener el máximo beneficio
2. **Personaliza los triggers** según tu flujo de trabajo
3. **Ajusta las reglas** según las necesidades específicas del proyecto

## Ejemplos de Aplicación

### Sistema de Diseño Neo-Brutalism
```css
/* ✅ Bien - uso consistente del sistema de diseño */
.neo-button {
  background: var(--dark-slate);
  border: var(--neo-border); /* 4px solid var(--neo-black) */
  box-shadow: var(--neo-shadow); /* 6px 6px 0 var(--neo-black) */
  transition: all 0.2s cubic-bezier(0.25, 1, 0.5, 1);
}

.neo-button:hover {
  transform: translate(-2px, -2px);
  background: var(--electric-purple);
  box-shadow: 6px 6px 0 var(--neo-black);
}
```

### Evitar Asignaciones en Hot Paths
```rust
// ❌ Mal - asignación en el loop de captura
for packet in packets {
    let buffer = vec![0u8; packet_size]; // Aloca cada vez
    // ...
}

// ✅ Bien - pre-alojar antes del loop
let buffer = vec![0u8; max_packet_size];
for packet in packets {
    // usar buffer pre-alojado
}
```

### Manejo Correcto de Eventos Tauri
```typescript
// ✅ Bien - limpieza de event listener
useEffect(() => {
    let unlisten: (() => void) | null = null;
    
    listenToAudioLevels((level) => {
        setSpectrumLevels(calculateSpectrum(level));
    }).then((fn) => {
        unlisten = fn;
    });
    
    return () => {
        unlisten?.();
    };
}, []);
```

### Visualización de Audio con Datos Reales
```typescript
// ✅ Bien - usar RMS real del backend en lugar de random
const startNativeSpectrum = useCallback(() => {
  listenToAudioLevels((level) => {
    // Crear distribución bell-curve desde RMS real
    const mid = (SPECTRUM_BAR_COUNT - 1) / 2;
    const levels = new Array(SPECTRUM_BAR_COUNT);
    for (let i = 0; i < SPECTRUM_BAR_COUNT; i++) {
      const dist = Math.abs(i - mid) / mid;
      const scale = 1.0 - dist * 0.6;
      levels[i] = Math.min(1, level * scale * (0.85 + Math.random() * 0.3));
    }
    setSpectrumLevels(levels);
  });
}, []);
```

## Beneficios Esperados

- **Mejor rendimiento** en captura de audio y visualización
- **Diseño consistente** con sistema Neo-brutalism unificado
- **Animaciones fluidas** con View Transitions API y patrones optimizados
- **Componentes reutilizables** con patrones React bien definidos
- **Código más mantenible** con patrones consistentes
- **Menos bugs** mediante validaciones automáticas
- **Mejor experiencia de desarrollo** con feedback inmediato
- **Calidad consistente** en todo el proyecto

## Personalización

Puedes agregar reglas adicionales según las necesidades específicas del proyecto:
- Reglas para optimización de spectrum visualization
- Validaciones para formatos de audio específicos
- Reglas para manejo de dispositivos de audio
- Validaciones para internacionalización

## Soporte

Si necesitas ayuda para configurar o personalizar estas reglas, consulta la documentación de Windsurf o ajusta los archivos según tus necesidades específicas.

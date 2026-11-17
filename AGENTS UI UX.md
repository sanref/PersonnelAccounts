# AGENTS.md — Arquitectura Angular y Estándares de Diseño UX/UI

Este archivo define las reglas obligatorias de ingeniería frontend, arquitectura de componentes y diseño visual que debes seguir en cada tarea sobre este repositorio.

---

## 1. Arquitectura y Convenciones de Angular

- **Standalone First:** Todos los componentes, directivas y pipes deben ser `standalone: true`. No crees `NgModules`.
- **Estado y Reactividad con Signals:**
  - Usa `signal()`, `computed()` y `effect()` para el estado local y derivado de componentes.
  - Usa `input()`, `input.required()` y `output()` en lugar de los decoradores `@Input()` y `@Output()`.
  - Evita suscripciones manuales (`.subscribe()`) en componentes; usa `toSignal()` o `async` pipe con `DestroyRef` cuando sea necesario.
- **Sintaxis de Plantillas Moderna:** Usa exclusivamente el control de flujo nativo (`@if`, `@for` con `track` obligatorio, `@switch`, `@defer`). No uses `*ngIf`, `*ngFor` ni `*ngSwitch`.
- **Inyección de Dependencias:** Usa la función `inject()` en lugar de inyección por constructor.
- **Detección de Cambios:** Configura `changeDetection: ChangeDetectionStrategy.OnPush` en todos los componentes.
- **Tipado Estricto:** Prohibido el uso de `any`. Define interfaces o tipos explícitos para DTOs, modelos de vista y estados de carga (`'idle' | 'loading' | 'success' | 'error'`).
- **Estructura de Archivos:** Mantén los archivos enfocados y cohesionados (`feature.component.ts`, `.html`, `.scss`). Si un componente supera las 250 líneas, divídelo en subcomponentes presentacionales puros.

---

## 2. Sistema de Diseño UX/UI (Reglas No Negociables)

Diseña con precisión de producto SaaS moderno (referencias: Linear, Stripe, Raycast). Evita cualquier estética de plantilla genérica.

### A. Sistema de Espaciado (Escala de 4px / 8px)
- Usa exclusivamente múltiplos de `4px` (`4, 8, 12, 16, 24, 32, 48, 64px`).
- **Padding interno de tarjetas/contenedores:** `16px` (compacto) o `24px` (estándar).
- **Ley de Proximidad:** Mantén `4px`–`6px` entre una etiqueta (`<label>`) y su campo (`<input>`), `12px`–`16px` entre campos de un mismo grupo y `24px`–`32px` entre secciones independientes.

### B. Superficies, Bordes y Profundidad
- **Prohibido** usar sombras difusas pesadas (`box-shadow` grandes) o gradientes llamativos en fondos.
- Construye la jerarquía mediante contraste sutil de superficie y bordes finos de `1px solid` de baja opacidad (ej. `rgba(255, 255, 255, 0.08)` en dark mode o `#E4E4E7` en light mode).
- **Radios de borde consistentes:** `6px` para botones, inputs y badges; `8px`–`12px` para tarjetas y modales.

### C. Paleta Cromática Restringida (Regla 90-9-1)
- **90% Neutros:** Escala de grises fríos (Zinc/Slate) para fondos, superficies y contenedores. Nunca uses negro puro (`#000000`) ni texto sin contraste mínimo WCAG AA.
- **9% Jerarquía Tipográfica:** Texto primario de alto contraste; etiquetas, descripciones y metadatos en tono apagado (`muted`).
- **1% Color de Acento:** Un único color primario reservado **exclusivamente** para la acción principal (CTA) y estados activos. Los colores semánticos (éxito, advertencia, error) se aplican solo en badges o alertas sutiles con fondo al `10%` de opacidad.

### D. Tipografía y Datos Numéricos
- **3 Niveles de Jerarquía:**
  - Título de vista: `20px`–`24px`, `font-weight: 600`, `letter-spacing: -0.02em`.
  - Título de sección/tarjeta: `14px`–`16px`, `font-weight: 500`.
  - Cuerpo y celdas de tabla: `13px`–`14px`, `font-weight: 400`.
- **Datos Numéricos y Financieros:** Aplica obligatoriamente `font-variant-numeric: tabular-nums` en cualquier cifra, precio, porcentaje, fecha o métrica, y alinéalos siempre a la derecha (`text-align: right`) en tablas y listados.

### E. Tablas y Acciones
- **Tablas sin ruido:** Elimina todos los bordes verticales. Usa únicamente separadores horizontales de `1px`, encabezados en mayúsculas pequeñas (`11px`–`12px`, `letter-spacing: 0.04em`, color apagado) y un cambio sutil de fondo en `:hover`.
- **Un solo CTA primario por vista:** Solo debe existir un botón sólido con el color de acento por pantalla. Las acciones secundarias deben ser `outline` o `ghost`, y las destructivas deben ocultarse tras un menú contextual o requerir confirmación explícita.

---

## 3. Estados Obligatorios de UX en Cada Vista

Nunca implementes únicamente el flujo ideal (*Happy Path*). Toda vista o componente que consuma datos debe resolver explícitamente estos cuatro estados:

1. **Loading (Carga):** Implementa *skeleton loaders* que respeten las dimensiones exactas del contenido final. Evita spinners genéricos centrados en pantalla completa.
2. **Empty State (Vacío):** Muestra un mensaje breve explicando qué falta y un botón de acción directa para crear el primer elemento.
3. **Error:** Muestra un banner discreto *inline* con el motivo legible y un botón de "Reintentar" conectado a la acción correspondiente.
4. **Interacción y Accesibilidad:** Define estados `:hover`, `:focus-visible` (anillo de foco visible para navegación por teclado) y `:disabled` en todo elemento interactivo, además de atributos `aria-label` en botones que solo contengan íconos.

---

## 4. Prohibiciones Explícitas

- **NO** uses datos de relleno tipo *"Lorem ipsum"*, *"John Doe"* o cifras redondas ficticias (*"$10,000.00"*). Usa datos realistas acordes al dominio de la aplicación.
- **NO** sobrecargues tarjetas resumen con más de 3 datos clave; mueve los detalles secundarios a un *drawer* lateral o vista de detalle.
- **NO** agregues animaciones decorativas; usa transiciones funcionales rápidas (`150ms ease-out`) únicamente en cambios de estado.
- **NO** introduzcas librerías externas de UI sin aprobación previa; prioriza CSS moderno (Grid, Flexbox, Custom Properties) o las utilidades ya instaladas en `package.json`.
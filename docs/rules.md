@rules.md
# Reglas del Proyecto y Guía para el Agente (rules.md)

Este documento rige el comportamiento de la IA (Aider/DeepSeek) y los desarrolladores dentro de este proyecto. Es de lectura obligatoria y estricto cumplimiento.

## 1. Filosofía de Trabajo y Prevención de Bloqueos
1. **Verificación de archivos:** Nunca asumas que un archivo existe. Si no está en el contexto, pídelo o créalo.
2. **Prohibido el bucle infinito:** Si entras en un dilema (ej. una regla te prohíbe tocar algo, pero el arreglo lo requiere), NO te quedes pensando en voz alta. Detente inmediatamente, explica en qué punto estás atascado y hazme una pregunta directa.
3. **Gestión de Contexto (Ahorro de Tokens):** Cuando terminemos una funcionalidad y los tests pasen en verde, recuérdame usar `/reset` o `/clear` para limpiar el contexto.
4. **Modo de trabajo:** Usa `/chat-mode architect` para diseñar la lógica de negocio y las reglas de acceso. Usa `/chat-mode code` para implementar y corregir tests.

## 2. Libertad de Edición (Código y Tests)
1. **Libertad Total:** Tienes permiso absoluto para modificar el código fuente (`src/`) y los tests (`tests/`).
2. **Prioridad de la Lógica:** Si un test falla porque el código está mal, corrige el código. Si un test falla porque sus expectativas son lógicamente incorrectas, corrige el test.
3. **Responsabilidad en Tests:** Si modificas un test, DEBES añadir un comentario justo encima explicando por qué se cambió (ej: `// Corregido: La relación debía ser bidireccional`). Nunca borres un test solo para que la suite pase en verde.

## 3. Arquitectura del Stack (Next.js + Payload CMS)
1. **No tocar la carpeta de Payload:** Prohibido modificar archivos dentro de `src/app/(payload)/`. Es territorio administrado por el CMS.
2. **Tipos e IDs:** El ID generado por Payload es un `string`. Nunca asumas que es numérico.
3. **Server Components vs Client Components:** Los Server Components NO pueden contener event handlers (onClick, onChange). Usa `'use client'` solo para componentes de interfaz que necesiten interactividad.
4. **Server Actions y Caché:** 
   - Si una Server Action se llama desde un Client Component dentro de un `useTransition`, NO uses `revalidatePath` en la acción.
   - En su lugar, retorna un resultado serializable y llama a `router.refresh()` en el cliente tras el éxito.
5. **Figma Make:** No modifiques la configuración de `buildFigmaConfig` ni el loader de imágenes (`figma-image-loader.ts`). Si usas `next/image`, pásale directamente la `url` del objeto Media.

## 4. Modelado de Datos en Payload (El Núcleo)
1. **Refactorización Escolar:** El global `school-state` (que contenía todo en JSON) se está eliminando. Estamos migrando a colecciones reales: `Students`, `Groups`, `Attendance`, `Visitors`, `OfficialLists`.
2. **Relaciones:** Usa relaciones (`relationship`) en lugar de strings libres para conectar documentos (ej. un alumno debe apuntar a un grupo real).
3. **Seguridad y Access Rules:**
   - En `ReportTemplates`, elimina el `create: () => true` y restringe la subida a usuarios autenticados.
   - Toda mutación o lectura de datos sensibles debe tener reglas de acceso basadas en los roles (`Directivo`, `Docente`, `Vigilante de Acceso`).
4. **API Local (Local API):**
   - Cuando consultes o modifiques datos desde Server Actions o Server Components, usa siempre `overrideAccess: false`.
   - Pasa el usuario autenticado en la llamada: `payload.find({ ..., user: req.user })`. Esto es obligatorio para que las reglas de acceso funcionen.

## 5. Flujo de Verificación y Calidad
1. **Cero errores de compilación:** Asegúrate de que `pnpm build` o el typecheck pase sin errores de TypeScript.
2. **Validación en Servidor:** Toda mutación expuesta al usuario debe validar y permitir campos específicos (allowlist) en el servidor. No confíes en los datos que vienen del frontend.
3. **Tests:** Aplica el ciclo TDD. Escribe el test, mira cómo falla, implementa el código y itera hasta que pase.
# Instrucciones para Refactorización de Backend - Control Escolar

## Contexto del Proyecto
Estás trabajando en una aplicación de control escolar construida con **Next.js (App Router), Payload CMS 3.0 y Tailwind CSS**. El proyecto se generó inicialmente en Figma Make y actualmente tiene un modelo de datos deficiente que debe ser refactorizado.

El sistema maneja tres roles de usuario (colección `users`):
1. `Directivo` (Admin de la escuela)
2. `Docente` (Profesor)
3. `Vigilante de Acceso` (Portero/Seguridad)

## El Problema Actual
Actualmente, toda la información operativa de la escuela (alumnos, grupos, asistencias, visitantes, docentes) está guardada dentro de un **Global** llamado `school-state` (`src/globals/SchoolState.ts`) usando campos de tipo `json` (blobs). Esto es un antipatrón y debe ser eliminado.

## Tu Objetivo
Refactorizar el backend para usar colecciones relacionales reales en Payload CMS, aplicando las reglas de acceso correctas según el rol del usuario, y actualizando las consultas del frontend para que consuman estas nuevas colecciones.

## Tareas a Realizar

### 1. Eliminar el Global `SchoolState`
- Elimina el archivo `src/globals/SchoolState.ts`.
- Quita `SchoolState` del array de `globals` en `src/payload.config.ts`.
- *Nota: No hay datos existentes que migrar, puedes hacerlo de forma destructiva.*

### 2. Crear las Nuevas Colecciones
Crea los siguientes archivos en `src/collections/` y regístralos en `src/payload.config.ts`:

*   **`Students`**: 
    *   `firstName` (text, required)
    *   `lastName` (text, required)
    *   `matricula` (text, required, unique)
    *   `group` (relationship a `groups`, required)
*   **`Groups`**: 
    *   `name` (text, required) - Ej: "1° A"
    *   `grade` (number, required)
    *   `teacher` (relationship a `users` donde role sea `Docente`)
*   **`Attendance`**:
    *   `student` (relationship a `students`, required)
    *   `date` (date, required)
    *   `status` (select: "Presente", "Ausente", "Retardo", "Justificado", required)
    *   `registeredBy` (relationship a `users`, required)
*   **`Visitors`**:
    *   `name` (text, required)
    *   `reason` (text, required)
    *   `entryTime` (date, required)
    *   `exitTime` (date)
    *   `registeredBy` (relationship a `users`, required)
*   **`OfficialLists`**:
    *   `title` (text, required)
    *   `group` (relationship a `groups`, required)
    *   `file` (upload a `media` o `report-templates`)

### 3. Reglas de Acceso (Access Control)
Aplica reglas de acceso granulares en las nuevas colecciones. Usa como referencia la colección `Users` existente.
- **Directivo**: Puede hacer todo (CRUD completo) en todas las colecciones.
- **Docente**: Puede leer `Students`, `Groups` (solo los suyos), y crear/leer `Attendance`.
- **Vigilante**: Puede leer `Students`, `Groups`, y crear/leer `Visitors`.

### 4. Ajustar `ReportTemplates` (Seguridad)
En `src/collections/ReportTemplates.ts`, actualmente `create: () => true` (público). Cámbialo a `create: ({ req }) => Boolean(req.user)` para evitar subidas anónimas.

### 5. Actualizar el Frontend
- Revisa `src/app/(frontend)/SchoolApp.tsx` y `src/app/(frontend)/school-data-actions.ts`.
- Actualiza las Server Actions y consultas de Payload para que consulten las nuevas colecciones (`payload.find({ collection: 'students', ... })`) en lugar de leer el JSON del global.
- Asegúrate de usar `overrideAccess: false` y pasar el usuario autenticado en las llamadas a la Local API desde Server Actions.
- Si usas Server Actions con `useTransition`, recuerda llamar a `router.refresh()` en el cliente y NO usar `revalidatePath` en la acción.

## Reglas Estrictas de Payload/Next.js (No romper)
1. Usa `getPayload({ config })` solo en Server Components o Server Actions.
2. No modifiques nada dentro de `src/app/(payload)/`.
3. El ID generado por Payload es un `string`, nunca asumas que es numérico.
4. Para las imágenes, si usas `next/image`, pásale siempre la `url` del objeto de Media (`media.url`).
5. Las mutaciones de datos expuestas al usuario deben validar y permitir campos específicos (allowlist) en el servidor.

Por favor, genera el código completo para las colecciones, actualiza el `payload.config.ts`, y muestra cómo debería quedar `school-data-actions.ts`.
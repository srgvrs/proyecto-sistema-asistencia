# Plan Actual - Control Escolar

## Fase 1: Normalización de Base de Datos (Backend) — ✅ Completada
- [x] Eliminar el Global `SchoolState` de `payload.config.ts` y borrar su archivo.
- [x] Crear la colección `Students` (con relación a Groups).
- [x] Crear la colección `Groups` (con relación a Users/Docentes).
- [x] Crear la colección `Attendance` (con relaciones a Students y Users).
- [x] Crear la colección `Visitors` (con relación a Users/Vigilantes).
- [x] Crear la colección `OfficialLists`.
- [x] Actualizar reglas de acceso para `ReportTemplates` (quitar acceso público).

## Fase 1.5: Conectar Frontend a colecciones (Server Actions) — ✅ Completada
- [x] Reescribir school-data-actions.ts con acciones individuales (create, update, delete).
- [x] Ajustar page.tsx para usar loadSchoolStateAction.

## Fase 1.6: Persistencia de Matriz de Asistencia — ✅ Completada
- [x] Agregar campo `marks` (tipo `json`, opcional) a la colección `OfficialLists` en src/collections/OfficialLists.ts.
- [x] Actualizar manualmente `src/payload-types.ts` para agregar el campo `marks` a la interfaz `OfficialList`.
- [x] Ajustar `officializeAttendanceAction` en school-data-actions.ts para que guarde el objeto de `marks` en el documento de `official-lists`.

## Fase 1.7: Conectar UI a las Server Actions — ✅ Completada
- [x] Migrar los componentes de SchoolApp.tsx (StudentManagement, VisitorRegistry, etc.) para que llamen a las nuevas Server Actions en lugar de solo actualizar el estado local.

## Fase 1.8: Colecciones Faltantes (Docentes) — ✅ Completada
- [x] Reutilizar `Users` (rol `Docente`) como fuente de identidad docente; añadir campo `employmentStatus`.
- [x] Crear colección `TeacherAttendance` (asistencia diaria con entrada/salida).
- [x] Crear colección `TeacherJustifications` (justificantes por fecha).
- [x] Reutilizar `Groups.teacher` para la asignación docente ↔ grupos (sin colección puente).
- [x] Reglas de acceso por rol (Directivo / Docente / Vigilante) en las nuevas colecciones.
- [x] Conectar `TeacherCheckIn` y `TeacherManagement` a las Server Actions (`createTeacherAttendanceAction`, `updateTeacherAttendanceAction`, `createTeacherJustificationAction`, `deleteTeacherJustificationAction`, `updateTeacherEmploymentStatusAction`).

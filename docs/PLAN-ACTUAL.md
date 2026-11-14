# Plan Actual - Control Escolar

## Fase 1: Normalización de Base de Datos (Backend) — ✅ Completada
- [x] Eliminar el Global `SchoolState` de `payload.config.ts` y borrar su archivo.
- [x] Crear la colección `Students` (con relación a Groups).
- [x] Crear la colección `Groups` (con relación a Users/Docentes).
- [x] Crear la colección `Attendance` (con relaciones a Students y Users).
- [x] Crear la colección `Visitors` (con relación a Users/Vigilantes).
- [x] Crear la colección `OfficialLists`.
- [x] Actualizar reglas de acceso para `ReportTemplates` (quitar acceso público).

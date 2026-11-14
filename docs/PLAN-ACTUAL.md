# Plan Actual - Control Escolar

## Fase 1: Normalización de Base de Datos (Backend)
- [ ] Eliminar el Global `SchoolState` de `payload.config.ts` y borrar su archivo.
- [ ] Crear la colección `Students` (con relación a Groups).
- [ ] Crear la colección `Groups` (con relación a Users/Docentes).
- [ ] Crear la colección `Attendance` (con relaciones a Students y Users).
- [ ] Crear la colección `Visitors` (con relación a Users/Vigilantes).
- [ ] Crear la colección `OfficialLists`.
- [ ] Actualizar reglas de acceso para `ReportTemplates` (quitar acceso público).
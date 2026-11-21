# Control de Asistencia Escolar

Sistema web para registrar y consultar la asistencia de alumnos y docentes, el acceso de visitantes y los reportes de una escuela. Está pensado para funcionar en red local, sin depender de internet.

> Proyecto escolar en desarrollo. Algunas funciones están en construcción (ver [Estado del proyecto](#estado-del-proyecto)).

## Funciones

- **Grupos y alumnos:** alta de grupos, alta de alumnos y número de lista por grupo.
- **Pase de lista:** el docente registra Presente, Retardo o Falta, guarda borrador y oficializa la lista.
- **Listas oficiales:** consulta de listas cerradas por grupo y mes.
- **Gestión de docentes:** asignación de grupos, baja temporal y justificación de ausencias por día.
- **Asistencia docente:** registro de entrada y salida.
- **Visitantes:** registro de entrada y salida con motivo y a quién visitan.
- **Reportes:** consulta de asistencia y plantillas de reporte.
- **Usuarios y accesos:** cuentas para cada rol, administradas por el directivo.

## Roles

| Rol | Qué puede hacer |
|---|---|
| Directivo | Administra usuarios, grupos, alumnos y docentes; asigna grupos; consulta todo |
| Docente | Pasa lista de sus grupos asignados y consulta sus reportes |
| Vigilante de Acceso | Registra entradas y visitantes |

## Tecnologías

- [Next.js](https://nextjs.org/) 16 (App Router, Turbopack) y React 19
- [Payload CMS](https://payloadcms.com/) v4 (beta) como backend y capa de acceso a datos
- SQLite (`@payloadcms/db-sqlite`), archivo local `school.db`
- Tailwind CSS v4
- TypeScript
- pnpm como gestor de paquetes

## Requisitos

- Node.js (versión LTS reciente)
- pnpm (`npm install -g pnpm`)
- Git

## Instalación

```bash
git clone <URL-DEL-REPOSITORIO>
cd "Control Asistencia"
pnpm install
```

### Variables de entorno

Copia el archivo de ejemplo y complétalo:

```bash
cp .env.example .env
```

En PowerShell:

```powershell
Copy-Item .env.example .env
```

Variables mínimas:

```env
PAYLOAD_SECRET=pon-aqui-una-cadena-larga-y-aleatoria
```

El `PAYLOAD_SECRET` no se sube al repositorio. Pídelo al responsable del proyecto por un canal privado, o genera uno propio para desarrollo.

### Ejecutar en desarrollo

```bash
pnpm dev
```

La app queda en <http://localhost:3000>. El servidor también escucha en la red local (`0.0.0.0`), así que otros equipos de la misma red pueden entrar por la IP de la máquina.

### Primer usuario

La base de datos (`school.db`) no se incluye en el repositorio. Al iniciar por primera vez se crea vacía. Para crear el primer usuario directivo, entra al panel de administración de Payload en `/admin` y crea la cuenta. Después, el directivo crea los demás usuarios desde **Usuarios y accesos**.

## Estructura

```
src/
├── app/(frontend)/     Interfaz y Server Actions (SchoolApp.tsx, school-data-actions.ts)
├── collections/        Colecciones de Payload (Users, Groups, Students, ...)
├── access/             Reglas de acceso por rol
├── lib/                Autenticación y tipos compartidos
├── globals/            Globals de Payload
└── migrations/         Migraciones de base de datos
docs/                   Reglas del proyecto, plan y notas para IA
```

## Notas importantes

- **No dejes un visor de SQLite abierto** (por ejemplo DB Browser) sobre `school.db` mientras corre la app. Bloquea la base y Payload no arranca (`SQLITE_BUSY: database is locked`).
- Si ves `Failed to find Server Action` tras reiniciar el servidor, borra la carpeta `.next` y recarga con Ctrl+Shift+R.
- En Windows, usa PowerShell y pon entre comillas las rutas con paréntesis, por ejemplo `"src/app/(frontend)/SchoolApp.tsx"`.
- Nunca subas `school.db` ni `.env`: contienen datos de alumnos, contraseñas cifradas y secretos.

## Flujo de trabajo en equipo

1. Crea una rama por tarea: `git checkout -b feature/nombre-corto`.
2. Haz commits pequeños con mensajes claros.
3. Abre un pull request hacia `master` y pide revisión a un compañero.
4. Antes de integrar, confirma que la app arranca con `pnpm dev`.

## Estado del proyecto

Funciona: login por rol, grupos, alumnos, pase de lista, asignación de docentes a grupos, listas oficiales, visitantes.



## Licencia

Este proyecto es de carácter académico y se distribuye bajo la [Licencia MIT](LICENSE).

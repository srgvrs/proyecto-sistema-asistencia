import { APIError, type Access, type CollectionConfig } from "payload"

const isDirectivo: Access = ({ req }) => {
  if (req.user?.collection === "admins") return true
  return req.user?.collection === "users" && req.user.role === "Directivo"
}

const directivoOrSelf: Access = ({ req }) => {
  if (req.user?.collection === "admins") return true
  if (req.user?.collection !== "users") return false
  if (req.user.role === "Directivo") return true
  return { id: { equals: req.user.id } }
}

export const Users: CollectionConfig = {
  slug: "users",
  labels: {
    singular: "Usuario del sistema",
    plural: "Usuarios del sistema",
  },
  auth: {
    loginWithUsername: {
      allowEmailLogin: false,
      requireEmail: false,
      requireUsername: true,
    },
    maxLoginAttempts: 5,
    lockTime: 10 * 60 * 1000,
    tokenExpiration: 8 * 60 * 60,
  },
  access: {
    create: isDirectivo,
    delete: isDirectivo,
    read: directivoOrSelf,
    update: isDirectivo,
  },
  admin: {
    group: "Control escolar",
    useAsTitle: "username",
  },
  fields: [
    {
      name: "name",
      label: "Nombre completo",
      type: "text",
      required: true,
    },
    {
      name: "role",
      label: "Rol",
      type: "select",
      required: true,
      options: ["Directivo", "Docente", "Vigilante de Acceso"],
      saveToJWT: true,
    },
    {
      name: "employmentStatus",
      label: "Estado laboral",
      type: "select",
      required: false,
      defaultValue: "Activo",
      options: ["Activo", "Baja temporal"],
      admin: {
        description: "Solo aplica a docentes. Los directivos y vigilantes permanecen como Activo.",
        condition: (data) => data?.role === "Docente",
      },
    },
  ],
  hooks: {
    beforeDelete: [
      async ({ id, req }) => {
        const payload = req.payload
        const currentUser = req.user

        if (currentUser?.collection === "users" && String(currentUser.id) === String(id)) {
          throw new APIError(
            "No puedes eliminar tu propia cuenta mientras tienes la sesión activa.",
            400,
          )
        }

        const target = await payload.findByID({
          collection: "users",
          id,
          depth: 0,
          overrideAccess: true,
          req,
        })

        if (target?.role === "Directivo") {
          const directivos = await payload.find({
            collection: "users",
            where: { role: { equals: "Directivo" } },
            limit: 2,
            depth: 0,
            overrideAccess: true,
            req,
          })
          if (directivos.docs.length <= 1) {
            throw new APIError(
              "No puedes eliminar al último usuario con rol Directivo.",
              400,
            )
          }
        }

        const [teacherAttendance, teacherJustifications, attendance, visitors] = await Promise.all([
          payload.find({
            collection: "teacher-attendance",
            where: { teacher: { equals: id } },
            limit: 1,
            depth: 0,
            overrideAccess: true,
            req,
          }),
          payload.find({
            collection: "teacher-justifications",
            where: {
              or: [
                { teacher: { equals: id } },
                { createdByUser: { equals: id } },
              ],
            },
            limit: 1,
            depth: 0,
            overrideAccess: true,
            req,
          }),
          payload.find({
            collection: "attendance",
            where: { registeredBy: { equals: id } },
            limit: 1,
            depth: 0,
            overrideAccess: true,
            req,
          }),
          payload.find({
            collection: "visitors",
            where: { registeredBy: { equals: id } },
            limit: 1,
            depth: 0,
            overrideAccess: true,
            req,
          }),
        ])

        const hasReferences =
          teacherAttendance.docs.length > 0 ||
          teacherJustifications.docs.length > 0 ||
          attendance.docs.length > 0 ||
          visitors.docs.length > 0

        if (hasReferences) {
          throw new APIError(
            "Este usuario tiene registros asociados. Usa baja temporal en lugar de eliminarlo.",
            400,
          )
        }

        const assignedGroups = await payload.find({
          collection: "groups",
          where: { teacher: { equals: id } },
          limit: 200,
          depth: 0,
          overrideAccess: true,
          req,
        })
        for (const group of assignedGroups.docs) {
          await payload.update({
            collection: "groups",
            id: group.id,
            data: { teacher: null },
            overrideAccess: true,
            req,
          })
        }
      },
    ],
  },
  versions: false,
}

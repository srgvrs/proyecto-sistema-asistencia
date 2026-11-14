import type { Access, CollectionConfig } from "payload"

const isDirectivo: Access = ({ req }) =>
  req.user?.collection === "users" && req.user.role === "Directivo"

const directivoOrSelf: Access = ({ req }) => {
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
  versions: false,
}

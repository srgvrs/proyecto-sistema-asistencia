import type { Access, GlobalConfig } from "payload"

const isAuthenticated: Access = ({ req }) => {
  if (req.user?.collection === "admins") return true
  return req.user?.collection === "users"
}

const isAdmin: Access = ({ req }) => req.user?.collection === "admins"

export const SchoolSettings: GlobalConfig = {
  slug: "school-settings",
  label: "Configuración escolar",
  admin: {
    description: "Datos institucionales que aparecen en pantallas y documentos oficiales.",
  },
  access: {
    read: isAuthenticated,
    update: isAdmin,
  },
  fields: [
    {
      name: "directorName",
      label: "Nombre del director",
      type: "text",
      admin: {
        description: "Se muestra en las listas oficiales y en los PDF generados.",
      },
    },
  ],
}

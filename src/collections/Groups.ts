import type { Access, CollectionConfig } from "payload"
import { isDirectivo, isDocente, isVigilante } from "../access"

const readGroups: Access = ({ req }) => {
  if (req.user?.collection === "admins") return true
  if (req.user?.collection !== "users") return false
  if (req.user.role === "Directivo") return true
  if (req.user.role === "Vigilante de Acceso") return true
  if (req.user.role === "Docente") {
    return { teacher: { equals: req.user.id } }
  }
  return false
}

export const Groups: CollectionConfig = {
  slug: "groups",
  labels: {
    singular: "Grupo",
    plural: "Grupos",
  },
  admin: {
    group: "Control escolar",
    useAsTitle: "name",
    defaultColumns: ["name", "grade", "teacher"],
  },
  access: {
    read: readGroups,
    create: isDirectivo,
    update: isDirectivo,
    delete: isDirectivo,
  },
  fields: [
    {
      name: "name",
      label: "Nombre del grupo",
      type: "text",
      required: true,
      unique: true,
      index: true,
    },
    {
      name: "grade",
      label: "Grado",
      type: "number",
      required: true,
      min: 1,
      max: 6,
    },
    {
      name: "teacher",
      label: "Docente titular",
      type: "relationship",
      relationTo: "users",
      hasMany: false,
      required: false,
      filterOptions: {
        role: { equals: "Docente" },
      },
    },
  ],
  versions: false,
}

import type { Access, CollectionConfig } from "payload"
import { isDirectivo, isDocente, isVigilante } from "../access"

const validateTeacherRole = async ({
  value,
  req,
}: {
  value: unknown
  req: { payload: { findByID: (args: { collection: "users"; id: string; depth?: number }) => Promise<{ role?: string } | null> } }
}) => {
  if (value === null || value === undefined || value === "") return true
  const id = typeof value === "string" ? value : (value as { id?: string })?.id
  if (!id) return "El docente seleccionado no es válido."
  try {
    const user = await req.payload.findByID({ collection: "users", id, depth: 0 })
    if (!user) return "El docente seleccionado no existe."
    if (user.role !== "Docente") return "El usuario asignado debe tener el rol Docente."
    return true
  } catch {
    return "No fue posible validar el docente seleccionado."
  }
}

const readGroups: Access = ({ req }) => {
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
      validate: validateTeacherRole,
    },
  ],
  versions: false,
}

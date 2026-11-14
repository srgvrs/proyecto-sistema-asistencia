import type { Access, CollectionConfig } from "payload"
import { isDirectivo } from "../access"

const readJustifications: Access = ({ req }) => {
  if (req.user?.collection === "admins") return true
  if (req.user?.collection !== "users") return false
  if (req.user.role === "Directivo") return true
  if (req.user.role === "Docente") {
    return { teacher: { equals: req.user.id } }
  }
  return false
}

export const TeacherJustifications: CollectionConfig = {
  slug: "teacher-justifications",
  labels: {
    singular: "Justificante docente",
    plural: "Justificantes docentes",
  },
  admin: {
    group: "Control escolar",
    useAsTitle: "date",
    defaultColumns: ["teacher", "date", "reason", "createdByUser"],
  },
  access: {
    read: readJustifications,
    create: isDirectivo,
    update: isDirectivo,
    delete: isDirectivo,
  },
  fields: [
    {
      name: "teacher",
      label: "Docente",
      type: "relationship",
      relationTo: "users",
      required: true,
      hasMany: false,
      filterOptions: {
        role: { equals: "Docente" },
      },
    },
    {
      name: "date",
      label: "Fecha justificada",
      type: "date",
      required: true,
      admin: {
        date: {
          pickerAppearance: "dayOnly",
        },
      },
    },
    {
      name: "reason",
      label: "Motivo",
      type: "text",
      required: false,
    },
    {
      name: "createdByUser",
      label: "Registrado por",
      type: "relationship",
      relationTo: "users",
      required: true,
      hasMany: false,
    },
  ],
  hooks: {
    beforeValidate: [
      async ({ data, req, operation }) => {
        if (operation !== "create" || !data) return data
        if (!data.createdByUser && req.user?.collection === "users") {
          data.createdByUser = req.user.id
        }
        if (data.teacher && data.date) {
          const teacherId = typeof data.teacher === "string" ? data.teacher : (data.teacher as { id?: string })?.id
          if (teacherId) {
            const existing = await req.payload.find({
              collection: "teacher-justifications",
              where: {
                and: [
                  { teacher: { equals: teacherId } },
                  { date: { equals: data.date } },
                ],
              },
              limit: 1,
              depth: 0,
            })
            if (existing.docs.length > 0) {
              throw new Error("Ya existe un justificante para ese docente en esa fecha.")
            }
          }
        }
        return data
      },
    ],
  },
  versions: false,
}

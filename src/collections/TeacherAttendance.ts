import type { Access, CollectionConfig } from "payload"
import { isDirectivo } from "../access"

const readTeacherAttendance: Access = ({ req }) => {
  if (req.user?.collection !== "users") return false
  if (req.user.role === "Directivo") return true
  if (req.user.role === "Docente") {
    return { teacher: { equals: req.user.id } }
  }
  return false
}

const createTeacherAttendance: Access = ({ req }) => {
  if (req.user?.collection !== "users") return false
  if (req.user.role === "Directivo") return true
  if (req.user.role === "Docente") {
    return { teacher: { equals: req.user.id } }
  }
  return false
}

const updateTeacherAttendance: Access = ({ req }) => {
  if (req.user?.collection !== "users") return false
  if (req.user.role === "Directivo") return true
  if (req.user.role === "Docente") {
    return { teacher: { equals: req.user.id } }
  }
  return false
}

export const TeacherAttendance: CollectionConfig = {
  slug: "teacher-attendance",
  labels: {
    singular: "Asistencia docente",
    plural: "Asistencias docentes",
  },
  admin: {
    group: "Control escolar",
    useAsTitle: "date",
    defaultColumns: ["teacher", "date", "entryTime", "exitTime"],
  },
  access: {
    read: readTeacherAttendance,
    create: createTeacherAttendance,
    update: updateTeacherAttendance,
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
      label: "Fecha",
      type: "date",
      required: true,
      admin: {
        date: {
          pickerAppearance: "dayOnly",
        },
      },
    },
    {
      name: "entryTime",
      label: "Hora de entrada",
      type: "date",
      required: true,
      admin: {
        date: {
          pickerAppearance: "timeOnly",
        },
      },
    },
    {
      name: "exitTime",
      label: "Hora de salida",
      type: "date",
      required: false,
      admin: {
        date: {
          pickerAppearance: "timeOnly",
        },
      },
    },
  ],
  hooks: {
    beforeValidate: [
      async ({ data, req, operation, originalDoc }) => {
        if (!data) return data
        if (operation === "create" && data.teacher && data.date) {
          const teacherId = typeof data.teacher === "string" ? data.teacher : (data.teacher as { id?: string })?.id
          if (teacherId) {
            const existing = await req.payload.find({
              collection: "teacher-attendance",
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
              throw new Error("Ya existe un registro de asistencia para ese docente en esa fecha.")
            }
          }
        }
        if (operation === "update" && originalDoc && data.exitTime && !originalDoc.exitTime) {
          // Allow setting exitTime once; further updates are still permitted for Directivo.
        }
        return data
      },
    ],
  },
  versions: false,
}

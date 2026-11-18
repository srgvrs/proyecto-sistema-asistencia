import type { Access, CollectionConfig } from "payload"
import { isDirectivo, isDocente } from "../access"

const readAttendance: Access = ({ req }) => {
  if (req.user?.collection === "admins") return true
  if (req.user?.collection !== "users") return false
  if (req.user.role === "Directivo" || req.user.role === "Vigilante de Acceso") return true
  if (req.user.role === "Docente") {
    return { "student.group.teacher": { equals: req.user.id } }
  }
  return false
}

const createAttendance: Access = ({ req }) => {
  if (req.user?.collection !== "users") return false
  return req.user.role === "Directivo" || req.user.role === "Docente"
}

const updateAttendance: Access = ({ req }) => {
  if (req.user?.collection !== "users") return false
  if (req.user.role === "Directivo") return true
  if (req.user.role === "Docente") {
    return { registeredBy: { equals: req.user.id } }
  }
  return false
}

export const Attendance: CollectionConfig = {
  slug: "attendance",
  labels: {
    singular: "Asistencia",
    plural: "Asistencias",
  },
  admin: {
    group: "Control escolar",
    useAsTitle: "id",
    defaultColumns: ["student", "date", "status", "registeredBy"],
  },
  access: {
    read: readAttendance,
    create: createAttendance,
    update: updateAttendance,
    delete: isDirectivo,
  },
  fields: [
    {
      name: "student",
      label: "Alumno",
      type: "relationship",
      relationTo: "students",
      required: true,
      hasMany: false,
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
      name: "status",
      label: "Estado",
      type: "select",
      required: true,
      options: ["Presente", "Ausente", "Retardo", "Justificado"],
    },
    {
      name: "registeredBy",
      label: "Registrado por",
      type: "relationship",
      relationTo: "users",
      required: true,
      hasMany: false,
    },
  ],
  versions: false,
}

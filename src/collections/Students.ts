import type { Access, CollectionConfig } from "payload"
import { APIError } from "payload"
import { isDirectivo } from "../access"

const readStudents: Access = ({ req }) => {
  if (req.user?.collection === "admins") return true
  if (req.user?.collection !== "users") return false
  if (req.user.role === "Directivo" || req.user.role === "Vigilante de Acceso") return true
  if (req.user.role === "Docente") {
    return { "group.teacher": { equals: req.user.id } }
  }
  return false
}

const createStudents: Access = ({ req }) => {
  if (req.user?.collection === "admins") return true
  if (req.user?.collection !== "users") return false
  return req.user.role === "Directivo" || req.user.role === "Docente"
}

export const Students: CollectionConfig = {
  slug: "students",
  labels: {
    singular: "Alumno",
    plural: "Alumnos",
  },
  admin: {
    group: "Control escolar",
    useAsTitle: "matricula",
    defaultColumns: ["matricula", "paternalSurname", "maternalSurname", "firstName", "group"],
  },
  access: {
    read: readStudents,
    create: createStudents,
    update: isDirectivo,
    delete: isDirectivo,
  },
  hooks: {
    beforeValidate: [
      async ({ data, req }) => {
        if (req.user?.collection !== "users" || req.user.role !== "Docente") return data
        const groupId = data?.group
        if (groupId === undefined || groupId === null) {
          throw new APIError("Debes seleccionar un grupo.", 403)
        }
        const group = await req.payload.findByID({
          collection: "groups",
          id: groupId,
          depth: 0,
          overrideAccess: true,
          req,
        })
        const teacherId = group?.teacher && typeof group.teacher === "object"
          ? group.teacher.id
          : group?.teacher
        if (String(teacherId ?? "") !== String(req.user.id)) {
          throw new APIError("Solo puedes agregar alumnos a tus grupos asignados.", 403)
        }
        return data
      },
    ],
  },
  fields: [
    {
      name: "firstName",
      label: "Nombre(s)",
      type: "text",
      required: true,
    },
    {
      name: "paternalSurname",
      label: "Apellido paterno",
      type: "text",
      required: true,
    },
    {
      name: "maternalSurname",
      label: "Apellido materno",
      type: "text",
      required: false,
    },
    {
      name: "lastName",
      label: "Apellidos",
      type: "text",
      required: false,
    },
    {
      name: "matricula",
      label: "Matrícula",
      type: "text",
      required: true,
      unique: true,
      index: true,
    },
    {
      name: "group",
      label: "Grupo",
      type: "relationship",
      relationTo: "groups",
      required: true,
      hasMany: false,
    },
  ],
  versions: false,
}

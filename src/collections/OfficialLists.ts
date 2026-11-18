import type { Access, CollectionConfig } from "payload"
import { isDirectivo, isStaff } from "../access"

const readOfficialList: Access = ({ req }) => {
  if (req.user?.collection === "admins") return true
  if (req.user?.collection !== "users") return false
  if (req.user.role === "Directivo" || req.user.role === "Vigilante de Acceso") return true
  if (req.user.role === "Docente") {
    return { "group.teacher": { equals: req.user.id } }
  }
  return false
}

const updateOfficialList: Access = ({ req }) => {
  if (req.user?.collection === "admins") return true
  if (req.user?.collection !== "users") return false
  if (req.user.role === "Directivo") return true
  if (req.user.role === "Docente") {
    return { "group.teacher": { equals: req.user.id } }
  }
  return false
}

export const OfficialLists: CollectionConfig = {
  slug: "official-lists",
  labels: {
    singular: "Lista oficial",
    plural: "Listas oficiales",
  },
  admin: {
    group: "Control escolar",
    useAsTitle: "title",
    defaultColumns: ["title", "group", "file"],
  },
  access: {
    read: readOfficialList,
    create: isStaff,
    update: updateOfficialList,
    delete: isDirectivo,
  },
  hooks: {
    beforeValidate: [
      async ({ data, req, operation }) => {
        if (operation !== "create") return data
        if (req.user?.collection === "admins") return data
        if (req.user?.collection !== "users") {
          throw new Error("No tienes permiso para crear listas oficiales.")
        }
        if (req.user.role === "Directivo") return data
        if (req.user.role !== "Docente") {
          throw new Error("No tienes permiso para crear listas oficiales.")
        }
        const groupId = data?.group
        if (groupId === null || groupId === undefined) {
          throw new Error("La lista oficial debe tener un grupo.")
        }
        const group = await req.payload.findByID({
          collection: "groups",
          id: typeof groupId === "object" ? (groupId as { id: number }).id : groupId,
          depth: 0,
          overrideAccess: true,
        })
        const teacherId =
          group?.teacher && typeof group.teacher === "object"
            ? (group.teacher as { id: number }).id
            : group?.teacher
        if (String(teacherId ?? "") !== String(req.user.id)) {
          throw new Error("Solo puedes crear listas oficiales de tus grupos asignados.")
        }
        return data
      },
    ],
  },
  fields: [
    {
      name: "title",
      label: "Título",
      type: "text",
      required: true,
    },
    {
      name: "group",
      label: "Grupo",
      type: "relationship",
      relationTo: "groups",
      required: true,
      hasMany: false,
    },
    {
      name: "file",
      label: "Archivo",
      type: "upload",
      relationTo: "report-templates",
      required: false,
    },
    {
      name: "marks",
      label: "Matriz de asistencia",
      type: "json",
      required: false,
      admin: {
        description:
          "Mapa de marcas por alumno y fecha. Ej: { \"<studentId>\": { \"2026-09-23\": \".\" } }",
      },
    },
    {
      name: "roster",
      label: "Alumnos de la lista",
      type: "json",
      required: false,
      admin: {
        description:
          "Arreglo de alumnos al momento de oficializar. Ej: [{ \"studentId\": \"1\", \"name\": \"...\", \"listNumber\": 1 }]",
      },
    },
    {
      name: "teacherName",
      label: "Docente que oficializó",
      type: "text",
      required: false,
    },
  ],
  versions: false,
}

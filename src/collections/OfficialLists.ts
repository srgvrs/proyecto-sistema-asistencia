import type { CollectionConfig } from "payload"
import { isDirectivo, isStaff } from "../access"

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
    read: isStaff,
    create: isDirectivo,
    update: isDirectivo,
    delete: isDirectivo,
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
  ],
  versions: false,
}

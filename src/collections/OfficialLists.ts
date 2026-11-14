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
  ],
  versions: false,
}

import type { Access, CollectionConfig } from "payload"

const isDirectivo: Access = ({ req }) => {
  if (req.user?.collection === "admins") return true
  if (req.user?.collection !== "users") return false
  return req.user.role === "Directivo"
}

const deny: Access = () => false

export const OfficialListCorrections: CollectionConfig = {
  slug: "official-list-corrections",
  labels: {
    singular: "Corrección de lista oficial",
    plural: "Correcciones de listas oficiales",
  },
  admin: {
    group: "Control escolar",
    useAsTitle: "date",
    defaultColumns: ["officialList", "date", "student", "previousStatus", "newStatus", "correctedBy"],
  },
  access: {
    read: isDirectivo,
    create: isDirectivo,
    update: deny,
    delete: deny,
  },
  fields: [
    {
      name: "officialList",
      label: "Lista oficial",
      type: "relationship",
      relationTo: "official-lists",
      required: true,
      hasMany: false,
      index: true,
    },
    {
      name: "date",
      label: "Fecha",
      type: "text",
      required: true,
    },
    {
      name: "student",
      label: "Alumno",
      type: "relationship",
      relationTo: "students",
      required: true,
      hasMany: false,
    },
    {
      name: "previousStatus",
      label: "Estado anterior",
      type: "select",
      required: true,
      options: ["Presente", "Retardo", "Falta"],
    },
    {
      name: "newStatus",
      label: "Estado nuevo",
      type: "select",
      required: true,
      options: ["Presente", "Retardo", "Falta"],
    },
    {
      name: "correctedBy",
      label: "Corregido por",
      type: "relationship",
      relationTo: "users",
      required: true,
      hasMany: false,
    },
    {
      name: "correctedAt",
      label: "Fecha de corrección",
      type: "date",
      required: true,
    },
  ],
  versions: false,
}

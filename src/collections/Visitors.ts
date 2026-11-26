import type { Access, CollectionConfig } from "payload"
import { isDirectivo, isVigilante } from "../access"

const readVisitors: Access = ({ req }) => {
  if (req.user?.collection === "admins") return true
  if (req.user?.collection !== "users") return false
  if (req.user.active === false) return false
  return req.user.role === "Directivo" || req.user.role === "Vigilante de Acceso"
}

const createVisitors: Access = ({ req }) => {
  if (req.user?.collection !== "users") return false
  if (req.user.active === false) return false
  return req.user.role === "Directivo" || req.user.role === "Vigilante de Acceso"
}

const updateVisitors: Access = ({ req }) => {
  if (req.user?.collection !== "users") return false
  if (req.user.active === false) return false
  if (req.user.role === "Directivo") return true
  if (req.user.role === "Vigilante de Acceso") {
    return { registeredBy: { equals: req.user.id } }
  }
  return false
}

export const Visitors: CollectionConfig = {
  slug: "visitors",
  labels: {
    singular: "Visitante",
    plural: "Visitantes",
  },
  admin: {
    group: "Control escolar",
    useAsTitle: "name",
    defaultColumns: ["name", "reason", "entryTime", "exitTime"],
  },
  access: {
    read: readVisitors,
    create: createVisitors,
    update: updateVisitors,
    delete: isDirectivo,
  },
  fields: [
    {
      name: "name",
      label: "Nombre del visitante",
      type: "text",
      required: true,
    },
    {
      name: "reason",
      label: "Motivo",
      type: "text",
      required: true,
    },
    {
      name: "entryTime",
      label: "Hora de entrada",
      type: "date",
      required: true,
      admin: {
        date: {
          pickerAppearance: "dayAndTime",
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
          pickerAppearance: "dayAndTime",
        },
      },
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

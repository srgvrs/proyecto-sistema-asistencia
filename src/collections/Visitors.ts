import type { Access, CollectionConfig } from "payload"
import { isDirectivo, isVigilante } from "../access"

const readVisitors: Access = ({ req }) => {
  if (req.user?.collection === "admins") return true
  if (req.user?.collection !== "users") return false
  if (req.user.role === "Directivo" || req.user.role === "Vigilante de Acceso") return true
  if (req.user.role === "Docente") return { hostUser: { equals: req.user.id } }
  return false
}

const createVisitors: Access = ({ req }) => {
  if (req.user?.collection !== "users") return false
  return (
    req.user.role === "Directivo" ||
    req.user.role === "Vigilante de Acceso" ||
    req.user.role === "Docente"
  )
}

const updateVisitors: Access = ({ req }) => {
  if (req.user?.collection !== "users") return false
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
      name: "host",
      label: "Persona o área visitada",
      type: "text",
      required: false,
    },
    {
      name: "hostUser",
      label: "Docente o directivo visitado",
      type: "relationship",
      relationTo: "users",
      required: false,
      hasMany: false,
      filterOptions: {
        role: { in: ["Docente", "Directivo"] },
      },
      admin: {
        description: "Permite al docente consultar y autorizar solo sus propias visitas.",
      },
    },
    {
      name: "authorizationStatus",
      label: "Estado de autorización",
      type: "select",
      required: false,
      options: ["Pendiente", "Autorizada", "Rechazada"],
      admin: {
        readOnly: true,
        description: "Lo fija el servidor. El vigilante no puede modificarlo.",
      },
    },
    {
      name: "authorizedBy",
      label: "Autorizado por",
      type: "relationship",
      relationTo: "users",
      required: false,
      hasMany: false,
      admin: {
        readOnly: true,
      },
    },
    {
      name: "authorizedByName",
      label: "Nombre de quien autorizó",
      type: "text",
      required: false,
      admin: {
        readOnly: true,
      },
    },
    {
      name: "authorizedAt",
      label: "Fecha y hora de autorización",
      type: "date",
      required: false,
      admin: {
        readOnly: true,
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

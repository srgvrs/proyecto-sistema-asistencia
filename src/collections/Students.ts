import type { CollectionConfig } from "payload"
import { isDirectivo, isStaff } from "../access"

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
    read: isStaff,
    create: isDirectivo,
    update: isDirectivo,
    delete: isDirectivo,
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

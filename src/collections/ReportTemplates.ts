import type { CollectionConfig } from "payload"

export const ReportTemplates: CollectionConfig = {
  slug: "report-templates",
  labels: {
    singular: "Plantilla de reporte",
    plural: "Plantillas de reportes",
  },
  admin: {
    group: "Control escolar",
    useAsTitle: "title",
  },
  access: {
    create: ({ req }) => Boolean(req.user),
    read: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) => Boolean(req.user),
  },
  fields: [
    {
      name: "title",
      label: "Nombre",
      type: "text",
      required: true,
    },
  ],
  upload: {
    mimeTypes: [
      "text/csv",
      "text/plain",
      "application/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/pdf",
    ],
  },
}

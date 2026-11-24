import type { CollectionConfig } from 'payload'

export const SchoolYearClosures: CollectionConfig = {
  slug: 'school-year-closures',
  admin: {
    useAsTitle: 'cycleLabel',
    defaultColumns: ['cycleLabel', 'closedAt', 'closedBy', 'promoted', 'graduated'],
  },
  access: {
    create: ({ req: { user } }) => user?.role === 'Directivo',
    read: ({ req: { user } }) => user?.role === 'Directivo',
    update: () => false,
    delete: () => false,
  },
  fields: [
    {
      name: 'cycleLabel',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'closedAt',
      type: 'date',
      required: true,
    },
    {
      name: 'closedBy',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      hasMany: false,
    },
    {
      name: 'promoted',
      type: 'number',
      required: true,
      defaultValue: 0,
      min: 0,
    },
    {
      name: 'graduated',
      type: 'number',
      required: true,
      defaultValue: 0,
      min: 0,
    },
    {
      name: 'createdGroups',
      type: 'number',
      required: true,
      defaultValue: 0,
      min: 0,
    },
    {
      name: 'errors',
      type: 'json',
      required: false,
    },
  ],
}

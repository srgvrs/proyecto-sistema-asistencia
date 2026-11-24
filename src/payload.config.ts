import path from 'path'
import { buildConfig } from 'payload'
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { es as adminLanguage } from '@payloadcms/translations/languages/es'
import { fileURLToPath } from 'url'
import { Admins } from './collections/Admins'
import { Media } from './collections/Media'
import { Folders } from './collections/Folders'
import { Tags } from './collections/Tags'
import { ReportTemplates } from './collections/ReportTemplates'
import { Users } from './collections/Users'
import { Students } from './collections/Students'
import { Groups } from './collections/Groups'
import { Attendance } from './collections/Attendance'
import { Visitors } from './collections/Visitors'
import { OfficialLists } from './collections/OfficialLists'
import { OfficialListCorrections } from './collections/OfficialListCorrections'
import { TeacherAttendance } from './collections/TeacherAttendance'
import { TeacherJustifications } from './collections/TeacherJustifications'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  secret: process.env.PAYLOAD_SECRET || 'super-secret-local-key-12345',
  db: sqliteAdapter({
    client: {
      url: process.env.DATABASE_URI || 'file:./school.db',
    },
  }),
  admin: {
    user: Admins.slug,
    constrainWidth: true,
    dashboard: {
      widgets: [],
      defaultLayout: [
        { widgetSlug: 'activity', width: 'full' },
        { widgetSlug: 'collections', width: 'full' },
      ],
    },
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  i18n: {
    fallbackLanguage: 'es',
    supportedLanguages: { 'es': adminLanguage },
  },
  collections: [
    Admins,
    Media,
    Folders,
    Tags,
    ReportTemplates,
    Users,
    Students,
    Groups,
    Attendance,
    Visitors,
    OfficialLists,
    OfficialListCorrections,
    TeacherAttendance,
    TeacherJustifications,
  ],
  globals: [],
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  localization: {
    locales: [{ code: 'en', label: 'English' }],
    fallback: true,
    defaultLocale: 'en',
  },
  plugins: [],
})

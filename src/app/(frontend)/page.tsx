import config from "@payload-config"
import { connection } from "next/server"
import { getPayload } from "payload"
import SchoolApp, { type ReportTemplate } from "./SchoolApp"
import { appAuth, listUsersForDirectivo, toAppUserSummary } from "@/lib/app-auth"
import type { SchoolStateData } from "@/lib/school-data-types"

export default async function HomePage() {
  await connection()
  const payload = await getPayload({ config })
  const currentUser = await appAuth.currentUser()
  const users = currentUser ? await listUsersForDirectivo(currentUser) : []
  const schoolState = currentUser
    ? await payload.findGlobal({
        slug: "school-state",
        overrideAccess: false,
        user: currentUser,
      })
    : null
  const templates = await payload.find({
    collection: "report-templates",
    limit: 20,
    sort: "-createdAt",
    overrideAccess: false,
  })

  return (
    <SchoolApp
      initialSession={currentUser ? toAppUserSummary(currentUser) : null}
      initialSchoolState={schoolState as unknown as SchoolStateData | null}
      initialTemplates={templates.docs as ReportTemplate[]}
      initialUsers={users}
    />
  )
}

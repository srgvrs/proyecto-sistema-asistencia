import "server-only"

import config from "@payload-config"
import { cookies } from "next/headers"
import { getPayload, JWTAuthentication } from "payload"
import type { User } from "@/payload-types"
import type { AppUserSummary } from "@/lib/app-user-types"

const APP_SESSION_COOKIE = "app-session"

export const toAppUserSummary = (user: User): AppUserSummary => ({
  id: String(user.id),
  name: user.name,
  role: user.role,
  username: user.username,
})

export const createAppAuth = (collection: "users") => ({
  async currentUser() {
    const token = (await cookies()).get(APP_SESSION_COOKIE)?.value
    if (!token) return null

    const payload = await getPayload({ config })
    const authHeaders = new Headers({ Authorization: `JWT ${token}` })
    const { user } = await JWTAuthentication({
      headers: authHeaders,
      payload,
      strategyName: "local-jwt",
    })
    if (!user || user.collection !== collection) return null
    return user as User
  },

  async login(username: string, password: string) {
    const payload = await getPayload({ config })
    const result = await payload.login({
      collection,
      data: { username, password },
      overrideAccess: false,
    })
    if (!result.token || !result.user) throw new Error("No fue posible iniciar la sesión.")

    const cookieStore = await cookies()
    cookieStore.set(APP_SESSION_COOKIE, result.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: result.exp ? new Date(result.exp * 1000) : undefined,
      maxAge: result.exp ? undefined : 8 * 60 * 60,
    })
    return result.user as User
  },

  async logout() {
    const cookieStore = await cookies()
    cookieStore.delete(APP_SESSION_COOKIE)
  },
})

export const appAuth = createAppAuth("users")

export async function listUsersForDirectivo(user: User) {
  if (user.role !== "Directivo") return []
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: "users",
    limit: 100,
    sort: "username",
    overrideAccess: false,
    user,
  })
  return result.docs.map(toAppUserSummary)
}

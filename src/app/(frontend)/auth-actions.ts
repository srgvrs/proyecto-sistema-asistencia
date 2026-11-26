"use server"

import config from "@payload-config"
import { getPayload } from "payload"
import { appAuth, listUsersForDirectivo, toAppUserSummary } from "@/lib/app-auth"
import type { AppUserSummary, Role } from "@/lib/app-user-types"

type AuthResult =
  | { ok: true; user: AppUserSummary; users: AppUserSummary[] }
  | { ok: false; error: string }

const validRoles: Role[] = ["Directivo", "Docente", "Vigilante de Acceso"]

export async function loginAction(username: string, password: string): Promise<AuthResult> {
  const normalizedUsername = username.trim().toLowerCase()
  if (!normalizedUsername || !password) return { ok: false, error: "Ingresa tu usuario y contraseña." }

  try {
    const user = await appAuth.login(normalizedUsername, password)
    const users = await listUsersForDirectivo(user)
    return { ok: true, user: toAppUserSummary(user), users }
  } catch {
    return { ok: false, error: "Usuario o contraseña incorrectos. Verifica tus datos." }
  }
}

export async function logoutAction() {
  await appAuth.logout()
  return { ok: true }
}

export async function createUserAction(input: {
  name: string
  username: string
  password: string
  role: Role
}): Promise<{ ok: true; user: AppUserSummary } | { ok: false; error: string }> {
  const currentUser = await appAuth.currentUser()
  if (!currentUser || currentUser.role !== "Directivo") {
    return { ok: false, error: "No tienes permiso para crear usuarios." }
  }

  const name = input.name.trim()
  const username = input.username.trim().toLowerCase()
  if (!name || !username || !input.password || !validRoles.includes(input.role)) {
    return { ok: false, error: "Completa todos los campos con información válida." }
  }
  if (!/^[a-z0-9._-]{4,30}$/.test(username)) {
    return { ok: false, error: "El usuario debe tener entre 4 y 30 caracteres: letras, números, punto, guion o guion bajo." }
  }
  if (input.password.length < 8) {
    return { ok: false, error: "La contraseña debe tener al menos 8 caracteres." }
  }

  try {
    const payload = await getPayload({ config })
    const user = await payload.create({
      collection: "users",
      data: { name, username, password: input.password, role: input.role },
      overrideAccess: false,
      user: currentUser,
    })
    return { ok: true, user: toAppUserSummary(user) }
  } catch (error) {
    const message = error instanceof Error && /username|usuario|unique|único/i.test(error.message)
      ? "Ese nombre de usuario ya está registrado."
      : "No fue posible crear el usuario. Revisa la información."
    return { ok: false, error: message }
  }
}

export async function resetUserPasswordAction(input: {
  userId: string
  newPassword: string
  confirmPassword: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const currentUser = await appAuth.currentUser()
  if (!currentUser || currentUser.role !== "Directivo") {
    return { ok: false, error: "No tienes permiso para restablecer contraseñas." }
  }
  if (
    !input ||
    typeof input.userId !== "string" ||
    typeof input.newPassword !== "string" ||
    typeof input.confirmPassword !== "string"
  ) {
    return { ok: false, error: "Los datos del restablecimiento no son válidos." }
  }
  const numericId = Number(input.userId)
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return { ok: false, error: "Identificador inválido." }
  }
  if (input.newPassword.length < 8) {
    return { ok: false, error: "La nueva contraseña debe tener al menos 8 caracteres." }
  }
  if (input.newPassword !== input.confirmPassword) {
    return { ok: false, error: "Las contraseñas no coinciden." }
  }

  try {
    const payload = await getPayload({ config })
    const target = await payload.findByID({
      collection: "users",
      id: numericId,
      depth: 0,
      overrideAccess: false,
      user: currentUser,
    })
    if (!target) {
      return { ok: false, error: "El usuario no existe." }
    }
    if (target.role === "Directivo") {
      return { ok: false, error: "No puedes restablecer la contraseña de otro Directivo." }
    }
    await payload.update({
      collection: "users",
      id: numericId,
      data: { password: input.newPassword, sessions: [] },
      overrideAccess: false,
      user: currentUser,
    })
    return { ok: true }
  } catch (error) {
    console.error(
      "RESET USER PASSWORD ERROR",
      error instanceof Error ? error.message : String(error),
    )
    return { ok: false, error: "No fue posible restablecer la contraseña." }
  }
}

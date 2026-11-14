import type { Access } from "payload"

export const isDirectivo: Access = ({ req }) =>
  req.user?.collection === "users" && req.user.role === "Directivo"

export const isDocente: Access = ({ req }) =>
  req.user?.collection === "users" && req.user.role === "Docente"

export const isVigilante: Access = ({ req }) =>
  req.user?.collection === "users" && req.user.role === "Vigilante de Acceso"

export const isStaff: Access = ({ req }) =>
  req.user?.collection === "users" &&
  (req.user.role === "Directivo" ||
    req.user.role === "Docente" ||
    req.user.role === "Vigilante de Acceso")

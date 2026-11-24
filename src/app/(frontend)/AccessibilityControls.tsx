"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  applyPreferences,
  FONT_SIZE_OPTIONS,
  readPreferences,
  savePreferences,
  type AccessibilityPreferences,
  type FontSizePreference,
} from "./accessibility-preferences"

type Variant = "floating" | "topbar"

export function AccessibilityControls({ variant }: { variant: Variant }) {
  const [preferences, setPreferences] = useState<AccessibilityPreferences>({ fontSize: "normal", theme: "light" })
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const initial = readPreferences()
    setPreferences(initial)
    applyPreferences(initial)
  }, [])

  useEffect(() => {
    if (!open) return
    const closeOnOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    window.addEventListener("mousedown", closeOnOutside)
    window.addEventListener("keydown", closeOnEscape)
    return () => {
      window.removeEventListener("mousedown", closeOnOutside)
      window.removeEventListener("keydown", closeOnEscape)
    }
  }, [open])

  const update = useCallback((next: AccessibilityPreferences) => {
    setPreferences(next)
    applyPreferences(next)
    savePreferences(next)
  }, [])

  const setFontSize = (fontSize: FontSizePreference) => update({ ...preferences, fontSize })
  const toggleTheme = () => update({ ...preferences, theme: preferences.theme === "dark" ? "light" : "dark" })

  return (
    <div className={`a11y-controls a11y-controls-${variant}`} ref={containerRef}>
      <button
        type="button"
        className="a11y-trigger"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Opciones de accesibilidad"
        title="Accesibilidad"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="4" r="2" />
          <path d="M4 8h16M12 8v6M8 21l4-7 4 7" />
        </svg>
      </button>
      {open && (
        <div className="a11y-popover" role="dialog" aria-label="Preferencias de accesibilidad">
          <p className="a11y-popover-title">Accesibilidad</p>
          <div className="a11y-group">
            <span className="a11y-group-label">Tamaño de letra</span>
            <div className="a11y-segmented" role="radiogroup" aria-label="Tamaño de letra">
              {FONT_SIZE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={preferences.fontSize === option.value}
                  className={preferences.fontSize === option.value ? "active" : ""}
                  onClick={() => setFontSize(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="a11y-group">
            <span className="a11y-group-label">Tema</span>
            <button
              type="button"
              className={`a11y-switch ${preferences.theme === "dark" ? "on" : ""}`}
              role="switch"
              aria-checked={preferences.theme === "dark"}
              onClick={toggleTheme}
            >
              <span className="a11y-switch-track"><span className="a11y-switch-thumb" /></span>
              <span>{preferences.theme === "dark" ? "Oscuro" : "Claro"}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

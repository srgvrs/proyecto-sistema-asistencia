export type FontSizePreference = "normal" | "large" | "xlarge"
export type ThemePreference = "light" | "dark"

export type AccessibilityPreferences = {
  fontSize: FontSizePreference
  theme: ThemePreference
}

export const FONT_SIZE_STORAGE_KEY = "vs.fontSize"
export const THEME_STORAGE_KEY = "vs.theme"

export const FONT_SIZE_OPTIONS: Array<{ value: FontSizePreference; label: string }> = [
  { value: "normal", label: "Normal" },
  { value: "large", label: "Grande" },
  { value: "xlarge", label: "Muy grande" },
]

const isFontSize = (value: unknown): value is FontSizePreference =>
  value === "normal" || value === "large" || value === "xlarge"

const isTheme = (value: unknown): value is ThemePreference =>
  value === "light" || value === "dark"

export const readPreferences = (): AccessibilityPreferences => {
  if (typeof window === "undefined") {
    return { fontSize: "normal", theme: "light" }
  }
  let fontSize: FontSizePreference = "normal"
  let theme: ThemePreference = "light"
  try {
    const storedFontSize = window.localStorage.getItem(FONT_SIZE_STORAGE_KEY)
    if (isFontSize(storedFontSize)) fontSize = storedFontSize
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (isTheme(storedTheme)) {
      theme = storedTheme
    } else if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
      theme = "dark"
    }
  } catch {
    // localStorage may be unavailable (private mode, blocked storage).
  }
  return { fontSize, theme }
}

export const applyPreferences = (preferences: AccessibilityPreferences): void => {
  if (typeof document === "undefined") return
  const root = document.documentElement
  root.dataset.fontSize = preferences.fontSize
  root.dataset.theme = preferences.theme
}

export const savePreferences = (preferences: AccessibilityPreferences): void => {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(FONT_SIZE_STORAGE_KEY, preferences.fontSize)
    window.localStorage.setItem(THEME_STORAGE_KEY, preferences.theme)
  } catch {
    // Ignore storage failures; the in-memory state still applies.
  }
}

export const PRE_HYDRATION_SCRIPT = `(function(){try{var d=document.documentElement;var fs=localStorage.getItem("${FONT_SIZE_STORAGE_KEY}");var th=localStorage.getItem("${THEME_STORAGE_KEY}");if(fs!=="normal"&&fs!=="large"&&fs!=="xlarge"){fs="normal";}if(th!=="light"&&th!=="dark"){th=(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches)?"dark":"light";}d.dataset.fontSize=fs;d.dataset.theme=th;}catch(e){document.documentElement.dataset.fontSize="normal";document.documentElement.dataset.theme="light";}})();`

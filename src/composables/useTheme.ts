import { ref, watchEffect } from 'vue'

export type ThemeMode = 'dark' | 'light'

const STORAGE_KEY = 'xiangqi-coach-theme'
const theme = ref<ThemeMode>((localStorage.getItem(STORAGE_KEY) as ThemeMode) || 'dark')

export function useTheme() {
  watchEffect(() => {
    document.documentElement.setAttribute('data-theme', theme.value)
    localStorage.setItem(STORAGE_KEY, theme.value)
  })
  function toggle() { theme.value = theme.value === 'dark' ? 'light' : 'dark' }
  return { theme, toggle }
}

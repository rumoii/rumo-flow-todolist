import type { AppSettings } from '../src/shared/contracts'

export function titleBarAppearance(theme: AppSettings['theme']) {
  return { color: theme === 'dark' ? '#211f28' : '#ffffff', symbolColor: theme === 'dark' ? '#eeeaf5' : '#514b60', height: 36 }
}

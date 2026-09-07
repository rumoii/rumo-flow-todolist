import type { InjectionKey } from 'vue'
import type { usePreferences } from './usePreferences'
export const preferencesKey: InjectionKey<Pick<ReturnType<typeof usePreferences>, 'settings' | 'settingsSaving' | 'saveSettings'>> = Symbol('preferences')

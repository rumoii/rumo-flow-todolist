import type { InjectionKey, Ref } from 'vue'
export interface WorkspaceNavigation {
  flowTarget: Ref<{ date: string; videoId?: string; sequence: number } | null>
  openTask(id: string): Promise<void>
  openFlow(date: string, videoId?: string): Promise<void>
}
export const navigationKey: InjectionKey<WorkspaceNavigation> = Symbol('workspace-navigation')

import type { InjectionKey, Ref } from 'vue'
export interface WorkspaceNavigation {
  flowTarget: Ref<{ date: string; videoId?: string; sequence: number } | null>
  openTask(id: string): Promise<boolean>
  openFlow(date: string, videoId?: string): Promise<boolean>
}
export const navigationKey: InjectionKey<WorkspaceNavigation> = Symbol('workspace-navigation')

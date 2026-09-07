import { inject } from 'vue'
import type { InjectionKey } from 'vue'
import type { useWorkspace } from './useWorkspace'
export const workspaceKey: InjectionKey<ReturnType<typeof useWorkspace>> = Symbol('workspace')
export function useWorkspaceContext() {
  const workspace = inject(workspaceKey)
  if (!workspace)
    throw new Error('任务工作区未初始化')
  return workspace
}

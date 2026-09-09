import { nextTick, ref, shallowRef } from 'vue'

export interface PendingEditor {
  id: string
  label: string
  save(): Promise<void>
  retain(): Promise<void>
}
export interface EditorSource {
  scope: string
  active(): boolean
  settle?(): Promise<void>
  pending(): PendingEditor[]
}
export function createEditorLeave() {
  const sources = new Set<EditorSource>()
  const items = shallowRef<PendingEditor[]>([])
  const error = ref('')
  const working = ref(false)
  const opened = ref(false)
  let resolve: ((value: boolean) => void) | undefined
  let focus: HTMLElement | null = null
  let requesting = false
  let generation = 0
  function register(source: EditorSource) {
    sources.add(source)
    return () => sources.delete(source)
  }
  function finish(allowed: boolean) {
    generation++
    opened.value = false
    const complete = resolve
    resolve = undefined
    complete?.(allowed)
    if (!allowed) {
      const target = focus
      void nextTick(() => target?.focus())
    }
  }
  async function choose(choice: 'save' | 'retain' | 'cancel') {
    if (working.value) return
    if (choice === 'cancel') { finish(false); return }
    working.value = true
    const operation = generation
    error.value = ''
    try {
      while (items.value.length) {
        const item = items.value[0]
        try { await (choice === 'save' ? item.save() : item.retain()) }
        catch (failure) { throw new Error(`${item.label}：${failure instanceof Error ? failure.message : '操作失败，请重试'}`) }
        if (operation !== generation) return
        items.value = items.value.slice(1)
      }
      finish(true)
    } catch (failure) { if (operation === generation) error.value = failure instanceof Error ? failure.message : '操作失败，请重试' }
    finally { working.value = false }
  }
  async function request(scopes?: string[]): Promise<boolean> {
    if (requesting) return false
    requesting = true
    const operation = generation
    focus = document.activeElement as HTMLElement | null
    try {
      const active = [...sources].filter(source => source.active() && (!scopes || scopes.includes(source.scope)))
      for (const source of active) {
        await source.settle?.()
        if (operation !== generation) return false
      }
      items.value = active.flatMap(source => source.pending())
      if (!items.value.length) return true
      error.value = ''
      opened.value = true
      return await new Promise<boolean>(done => { resolve = done })
    } finally { requesting = false }
  }
  return { items, error, working, opened, register, request, choose, cancel: () => finish(false) }
}
export type EditorLeave = ReturnType<typeof createEditorLeave>

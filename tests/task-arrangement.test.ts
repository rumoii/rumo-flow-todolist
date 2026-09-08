// @vitest-environment happy-dom
import { effectScope, ref } from 'vue'
import { expect, it, vi } from 'vitest'
import { useTaskArrangement } from '../src/features/workspace/useTaskArrangement'
import type { DraftSnapshot, Task, TodoApi } from '../src/shared/contracts'

it('invalidates an open request across data replacement, including a late generation read', async () => {
  let resolve!: (value: DraftSnapshot) => void
  const api = { drafts: { get: vi.fn(() => new Promise<DraftSnapshot>(done => { resolve = done })) }, tasks: { arrange: vi.fn() } } as unknown as TodoApi
  window.todoApi = api
  const epoch = ref(0)
  const task = { id: 'task', status: 'active', plan: null, updatedAt: 'same' } as Task
  const scope = effectScope()
  const arrangement = scope.run(() => useTaskArrangement(ref([task]), epoch, vi.fn(), vi.fn()))!
  try {
    const pending = arrangement.arrangeTask(task, { kind: 'plan', target: 'today' })
    epoch.value++
    resolve({ generation: 'new-generation', revision: 0, baseUpdatedAt: 'same', record: null })
    await pending
    expect(api.tasks.arrange).not.toHaveBeenCalled()
    expect(arrangement.state.task).toBeNull()
    expect(arrangement.state.busy).toBe(false)
  }
  finally { scope.stop(); delete window.todoApi }
})

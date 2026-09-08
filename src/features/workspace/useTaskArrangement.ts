import { nextTick, reactive, watch } from 'vue'
import type { Ref } from 'vue'
import type { ArrangeTaskAction, Task, TaskPlan } from '../../shared/contracts'
import { planLabel } from '../../shared/planning'

export function useTaskArrangement(tasks: Ref<Task[]>, dataEpoch: Ref<number>, selectTask: (task: Task) => Promise<void>, notify: (message: string) => void) {
  const state = reactive({ task: null as Task | null, busy: false, error: '', generation: null as string | null, custom: null as TaskPlan | null })
  let trigger: HTMLElement | null = null
  let neighbor: HTMLElement | null = null
  let request = 0
  watch(dataEpoch, () => {
    request++
    state.task = null
    state.generation = null
    state.busy = false
    state.error = ''
  }, { flush: 'sync' })

  async function close() {
    if (state.busy) return
    request++
    state.task = null
    await nextTick()
    const target = trigger?.isConnected ? trigger : neighbor?.isConnected ? neighbor : document.querySelector<HTMLElement>('.page-header h1')
    target?.focus()
  }
  async function snapshot() {
    if (!state.task) return
    const sequence = request
    const result = await window.todoApi.drafts.get('task', state.task.id)
    if (sequence !== request) throw new Error('数据已恢复，请重新打开任务')
    state.generation = result.generation
  }
  async function submit(action: ArrangeTaskAction) {
    if (!state.task || state.busy) return
    state.busy = true
    state.error = ''
    const sequence = request
    try {
      if (!state.generation) await snapshot()
      if (sequence !== request) return
      const task = state.task
      const updated = await window.todoApi.tasks.arrange({ taskId: task.id, updatedAt: task.updatedAt, generation: state.generation!, action })
      if (sequence !== request) return
      tasks.value = tasks.value.map(item => item.id === updated.id ? updated : item)
      notify(action.kind === 'focus' ? action.enabled ? '已安排到今天并设为重点' : '已取消今日重点，执行计划不变' : `已安排：${planLabel(updated.plan)}`)
    }
    catch (error) {
      if (sequence === request) state.error = error instanceof Error ? error.message : '安排失败，请重试'
      return
    }
    finally { if (sequence === request) state.busy = false }
    await close()
  }
  async function open(task: Task, event?: Event, action?: ArrangeTaskAction) {
    if (state.busy || task.status !== 'active' || task.deletedAt || task.parentTaskId) return
    const sequence = ++request
    trigger = (event?.currentTarget instanceof HTMLElement ? event.currentTarget : document.activeElement) as HTMLElement | null
    const row = trigger?.closest('[data-task-id]')
    neighbor = row?.nextElementSibling?.querySelector<HTMLElement>('[role="button"],button') ?? row?.previousElementSibling?.querySelector<HTMLElement>('[role="button"],button') ?? null
    state.task = JSON.parse(JSON.stringify(task)) as Task
    state.custom = task.plan ? { ...task.plan } : null
    state.error = ''
    state.generation = null
    state.busy = true
    try { await snapshot() }
    catch (error) { if (sequence === request) state.error = error instanceof Error ? error.message : '任务读取失败，请重试' }
    finally { if (sequence === request) state.busy = false }
    if (sequence === request && !state.error && action) await submit(action)
  }
  async function openDetails() {
    if (!state.task || state.busy) return
    const task = tasks.value.find(item => item.id === state.task!.id) ?? state.task
    await close()
    await selectTask(task)
  }
  return { state, open, submit, close, openDetails, arrangeTask: (task: Task, action: ArrangeTaskAction) => open(task, undefined, action) }
}

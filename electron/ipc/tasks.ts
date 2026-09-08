import type { IpcContext } from './context'
import { text, object, ids } from './validation'
import type { ArrangeTaskInput, BatchTaskInput, TaskSynchronization, CreateTaskInput, OrganizeTaskInput, TaskQuery, UpdateTaskInput } from '../../src/shared/contracts'
export function registerTasks({ repository, options, handle, changed }: IpcContext): void {
  handle('tasks:arrange', async (_event, raw) => {
    const input = object<ArrangeTaskInput>(raw, '任务安排')
    text(input.taskId, '任务编号')
    if (!options.barrier) throw new Error('窗口协调尚未就绪，请重启应用')
    let synchronized: TaskSynchronization | undefined
    return options.barrier.run('arrange', () => {
      const snapshot = repository.drafts.get('task', input.taskId)
      const task = repository.taskCommands.arrange(input)
      synchronized = { task, snapshot: { ...snapshot, baseUpdatedAt: task.updatedAt } }
      return task
    }, { taskIds: [input.taskId], read: () => synchronized ? [synchronized] : [] })
  })
  handle('tasks:batch', async (_event, raw) => {
    const input = object<BatchTaskInput>(raw, '批量操作')
    if (!Array.isArray(input.targets)) throw new Error('批量任务参数无效')
    const taskIds = ids(input.targets.map(target => target?.id), '任务')
    if (input.action?.kind !== 'plan') return changed(repository.taskCommands.batch(input))
    if (!options.barrier) throw new Error('窗口协调尚未就绪，请重启应用')
    let synchronized: TaskSynchronization[] = []
    return options.barrier.run('arrange', () => {
      repository.taskCommands.batch(input)
      synchronized = [...new Set(taskIds)].map(taskId => ({ task: repository.tasks.getTask(taskId), snapshot: repository.drafts.get('task', taskId) }))
    }, { taskIds, read: () => synchronized })
  })
  handle('tasks:search', (_event, query) => repository.actions.search(query))
  handle('tasks:list', (_event, query) => repository.tasks.listTasks((query ?? {}) as TaskQuery))
  handle('tasks:create', (_event, input) => changed(repository.tasks.createTask(object<CreateTaskInput>(input, '任务'))))
  handle('tasks:update', (_event, taskId, input) => changed(repository.tasks.updateTask(text(taskId, '任务编号'), object<UpdateTaskInput>(input, '任务'))))
  handle('tasks:complete', (_event, taskId) => changed(repository.tasks.completeTask(text(taskId, '任务编号'))))
  handle('tasks:reopen', (_event, taskId) => changed(repository.tasks.reopenTask(text(taskId, '任务编号'))))
  handle('tasks:remove', (_event, taskId) => changed(repository.tasks.removeTask(text(taskId, '任务编号'))))
  handle('tasks:recover', (_event, taskId) => changed(repository.tasks.recoverTask(text(taskId, '任务编号'))))
  handle('tasks:reorder', (_event, taskIds) => repository.tasks.reorderTasks(ids(taskIds, '任务顺序')))
  handle('tasks:organize', (_event, taskId, input) => changed(repository.tasks.organizeTask(text(taskId, '任务编号'), object<OrganizeTaskInput>(input, '任务编排'))))
}

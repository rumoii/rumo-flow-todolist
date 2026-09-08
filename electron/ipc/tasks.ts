import type { IpcContext } from './context'
import { text, object, ids } from './validation'
import type { ArrangeTaskInput, TaskSynchronization, CreateTaskInput, OrganizeTaskInput, TaskQuery, UpdateTaskInput, TaskBatchAction } from '../../src/shared/contracts'
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
    }, { taskId: input.taskId, read: () => synchronized })
  })
  handle('tasks:batch', (_event, taskIds, action) => changed(repository.taskCommands.batch(ids(taskIds, '任务'), object<TaskBatchAction>(action, '批量操作'))))
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

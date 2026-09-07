import type { IpcContext } from './context'
import { text, object, ids } from './validation'
import type { CreateTaskInput, OrganizeTaskInput, TaskQuery, UpdateTaskInput } from '../../src/shared/contracts'
export function registerTasks({ repository, options, handle, changed }: IpcContext): void {
  handle('tasks:list', (_event, query) => repository.tasks.listTasks((query ?? {}) as TaskQuery))
  handle('tasks:create', (_event, input) => changed(repository.tasks.createTask(object<CreateTaskInput>(input, '任务'))))
  handle('tasks:update', (_event, taskId, input) => changed(repository.tasks.updateTask(text(taskId, '任务编号'), object<UpdateTaskInput>(input, '任务'))))
  handle('tasks:complete', (_event, taskId) => changed(repository.tasks.completeTask(text(taskId, '任务编号'))))
  handle('tasks:restore', (_event, taskId) => changed(repository.tasks.restoreTask(text(taskId, '任务编号'))))
  handle('tasks:remove', (_event, taskId) => changed(repository.tasks.removeTask(text(taskId, '任务编号'))))
  handle('tasks:restore-removed', (_event, taskId) => changed(repository.tasks.restoreRemoved(text(taskId, '任务编号'))))
  handle('tasks:reorder', (_event, taskIds) => repository.tasks.reorderTasks(ids(taskIds, '任务顺序')))
  handle('tasks:organize', (_event, taskId, input) => changed(repository.tasks.organizeTask(text(taskId, '任务编号'), object<OrganizeTaskInput>(input, '任务编排'))))
}

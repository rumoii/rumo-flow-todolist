import type { IpcContext } from './context'
import { text, object, ids, taskPolicy } from './validation'
import type { CreateSavedFilterInput, CreateTagInput, CreateTaskListInput, OrganizeTaskListInput, UpdateSavedFilterInput, UpdateTagInput, UpdateTaskListInput } from '../../src/shared/contracts'
export function registerOrganization({ repository, options, handle, changed }: IpcContext): void {
  handle('lists:list', () => repository.organization.listLists())
  handle('lists:create', (_event, input) => repository.organization.createList(object<CreateTaskListInput>(input, '清单')))
  handle('lists:update', (_event, listId, input) => repository.organization.updateList(text(listId, '清单编号'), object<UpdateTaskListInput>(input, '清单')))
  handle('lists:remove', (_event, listId, options) => repository.organization.removeList(text(listId, '清单编号'), taskPolicy(object<{
    taskPolicy?: unknown
  }>(options ?? {}, '删除选项').taskPolicy)))
  handle('lists:reorder', (_event, listIds) => repository.organization.reorderLists(ids(listIds, '清单顺序')))
  handle('lists:organize', (_event, listId, input) => repository.organization.organizeList(text(listId, '清单编号'), object<OrganizeTaskListInput>(input, '清单编排')))
  handle('tags:list', () => repository.organization.listTags())
  handle('tags:create', (_event, input) => repository.organization.createTag(object<CreateTagInput>(input, '标签')))
  handle('tags:update', (_event, tagId, input) => repository.organization.updateTag(text(tagId, '标签编号'), object<UpdateTagInput>(input, '标签')))
  handle('tags:remove', (_event, tagId) => repository.organization.removeTag(text(tagId, '标签编号')))
  handle('filters:list', () => repository.organization.listSavedFilters())
  handle('filters:create', (_event, input) => repository.organization.createSavedFilter(object<CreateSavedFilterInput>(input, '筛选')))
  handle('filters:update', (_event, filterId, input) => repository.organization.updateSavedFilter(text(filterId, '筛选编号'), object<UpdateSavedFilterInput>(input, '筛选')))
  handle('filters:remove', (_event, filterId) => repository.organization.removeSavedFilter(text(filterId, '筛选编号')))
}

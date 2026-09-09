import type { IpcContext } from './context'
import { text, object } from './validation'
import type { DraftKind, DraftRef, DraftWrite } from '../../src/shared/contracts'
export function registerDrafts({ repository, handle, changed }: IpcContext): void {
  handle('drafts:get', (_event, kind, key) => repository.drafts.get(kind as DraftKind, text(key, '草稿编号')))
  handle('drafts:put', (_event, input) => repository.drafts.put(object<DraftWrite>(input, '草稿')))
  handle('drafts:discard', (_event, input) => repository.drafts.discard(object<DraftRef>(input, '草稿')))
  handle('drafts:commit', (_event, input) => changed(repository.drafts.commit(object<DraftRef>(input, '草稿'))))
}

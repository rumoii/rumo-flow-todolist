import { contextBridge, ipcRenderer } from 'electron'
import type { LifecycleResume, TodoApi } from '../src/shared/contracts'
const api: TodoApi = {
  updates: {
    status: () => ipcRenderer.invoke('updates:status'),
    check: () => ipcRenderer.invoke('updates:check'),
    download: () => ipcRenderer.invoke('updates:download'),
    cancel: () => ipcRenderer.invoke('updates:cancel'),
    install: () => ipcRenderer.invoke('updates:install'),
    feedback: () => ipcRenderer.invoke('updates:feedback'),
    copyInfo: () => ipcRenderer.invoke('updates:copy-info'),
    onChanged: callback => {
      const listener = (_event: Electron.IpcRendererEvent, state: Parameters<typeof callback>[0]) => callback(state)
      ipcRenderer.on('updates:changed', listener)
      return () => ipcRenderer.removeListener('updates:changed', listener)
    },
  },
  drafts: {
    get: (kind, key) => ipcRenderer.invoke('drafts:get', kind, key),
    put: (input) => ipcRenderer.invoke('drafts:put', input),
    discard: (input) => ipcRenderer.invoke('drafts:discard', input),
    commit: (input) => ipcRenderer.invoke('drafts:commit', input),
  },
  lifecycle: {
    onPrepare: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, request: Parameters<Parameters<TodoApi['lifecycle']['onPrepare']>[0]>[0]) => {
        Promise.resolve().then(() => callback(request)).then(() => ipcRenderer.send('lifecycle:ack', { id: request.id }), (error) => ipcRenderer.send('lifecycle:ack', { id: request.id, error: error instanceof Error ? error.message : '草稿保留失败' }))
      }
      ipcRenderer.on('lifecycle:prepare', listener)
      return () => { ipcRenderer.removeListener('lifecycle:prepare', listener); }
    },
    onResume: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, result: LifecycleResume) => callback(result)
      ipcRenderer.on('lifecycle:resume', listener)
      return () => { ipcRenderer.removeListener('lifecycle:resume', listener); }
    },
  },
  tasks: {
    arrange: (input) => ipcRenderer.invoke('tasks:arrange', input),
    batch: input => ipcRenderer.invoke('tasks:batch', input),
    search: (text) => ipcRenderer.invoke('tasks:search', text),
    list: (query) => ipcRenderer.invoke('tasks:list', query),
    create: (input) => ipcRenderer.invoke('tasks:create', input),
    update: (id, input) => ipcRenderer.invoke('tasks:update', id, input),
    complete: (id) => ipcRenderer.invoke('tasks:complete', id),
    reopen: (id) => ipcRenderer.invoke('tasks:reopen', id),
    remove: (id) => ipcRenderer.invoke('tasks:remove', id),
    recover: (id) => ipcRenderer.invoke('tasks:recover', id),
    reorder: (ids) => ipcRenderer.invoke('tasks:reorder', ids),
    organize: (id, input) => ipcRenderer.invoke('tasks:organize', id, input)
  },
  tags: {
    list: () => ipcRenderer.invoke('tags:list'),
    create: (input) => ipcRenderer.invoke('tags:create', input),
    update: (id, input) => ipcRenderer.invoke('tags:update', id, input),
    remove: (id) => ipcRenderer.invoke('tags:remove', id)
  },
  filters: {
    list: () => ipcRenderer.invoke('filters:list'),
    create: (input) => ipcRenderer.invoke('filters:create', input),
    update: (id, input) => ipcRenderer.invoke('filters:update', id, input),
    remove: (id) => ipcRenderer.invoke('filters:remove', id)
  },
  flow: {
    createAction: (input) => ipcRenderer.invoke('flow:create-action', input),
    actionLinks: (source, taskId) => ipcRenderer.invoke('flow:action-links', source, taskId),
    taskFacts: (date) => ipcRenderer.invoke('flow:task-facts', date),
    getDay: (date) => ipcRenderer.invoke('flow:get-day', date),
    history: (query) => ipcRenderer.invoke('flow:history', query),
    saveReview: (input) => ipcRenderer.invoke('flow:save-review', input),
    createVideo: (input) => ipcRenderer.invoke('flow:create-video', input),
    updateVideo: (id, input) => ipcRenderer.invoke('flow:update-video', id, input),
    removeVideo: (id) => ipcRenderer.invoke('flow:remove-video', id),
    month: (month) => ipcRenderer.invoke('flow:month', month),
    summary: (days) => ipcRenderer.invoke('flow:summary', days)
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (input) => ipcRenderer.invoke('settings:update', input),
    onChanged: (callback) => { const listener = (_event: Electron.IpcRendererEvent, settings: Parameters<typeof callback>[0]) => callback(settings); ipcRenderer.on('settings:changed', listener); return () => ipcRenderer.removeListener('settings:changed', listener); }
  },
  desktop: {
    onDataChanged: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, domains: Parameters<typeof callback>[0]) => callback(domains)
      ipcRenderer.on('desktop:data-changed', listener)
      return () => { ipcRenderer.removeListener('desktop:data-changed', listener); }
    },
    onCaptureShown: (callback) => {
      const listener = () => callback()
      ipcRenderer.on('desktop:capture-shown', listener)
      return () => { ipcRenderer.removeListener('desktop:capture-shown', listener); }
    },
    status: () => ipcRenderer.invoke('desktop:status'),
    openQuickCapture: () => ipcRenderer.invoke('desktop:open-quick-capture'),
    openExternal: (url) => ipcRenderer.invoke('desktop:open-external', url),
    onFocusQuickAdd: (callback) => { const listener = (_event: Electron.IpcRendererEvent, taskId?: string) => callback(taskId); ipcRenderer.on('desktop:focus-quick-add', listener); return () => ipcRenderer.removeListener('desktop:focus-quick-add', listener); },
    onOpenFlow: (callback) => { const listener = () => callback(); ipcRenderer.on('desktop:open-flow', listener); return () => ipcRenderer.removeListener('desktop:open-flow', listener); }
  },
  lists: {
    list: () => ipcRenderer.invoke('lists:list'),
    create: (input) => ipcRenderer.invoke('lists:create', input),
    update: (id, input) => ipcRenderer.invoke('lists:update', id, input),
    remove: (id, options) => ipcRenderer.invoke('lists:remove', id, options),
    reorder: (ids) => ipcRenderer.invoke('lists:reorder', ids),
    organize: (id, input) => ipcRenderer.invoke('lists:organize', id, input)
  },
  backup: {
    export: () => ipcRenderer.invoke('backup:export'),
    import: (payload) => ipcRenderer.invoke('backup:import', payload)
  }
}
contextBridge.exposeInMainWorld('todoApi', api)

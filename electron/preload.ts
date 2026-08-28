import { contextBridge, ipcRenderer } from 'electron'
import type { TodoApi } from '../src/shared/contracts'

const api: TodoApi = {
  tasks: {
    list: (query) => ipcRenderer.invoke('tasks:list', query),
    create: (input) => ipcRenderer.invoke('tasks:create', input),
    update: (id, input) => ipcRenderer.invoke('tasks:update', id, input),
    complete: (id) => ipcRenderer.invoke('tasks:complete', id),
    restore: (id) => ipcRenderer.invoke('tasks:restore', id),
    remove: (id) => ipcRenderer.invoke('tasks:remove', id),
    restoreRemoved: (id) => ipcRenderer.invoke('tasks:restore-removed', id),
    reorder: (ids) => ipcRenderer.invoke('tasks:reorder', ids)
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
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (input) => ipcRenderer.invoke('settings:update', input)
  },
  desktop: {
    status: () => ipcRenderer.invoke('desktop:status'),
    openQuickCapture: () => ipcRenderer.invoke('desktop:open-quick-capture'),
    onFocusQuickAdd: (callback) => { const listener = (_event: Electron.IpcRendererEvent, taskId?: string) => callback(taskId); ipcRenderer.on('desktop:focus-quick-add', listener); return () => ipcRenderer.removeListener('desktop:focus-quick-add', listener) }
  },
  lists: {
    list: () => ipcRenderer.invoke('lists:list'),
    create: (input) => ipcRenderer.invoke('lists:create', input),
    update: (id, input) => ipcRenderer.invoke('lists:update', id, input),
    remove: (id, options) => ipcRenderer.invoke('lists:remove', id, options),
    reorder: (ids) => ipcRenderer.invoke('lists:reorder', ids)
  },
  backup: {
    export: () => ipcRenderer.invoke('backup:export'),
    import: (payload) => ipcRenderer.invoke('backup:import', payload)
  }
}

contextBridge.exposeInMainWorld('todoApi', api)

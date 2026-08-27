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
    reorder: (ids) => ipcRenderer.invoke('tasks:reorder', ids)
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

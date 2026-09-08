import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { UpdateState } from '../../shared/updates'
export function useUpdates() {
  const state = ref<UpdateState>({ phase: 'unsupported', version: '', platform: '', arch: '' })
  const message = ref('')
  let remove: (() => void) | undefined
  let active = true
  let revision = 0
  const labels = { unsupported: '请在 Windows x64 安装版中检查更新', idle: '尚未检查更新', checking: '正在检查更新…', current: '当前没有更高的正式版本', available: '发现新版本', downloading: '正在下载…', downloaded: '下载完成，可重启安装', installing: '正在保留草稿并准备安装…', error: '更新失败，可重试' }
  const status = computed(() => labels[state.value.phase])
  onMounted(async () => {
    const api = window.todoApi?.updates
    if (!api) return
    remove = api.onChanged(value => { revision++; state.value = value })
    const start = revision
    try {
      const value = await api.status()
      if (active && start === revision) state.value = value
    } catch { if (active) message.value = '版本信息读取失败，请重新打开应用' }
  })
  onBeforeUnmount(() => { active = false; remove?.() })
  async function run(action: 'check' | 'download' | 'cancel' | 'install' | 'feedback' | 'copyInfo') {
    message.value = ''
    try {
      await window.todoApi.updates[action]()
      if (active && action === 'copyInfo') message.value = '版本信息已复制，不包含任务或草稿'
    } catch (error) { if (active) message.value = error instanceof Error ? error.message : '操作失败，请重试' }
  }
  return { state, status, message, run }
}

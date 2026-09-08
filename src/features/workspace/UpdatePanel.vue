<script setup lang="ts">
import { ref } from 'vue'
import type { UpdateState } from '../../shared/updates'
import { useWorkspaceContext } from './context'
const props = defineProps<{ state: UpdateState; status: string; message: string }>()
const copyMessage = ref('')
async function copyError() {
  try { await navigator.clipboard.writeText(props.state.errorDetails ?? props.state.error ?? ''); copyMessage.value = '技术详情已复制' }
  catch { copyMessage.value = '复制失败，请选中文字复制' }
}
const emit = defineEmits<{ action: [action: 'check' | 'download' | 'cancel' | 'install' | 'feedback' | 'copyInfo'] }>()
const { settings, settingsSaving, saveSettings } = useWorkspaceContext()
</script>
<template>
  <h3>更新与关于</h3>
  <p class="preferences-description">保持最新，也欢迎告诉我们哪里可以更好。</p>
  <div class="preference-card">
    <h4>Rumo-Flow <span class="version-badge">{{ state.version ? `v${state.version}` : '开发预览' }}</span></h4>
    <p v-if="state.platform">{{ state.platform === 'win32' ? 'Windows' : state.platform }} · {{ state.arch }}</p>
    <p v-else>运行版本信息仅在桌面应用中提供。</p>
  </div>
  <div class="preference-card">
    <h4>软件更新</h4>
    <label class="update-toggle"><input type="checkbox" :checked="settings.automaticUpdateChecks" :disabled="settingsSaving" @change="saveSettings({ automaticUpdateChecks: ($event.target as HTMLInputElement).checked }, '自动检查更新')" />启动时自动检查更新</label>
    <p>仅检查正式版，不会自动下载或安装。</p>
    <p role="status">{{ status }}<strong v-if="state.nextVersion"> · v{{ state.nextVersion }}</strong></p>
    <progress v-if="state.phase === 'downloading'" :value="state.progress ?? 0" max="100" aria-label="更新下载进度" />
    <p v-if="state.phase === 'downloading'">{{ Math.floor(state.progress ?? 0) }}%</p>
    <div v-if="state.error" class="update-error"><p role="alert">{{ state.error }}</p><details v-if="state.errorDetails"><summary>查看技术详情</summary><pre tabindex="0" aria-label="更新错误技术详情">{{ state.errorDetails }}</pre><button class="text-button" @click="copyError">复制技术详情</button><span role="status">{{ copyMessage }}</span></details></div>
    <div class="update-actions">
      <button class="secondary-button" :disabled="!['idle', 'current', 'available', 'error'].includes(state.phase)" @click="emit('action', 'check')">{{ state.phase === 'checking' ? '正在检查…' : '检查更新' }}</button>
      <button v-if="state.phase === 'available' || state.phase === 'error' && state.nextVersion" class="primary-button" @click="emit('action', 'download')">下载更新</button>
      <button v-if="state.phase === 'downloading'" class="secondary-button" @click="emit('action', 'cancel')">取消下载</button>
      <button v-if="state.phase === 'downloaded'" class="primary-button" @click="emit('action', 'install')">重启并安装</button>
    </div>
    <details v-if="state.notes" class="update-notes"><summary>更新说明</summary><p>{{ state.notes }}</p></details>
    <p v-if="state.phase === 'downloaded'">安装前会保留各窗口输入；未能保留时不会退出。</p>
  </div>
  <div class="preference-card">
    <h4>问题反馈</h4><p>通过 GitHub 提交问题，需要 GitHub 账号。不自动上传任务、草稿或日志。</p>
    <div class="update-actions"><button class="secondary-button" :disabled="!state.version" @click="emit('action', 'feedback')">前往 GitHub 反馈</button><button class="secondary-button" :disabled="!state.version" @click="emit('action', 'copyInfo')">复制版本信息</button></div>
    <p v-if="message" role="status">{{ message }}</p>
  </div>
</template>
<style scoped>
.update-error { padding: 12px 14px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface-soft); }
.update-error p { margin: 0 0 8px; }
.update-error summary { cursor: pointer; color: var(--text-secondary); font-size: 12px; }
.update-error pre { max-height: 180px; overflow: auto; overscroll-behavior: contain; white-space: pre-wrap; overflow-wrap: anywhere; padding: 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text-secondary); font-size: 12px; line-height: 1.6; }
.update-error span { margin-left: 12px; font-size: 12px; }
</style>

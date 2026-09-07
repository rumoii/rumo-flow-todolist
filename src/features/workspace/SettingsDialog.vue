<script setup lang="ts">
import { ref } from 'vue'
import { useWorkspaceContext } from './context'
const { settings, desktopStatus, settingsOpen, settingsSaving, exportBackup, importBackup, saveSettings, shortcutsOpen, trapDialogFocus } = useWorkspaceContext()
const section = ref('appearance')
const sections = [{ id: 'appearance', label: '外观', icon: '◐' }, { id: 'shortcuts', label: '快捷键', icon: '⌘' }, { id: 'data', label: '数据与备份', icon: '▤' }]
</script>

<template>
  <Transition name="dialog">
    <div v-if="settingsOpen" class="dialog-backdrop" @click.self="settingsOpen = false" @keydown="trapDialogFocus">
      <section class="settings-dialog preferences-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title" tabindex="-1">
        <header><div><p>Rumo-Flow</p><h2 id="settings-title">设置</h2></div><button class="icon-button" aria-label="关闭设置" @click="settingsOpen = false">×</button></header>
        <div class="preferences-layout">
          <nav class="preferences-nav" aria-label="设置分类"><button v-for="item in sections" :key="item.id" :class="{ active: section === item.id }" :aria-current="section === item.id ? 'page' : undefined" @click="section = item.id"><span aria-hidden="true">{{ item.icon }}</span>{{ item.label }}</button></nav>
          <div class="preferences-content" tabindex="0" :aria-label="sections.find(item => item.id === section)?.label">
            <template v-if="section === 'appearance'">
              <h3>外观</h3><p class="preferences-description">选择让你专注、舒适的工作环境。</p>
              <h4>界面主题</h4>
              <div class="theme-options" role="group" aria-label="界面主题">
                <button v-for="theme in (['light', 'dark'] as const)" :key="theme" :aria-pressed="settings.theme === theme" :disabled="settingsSaving" :class="['theme-option', { selected: settings.theme === theme }]" @click="saveSettings({ theme }, '主题')"><span :class="['theme-preview', theme]" aria-hidden="true"><span class="preview-sidebar"></span><span class="preview-lines"><i></i><i></i><i></i></span></span><span>{{ theme === 'light' ? '浅色' : '深色' }}<span v-if="settings.theme === theme" aria-hidden="true"> ✓</span></span></button>
              </div>
              <h4>内容密度</h4><p class="preferences-description">舒适模式留白更多，紧凑模式显示更多任务。</p>
              <div class="density-options" role="group" aria-label="内容密度"><button v-for="density in (['comfortable', 'compact'] as const)" :key="density" :aria-pressed="settings.density === density" :disabled="settingsSaving" @click="saveSettings({ density }, '内容密度')">{{ density === 'comfortable' ? '舒适' : '紧凑' }}</button></div>
              <p class="preferences-save-status" role="status">{{ settingsSaving ? '正在保存…' : '更改后自动保存' }}</p>
            </template>
            <template v-else-if="section === 'shortcuts'">
              <h3>快捷键</h3><p class="preferences-description">随时记下想法，不打断正在进行的事情。</p>
              <div class="preference-card"><h4>全局快速捕获</h4><kbd>{{ desktopStatus.globalShortcut }}</kbd><p>{{ desktopStatus.globalShortcutRegistered ? '快捷键已启用' : '注册失败，请检查是否被其他应用占用' }}</p><button class="secondary-button" @click="shortcutsOpen = true">快捷键帮助</button></div>
            </template>
            <template v-else>
              <h3>数据与备份</h3><p class="preferences-description">数据仅保存在当前设备。</p>
              <div class="preference-card"><h4>导出数据备份</h4><p>将正式数据和未完成草稿保存为 v5 JSON 备份。</p><button class="secondary-button" @click="exportBackup">导出备份</button></div>
              <div class="preference-card"><h4>从备份恢复</h4><p>替换正式数据与草稿前，自动保留当前快照。仅支持 v5 备份，包含计划、行动来源和回收站。</p><button class="secondary-button" @click="importBackup">选择文件</button></div>
            </template>
          </div>
        </div>
      </section>
    </div>
  </Transition>
</template>

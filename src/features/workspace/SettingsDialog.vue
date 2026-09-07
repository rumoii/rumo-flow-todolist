<script setup lang="ts">
import { useWorkspaceContext } from './context'
import SelectField from '../../components/SelectField.vue'
const { settings, desktopStatus, settingsOpen, exportBackup, importBackup, saveSettings, tags, shortcutsOpen, settingsTagName, managedTagDrafts, createTagFromSettings, updateManagedTag, deleteManagedTag, trapDialogFocus } = useWorkspaceContext()
</script>

<template>
<Transition name="dialog">
<div v-if="settingsOpen" class="dialog-backdrop" @click.self="settingsOpen = false" @keydown="trapDialogFocus">
<section class="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title" tabindex="-1">
<header>
<div>
<p>Rumo-Flow</p>
<h2 id="settings-title">设置与数据</h2>
</div>
<button class="icon-button" aria-label="关闭设置" @click="settingsOpen = false">×</button>
</header>
<div class="settings-section">
<div>
<strong>界面主题</strong>
<p>选择适合当前环境的明暗外观。</p>
</div>
<SelectField v-model="settings.theme" aria-label="界面主题" :options="[{ value: 'light', label: '浅色' }, { value: 'dark', label: '深色' }]" @change="saveSettings" />
</div>
<div class="settings-section">
<div>
<strong>内容密度</strong>
<p>舒适模式留白更多，紧凑模式显示更多任务。</p>
</div>
<SelectField v-model="settings.density" aria-label="内容密度" :options="[{ value: 'comfortable', label: '舒适' }, { value: 'compact', label: '紧凑' }]" @change="saveSettings" />
</div>
<div class="settings-section">
<div>
<strong>每日视频额度</strong>
<p>心流默认允许登记 3 条，达到后温和提醒。</p>
</div>
<input v-model.number="settings.dailyVideoLimit" class="settings-number" aria-label="每日视频额度" type="number" min="0" max="10" @change="saveSettings" />
</div>
<div class="settings-section">
<div>
<strong>每日复盘提醒</strong>
<p>应用或托盘运行时，在设定时间提醒一次。</p>
</div>
<div class="review-reminder-setting">
<label>
<input v-model="settings.reviewReminderEnabled" type="checkbox" @change="saveSettings" /> 启用</label>
<input v-model="settings.reviewReminderTime" aria-label="复盘提醒时间" type="time" :disabled="!settings.reviewReminderEnabled" @change="saveSettings" />
</div>
</div>
<div class="settings-section">
<div>
<strong>全局快捷键</strong>
<p>{{ desktopStatus.globalShortcutRegistered ? `已启用 ${desktopStatus.globalShortcut}` : `${desktopStatus.globalShortcut} 注册失败，请检查快捷键冲突` }}</p>
</div>
<button class="secondary-button" @click="shortcutsOpen = true">快捷键帮助</button>
</div>
<div class="settings-section tag-management">
<div class="tag-management-heading">
<strong>标签管理</strong>
<p>创建、改名和调整颜色；删除只解除任务关联。</p>
</div>
<div class="tag-create-row">
<input v-model="settingsTagName" placeholder="新标签名称" @keydown.enter="createTagFromSettings" />
<button class="secondary-button" @click="createTagFromSettings">创建</button>
</div>
<div v-if="tags.length" class="managed-tag-list">
<div v-for="tag in tags" :key="tag.id" class="managed-tag-row">
<input v-model="managedTagDrafts[tag.id].name" class="managed-tag-name" :aria-label="`标签名称 ${tag.name}`" />
<input v-model="managedTagDrafts[tag.id].color" type="color" :aria-label="`标签颜色 ${tag.name}`" />
<button class="secondary-button" @click="updateManagedTag(tag)">保存</button>
<button class="danger-link" @click="deleteManagedTag(tag)">删除</button>
</div>
</div>
<p v-else class="tag-empty">还没有标签</p>
</div>
<div class="settings-section">
<div>
<strong>导出数据备份</strong>
<p>将正式数据和未完成草稿一起保存为 v4 JSON 备份。</p>
</div>
<button class="secondary-button" @click="exportBackup">导出备份</button>
</div>
<div class="settings-section">
<div>
<strong>从备份恢复</strong>
<p>恢复会替换正式数据与草稿，事先自动保留当前快照；支持 v1 至 v4，旧版备份恢复后草稿为空。</p>
</div>
<button class="secondary-button" @click="importBackup">选择文件</button>
</div>
<footer>数据仅保存在当前设备 · Rumo-Flow</footer>
</section>
</div>
</Transition>
</template>

<script setup lang="ts">
import { useWorkspaceContext } from './context'
const { pendingDelete, pendingListDelete, listDeletePolicy, shortcutsOpen, toast, toastAction, removeTask, confirmListDelete, runToastAction, trapDialogFocus } = useWorkspaceContext()
</script>

<template>
<Transition name="dialog">
<div v-if="pendingDelete" class="dialog-backdrop" @click.self="pendingDelete = null" @keydown="trapDialogFocus">
<section class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-title" tabindex="-1">
<div class="dialog-icon">!</div>
<h2 id="delete-title">删除这个任务？</h2>
<p>“{{ pendingDelete.title }}”及其子任务将被永久删除，此操作无法撤销。</p>
<div class="dialog-actions">
<button class="cancel-button" @click="pendingDelete = null">取消</button>
<button class="delete-button" @click="removeTask(pendingDelete); pendingDelete = null">确认删除</button>
</div>
</section>
</div>
</Transition>
<Transition name="dialog">
<div v-if="pendingListDelete" class="dialog-backdrop" @click.self="pendingListDelete = null" @keydown="trapDialogFocus">
<section class="confirm-dialog list-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-list-title" tabindex="-1">
<div class="dialog-icon">!</div>
<h2 id="delete-list-title">删除清单“{{ pendingListDelete.name }}”？</h2>
<p>请选择如何处理清单中的任务。</p>
<label class="delete-policy">
<input v-model="listDeletePolicy" type="radio" value="keep" />
<span>
<strong>保留任务</strong>
<small>任务将转为“无清单”</small>
</span>
</label>
<label class="delete-policy danger-policy">
<input v-model="listDeletePolicy" type="radio" value="delete" />
<span>
<strong>同时删除任务</strong>
<small>清单中的任务和子任务将永久删除</small>
</span>
</label>
<div class="dialog-actions">
<button class="cancel-button" @click="pendingListDelete = null">取消</button>
<button class="delete-button" @click="confirmListDelete">确认删除</button>
</div>
</section>
</div>
</Transition>
<Transition name="dialog">
<div v-if="shortcutsOpen" class="dialog-backdrop" @click.self="shortcutsOpen = false" @keydown="trapDialogFocus">
<section class="confirm-dialog shortcut-dialog" role="dialog" aria-modal="true" aria-labelledby="shortcut-title" tabindex="-1">
<h2 id="shortcut-title">键盘快捷键</h2>
<div class="shortcut-row">
<span>打开快捷捕获</span>
<kbd>Ctrl N</kbd>
</div>
<div class="shortcut-row">
<span>全局快速捕获</span>
<kbd>Ctrl Alt Space</kbd>
</div>
<div class="shortcut-row">
<span>关闭浮层</span>
<kbd>Esc</kbd>
</div>
<div class="shortcut-row">
<span>打开帮助</span>
<kbd>?</kbd>
</div>
<button class="save-button" @click="shortcutsOpen = false">知道了</button>
</section>
</div>
</Transition>
<Transition name="toast">
<div v-if="toast" class="toast">✓ {{ toast }}<button v-if="toastAction" @click="runToastAction">{{ toastAction.label }}</button>
</div>
</Transition>
</template>

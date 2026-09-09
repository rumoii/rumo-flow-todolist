<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import type { EditorLeave } from '../composables/editor-leave'
const props = defineProps<{ guard: EditorLeave }>()
const dialog = ref<HTMLElement>()
watch(props.guard.opened, async value => { if (value) { await nextTick(); dialog.value?.querySelector<HTMLElement>('[data-cancel]')?.focus() } })
function keyboard(event: KeyboardEvent) {
  event.stopPropagation()
  if (event.key === 'Escape') { event.preventDefault(); void props.guard.choose('cancel') }
  if (event.key !== 'Tab') return
  const buttons = [...dialog.value!.querySelectorAll<HTMLElement>('button:not(:disabled)')]
  const first = buttons[0]
  const last = buttons[buttons.length - 1]
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
}
</script>
<template>
  <Teleport to="body">
    <div v-if="guard.opened.value" class="editor-leave-layer" @keydown="keyboard">
      <section ref="dialog" class="editor-leave-dialog" role="dialog" aria-modal="true" aria-labelledby="editor-leave-title">
        <h2 id="editor-leave-title">离开前，处理未保存的输入</h2>
        <p>以下内容尚未正式保存。保留为草稿后，可以回来继续编辑。</p>
        <ul><li v-for="item in guard.items.value" :key="item.id">{{ item.label }}</li></ul>
        <div v-if="guard.error.value" class="editor-leave-error" role="alert">{{ guard.error.value }}</div>
        <footer>
          <button data-cancel class="secondary-button" :disabled="guard.working.value" @click="guard.choose('cancel')">取消</button>
          <button class="secondary-button" :disabled="guard.working.value" @click="guard.choose('retain')">保留草稿并继续</button>
          <button class="primary-button" :disabled="guard.working.value" @click="guard.choose('save')">{{ guard.working.value ? '正在处理…' : '保存并继续' }}</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
<style scoped>
.editor-leave-layer { position: fixed; inset: 0; z-index: 300; display: grid; place-items: center; padding: 20px; background: rgb(0 0 0 / .32); }
.editor-leave-dialog { width: min(540px, 100%); max-height: 85vh; overflow: auto; padding: 28px; border: 1px solid var(--border); border-radius: 16px; background: var(--surface); color: var(--text); box-shadow: 0 20px 80px rgb(0 0 0 / .2); }
h2 { margin: 0 0 12px; font-size: 19px; }
p, li { font-size: 13px; line-height: 1.7; color: var(--text-secondary); }
ul { max-height: 160px; overflow: auto; padding-left: 20px; }
footer { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; margin-top: 24px; }
.primary-button { padding: 9px 14px; border-radius: 8px; background: var(--accent-solid); color: #fff; font-size: 12px; transition: filter var(--motion-fast); }
.primary-button:hover { filter: brightness(.94); }
button:disabled { opacity: .6; cursor: wait; }
@media (prefers-reduced-motion: reduce) { .primary-button { transition: none; } }
.editor-leave-error { padding: 12px; max-height: 140px; overflow: auto; overflow-wrap: anywhere; border: 1px solid var(--border); border-radius: 8px; color: var(--danger, #d45757); }
</style>

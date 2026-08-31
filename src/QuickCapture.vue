<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { parseQuickAdd } from './shared/quick-add'
import { ensureTags } from './shared/tag-utils'
import type { AppSettings, Tag, TaskList } from './shared/contracts'

const title = ref('')
const input = ref<HTMLInputElement>()
const lists = ref<TaskList[]>([])
const tags = ref<Tag[]>([])
const message = ref('')
const messageKind = ref<'success' | 'error' | ''>('')
const submitting = ref(false)
let closeTimer: number | undefined
let removeSettingsListener: (() => void) | undefined

function applyTheme(settings: Pick<AppSettings, 'theme' | 'density'>) {
  document.documentElement.dataset.theme = settings.theme
  document.documentElement.dataset.density = settings.density
}

function closeCapture() {
  window.clearTimeout(closeTimer)
  window.close()
}

onMounted(async () => {
  const [loadedLists, loadedTags, settings] = await Promise.all([window.todoApi.lists.list(), window.todoApi.tags.list(), window.todoApi.settings.get()])
  lists.value = loadedLists
  tags.value = loadedTags
  applyTheme(settings ?? { theme: 'dark', density: 'comfortable' })
  removeSettingsListener = window.todoApi.settings.onChanged?.(applyTheme)
  await nextTick()
  input.value?.focus()
})

async function submit() {
  if (submitting.value) return
  const parsed = parseQuickAdd(title.value, lists.value, tags.value)
  if (!parsed.input.title.trim()) return

  submitting.value = true
  try {
    const resolved = await ensureTags(window.todoApi, tags.value, parsed.tagNames)
    await window.todoApi.tasks.create({ ...parsed.input, tagIds: resolved.tags.map(tag => tag.id) })
    title.value = ''
    messageKind.value = resolved.failed.length ? 'error' : 'success'
    message.value = resolved.failed.length ? `任务已保存，标签创建失败：${resolved.failed.join('、')}` : '已加入收集箱'

    if (!resolved.failed.length) {
      window.clearTimeout(closeTimer)
      closeTimer = window.setTimeout(closeCapture, 720)
    }
  } catch {
    messageKind.value = 'error'
    message.value = '保存失败，请稍后重试'
    await nextTick()
    input.value?.focus()
  } finally {
    submitting.value = false
  }
}

onBeforeUnmount(() => { window.clearTimeout(closeTimer); removeSettingsListener?.() })
</script>

<template>
  <main class="capture-shell" @keydown.esc.prevent="closeCapture">
    <section class="capture-card">
      <header class="capture-header">
        <div class="capture-brand">
          <img src="/favicon.svg" alt="Rumo-Flow" />
          <div>
            <strong>快速捕获</strong>
            <span>把想法先记下来</span>
          </div>
        </div>
        <span class="capture-badge">RUMO-FLOW</span>
      </header>

      <div class="capture-input-wrap" :class="{ 'has-message': message }">
        <span class="capture-input-icon" aria-hidden="true">＋</span>
        <input ref="input" v-model="title" :disabled="submitting" aria-label="快速捕获任务" placeholder="写下任务…" @keydown.enter.prevent="submit">
        <kbd>Enter</kbd>
      </div>

      <Transition name="capture-feedback" mode="out-in">
        <p v-if="message" key="message" class="capture-message" :class="`is-${messageKind}`" aria-live="polite">
          <span aria-hidden="true">{{ messageKind === 'success' ? '✓' : '!' }}</span>{{ message }}
        </p>
        <div v-else key="hints" class="capture-hints" aria-label="快速语法提示">
          <span><b>#</b>标签</span>
          <span><b>!</b>优先级</span>
          <span><b>@</b>日期</span>
          <span><b>~</b>清单</span>
          <span class="capture-close-hint"><kbd>Esc</kbd> 关闭</span>
        </div>
      </Transition>
    </section>
  </main>
</template>

<style scoped>
:global(html.capture-page), :global(html.capture-page body), :global(html.capture-page #app) { width: 100%; min-width: 0; height: 100%; margin: 0; overflow: hidden; }
:global(html.capture-page body) { background: transparent; }
:global(html.capture-page) { --capture-bg:radial-gradient(circle at 12% 0%,rgba(133,106,249,.22),transparent 42%),linear-gradient(145deg,#14131a,#24202f 58%,#17161d);--capture-card:linear-gradient(145deg,rgba(37,34,48,.96),rgba(26,25,34,.98));--capture-text:#f8f7fc;--capture-muted:#a9a3b7;--capture-border:rgba(177,158,255,.28);--capture-input:rgba(18,17,24,.68);--capture-input-focus:rgba(18,17,24,.9);--capture-input-border:#504966;--capture-placeholder:#777286;--capture-key-bg:#302c3c;--capture-key-border:#4d475e;--capture-key-text:#b7afc8;--capture-hint-bg:rgba(255,255,255,.035); }
:global(html.capture-page[data-theme="light"]) { --capture-bg:radial-gradient(circle at 12% 0%,rgba(133,106,249,.14),transparent 44%),linear-gradient(145deg,#f7f5ff,#f1eefb 58%,#f8f7fc);--capture-card:linear-gradient(145deg,rgba(255,255,255,.98),rgba(248,247,252,.99));--capture-text:#33313a;--capture-muted:#817b8d;--capture-border:rgba(133,106,249,.22);--capture-input:#fff;--capture-input-focus:#fff;--capture-input-border:#d8d3e5;--capture-placeholder:#a5a0ae;--capture-key-bg:#f0edf7;--capture-key-border:#d9d4e3;--capture-key-text:#716b7e;--capture-hint-bg:rgba(51,49,58,.04); }

.capture-shell { width: 100vw; height: 100vh; min-width: 0; padding: 14px; overflow: hidden; box-sizing: border-box; background:var(--capture-bg); color:var(--capture-text); font-family: Inter, -apple-system, BlinkMacSystemFont, "Microsoft YaHei", sans-serif; }
.capture-card { width: 100%; height: 100%; padding: 17px 18px 14px; box-sizing: border-box; border: 1px solid var(--capture-border); border-radius: 14px; background:var(--capture-card); box-shadow: 0 12px 30px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,.05); }
.capture-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.capture-brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
.capture-brand img { width: 32px; height: 32px; flex: none; border-radius: 9px; box-shadow: 0 4px 12px rgba(133,106,249,.32); }
.capture-brand div { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.capture-brand strong { font-size: 14px; font-weight: 650; letter-spacing: .1px; }
.capture-brand span { color:var(--capture-muted); font-size: 10px; }
.capture-badge { padding: 4px 7px; border: 1px solid var(--capture-border); border-radius: 5px; color: #a99bf0; font-size: 8px; font-weight: 650; letter-spacing: 1px; }
.capture-input-wrap { display: flex; align-items: center; gap: 9px; height: 46px; padding: 0 10px; border: 1px solid var(--capture-input-border); border-radius: 9px; background:var(--capture-input); box-shadow: inset 0 1px 2px rgba(0,0,0,.12); transition: border-color .18s ease, box-shadow .18s ease, background-color .18s ease; }
.capture-input-wrap:focus-within { border-color: #9b87ff; background:var(--capture-input-focus); box-shadow: 0 0 0 3px rgba(133,106,249,.16), inset 0 1px 2px rgba(0,0,0,.12); }
.capture-input-wrap.has-message { border-color: rgba(42,188,128,.65); }
.capture-input-icon { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 7px; background: #856af9; color: #fff; font-size: 17px; line-height: 1; box-shadow: 0 3px 8px rgba(133,106,249,.3); }
.capture-input-wrap input { min-width: 0; flex: 1; border: 0; outline: 0; background: transparent; color:var(--capture-text); font-size: 16px; }
.capture-input-wrap input::placeholder { color:var(--capture-placeholder); }
.capture-input-wrap kbd, .capture-hints kbd { flex: none; padding: 3px 6px; border: 1px solid var(--capture-key-border); border-radius: 5px; background:var(--capture-key-bg); color:var(--capture-key-text); font-size: 9px; font-family: inherit; }
.capture-hints { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; margin-top: 11px; color:var(--capture-muted); font-size: 10px; }
.capture-hints span { padding: 4px 6px; border-radius: 5px; background:var(--capture-hint-bg); }
.capture-hints b { margin-right: 2px; color: #b8aaff; font-weight: 650; }
.capture-hints .capture-close-hint { display: inline-flex; align-items: center; gap: 5px; margin-left: auto; padding: 0; background: transparent; }
.capture-message { display: flex; align-items: center; gap: 6px; min-height: 24px; margin: 9px 1px 0; color:var(--capture-muted); font-size: 10px; }
.capture-message span { display: grid; place-items: center; width: 16px; height: 16px; border-radius: 50%; color: #fff; font-size: 10px; }
.capture-message.is-success { color: #8ee1bd; }
.capture-message.is-success span { background: #2abc80; }
.capture-message.is-error { color: #f0a4a4; }
.capture-message.is-error span { background: #e76666; }
.capture-feedback-enter-active, .capture-feedback-leave-active { transition: opacity .18s ease, transform .18s ease; }
.capture-feedback-enter-from, .capture-feedback-leave-to { opacity: 0; transform: translateY(-3px); }
@media (prefers-reduced-motion: reduce) { .capture-input-wrap, .capture-feedback-enter-active, .capture-feedback-leave-active { transition: none; } }
</style>

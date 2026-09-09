import { computed, ref, watch, type Ref } from 'vue'

export function useWorkspaceSearch(view: Ref<string>, title: Ref<string>, taskKeyword: Ref<string>) {
  const open = ref(false)
  const scope = ref<'all' | 'current'>('all')
  const globalQuery = ref('')
  const historyKeyword = ref('')
  const historyVisible = ref(false)
  const currentAvailable = computed(() => view.value === 'flow' ? historyVisible.value : !['tags', 'trash'].includes(view.value))
  const currentName = computed(() => view.value === 'flow' ? '心流历史' : title.value)
  const currentKeyword = computed({
    get: () => view.value === 'flow' ? historyKeyword.value : taskKeyword.value,
    set: value => { if (view.value === 'flow') historyKeyword.value = value; else taskKeyword.value = value },
  })
  function show(current = false) { scope.value = current && currentAvailable.value ? 'current' : 'all'; open.value = true }
  watch(view, () => { taskKeyword.value = ''; open.value = false })
  return { open, scope, globalQuery, historyKeyword, historyVisible, currentAvailable, currentName, currentKeyword, show }
}

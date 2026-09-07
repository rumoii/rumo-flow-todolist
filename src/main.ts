import { createApp } from 'vue'
import App from './App.vue'
import QuickCapture from './QuickCapture.vue'
import './styles.css'
import './motion.css'
import { createDraftCoordinator, draftCoordinatorKey } from './composables/draft-coordinator'

const isQuickCapture = new URLSearchParams(location.search).get('capture') === '1'
if (isQuickCapture) document.documentElement.classList.add('capture-page')
const drafts = createDraftCoordinator(window.todoApi)
drafts.connect()
createApp(isQuickCapture ? QuickCapture : App).provide(draftCoordinatorKey, drafts).mount('#app')

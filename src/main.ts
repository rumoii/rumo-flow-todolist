import { createApp } from 'vue'
import App from './App.vue'
import QuickCapture from './QuickCapture.vue'
import './styles.css'
import './motion.css'

const isQuickCapture = new URLSearchParams(location.search).get('capture') === '1'
if (isQuickCapture) document.documentElement.classList.add('capture-page')
createApp(isQuickCapture ? QuickCapture : App).mount('#app')

import { createApp } from 'vue'
import App from './App.vue'
import QuickCapture from './QuickCapture.vue'
import './styles.css'
import './motion.css'

createApp(new URLSearchParams(location.search).get('capture') === '1' ? QuickCapture : App).mount('#app')

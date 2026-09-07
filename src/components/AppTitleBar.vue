<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import icon from '../assets/rumo-flow-icon.svg'
const enabled = new URLSearchParams(window.location.search).get('titlebar') === '1'
onMounted(() => { document.documentElement.classList.toggle('custom-titlebar', enabled) })
onBeforeUnmount(() => { document.documentElement.classList.remove('custom-titlebar') })
</script>

<template>
  <header v-if="enabled" class="app-titlebar"><img :src="icon" alt="" /><span>Rumo-Flow</span></header>
</template>

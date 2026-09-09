<script setup lang="ts">
import { provide } from 'vue'
import { useWorkspace } from './features/workspace/useWorkspace'
import { workspaceKey } from './features/workspace/context'
import AppSidebar from './features/workspace/AppSidebar.vue'
import TaskPage from './features/workspace/TaskPage.vue'
import WorkspaceSearch from './features/workspace/WorkspaceSearch.vue'
import TaskDetail from './features/workspace/TaskDetail.vue'
import SettingsDialog from './features/workspace/SettingsDialog.vue'
import WorkspaceDialogs from './features/workspace/WorkspaceDialogs.vue'
import AppTitleBar from './components/AppTitleBar.vue'
const workspace = useWorkspace()
provide(workspaceKey, workspace)
</script>

<template>
  <AppTitleBar />
  <div class="app-shell" :inert="workspace.drafts.paused.value || workspace.drafts.saving.value" @click="workspace.closeMenus">
    <AppSidebar :inert="workspace.detailOpen.value || workspace.workspaceSearch.open.value" />
    <TaskPage :inert="workspace.detailOpen.value || workspace.workspaceSearch.open.value" />
    <TaskDetail />
    <SettingsDialog />
    <WorkspaceDialogs />
    <WorkspaceSearch />
  </div>
</template>

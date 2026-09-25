<template>
    <main class="settings-layout-view" data-plugin-style-surface="settings">
    <router-view />
  </main>
</template>

<style scoped>
/* 不要 overflow:hidden：否则设置内容无法撑高 .app-content，鼠标滚轮会滚不动 */
.settings-layout-view { position: relative; width: 100%; min-height: 100%; }
</style>

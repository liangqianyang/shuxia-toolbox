<template>
  <!-- 工具图标：以 / 或 http(s):// 开头视为图片路径（本地包内 / 七牛 CDN），否则当 emoji 文字渲染 -->
  <image v-if="isImage" class="tool-icon tool-icon--image" :src="icon" mode="aspectFit" />
  <text v-else class="tool-icon tool-icon--emoji">{{ icon }}</text>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ icon: string }>()

const isImage = computed(() => props.icon.startsWith('/') || props.icon.startsWith('http'))
</script>

<style scoped>
/* 尺寸由父级 class 直接挂在组件宿主上（小程序父级样式可作用于组件根节点）；
   不要包一层 view——宿主默认无尺寸，包 view 后内部 100% 会算成 0。 */
.tool-icon--image {
  width: 100%;
  height: 100%;
  border-radius: inherit;
}
</style>

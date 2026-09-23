<template>
  <!-- 工具图标：以 / 或 http(s):// 开头视为图片路径（本地包内 / 七牛 CDN），否则当 emoji 文字渲染 -->
  <image v-if="isImage" class="tool-icon tool-icon--image" :src="icon" mode="aspectFit" />
  <!-- emoji 根节点必须是 view 而非 text：宿主已被父级 class 撑到 100%×100%，
       text 是行内内容只会贴在宿主左上角（工具箱/游戏列表图标偏左上即此因），
       view 才能 flex 居中 -->
  <view v-else class="tool-icon tool-icon--emoji">{{ icon }}</view>
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

/* emoji：撑满宿主再自身居中（父级的 flex 只作用于宿主，管不到里面这层） */
.tool-icon--emoji {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>

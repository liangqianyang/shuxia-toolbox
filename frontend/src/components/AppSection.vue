<!-- 分段列表容器：标题 + 计数（可选）+ 默认插槽放条目。
     title/count 都不传时只渲染纵向容器（gap/段间距），当纯列表布局用。 -->
<template>
  <view class="app-section">
    <view v-if="title || count" class="app-section__head">
      <text class="app-section__title">{{ title }}</text>
      <text v-if="count" class="app-section__count">{{ count }}</text>
      <slot name="action" />
    </view>
    <slot />
  </view>
</template>

<script setup lang="ts">
defineProps<{
  title?: string
  count?: string
}>()
</script>

<style lang="scss" scoped>
.app-section {
  display: flex;
  flex-direction: column;
  gap: $space-2;
  margin-bottom: $space-4;

  &__head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: $space-3;
  }

  &__title {
    font-size: $font-body;
    font-weight: 600;
    color: $color-text;
  }

  &__count {
    font-size: $font-caption;
    color: $color-text-secondary;
  }
}
</style>

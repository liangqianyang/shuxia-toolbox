<!-- 分段列表容器：标题 + 计数（可选）+ 默认插槽放条目。
     title/count 都不传时只渲染纵向容器（gap/段间距），当纯列表布局用。
     card 模式（v4 分组列表）：标题转 seclabel，插槽包进白底发丝线圆角组卡，
     行间发丝线由行组件自带的 divided 控制；不传 card 保持旧漂浮卡布局。 -->
<template>
  <view class="app-section">
    <view v-if="title || count" class="app-section__head">
      <text class="app-section__title" :class="{ 'app-section__title--label': card }">{{ title }}</text>
      <text v-if="count" class="app-section__count" :class="{ 'app-section__count--label': card }">{{ count }}</text>
      <slot name="action" />
    </view>
    <view v-if="card" class="app-section__group">
      <slot />
    </view>
    <slot v-else />
  </view>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string
    count?: string
    /** v4 分组列表：白卡容器 + 发丝线 */
    card?: boolean
  }>(),
  { card: false },
)
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

    &--label {
      font-size: 22rpx;
      font-weight: 600;
      color: $ink3;
      letter-spacing: 3rpx;
    }
  }

  &__count {
    font-size: $font-caption;
    color: $color-text-secondary;

    &--label {
      font-size: 22rpx;
      font-weight: 400;
      color: $ink3;
      letter-spacing: 0;
    }
  }

  &__group {
    background: $card;
    border: 2rpx solid $line;
    border-radius: $radius-lg;
    overflow: hidden;
  }
}
</style>

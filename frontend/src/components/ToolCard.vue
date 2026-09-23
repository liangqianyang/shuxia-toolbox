<!-- 分组列表行（v4 核心排版单元）——原型 .trow 的唯一实现。
     home/toolbox/games/tool-library/admin 的工具/游戏行全部收编于此，禁止页面手抄。
     行间发丝线由使用方传 divided（WXSS 相邻兄弟选择器不可靠）；按压反馈需显式 pressable。
     .stop 必须：$emit('tap') 是原生事件名，不挡冒泡的话宿主 bindtap 会同时收到
     内部原生 tap 和自定义事件，点击触发两次（跳转压两层页面即此因）。 -->
<template>
  <view
    class="tool-card"
    :class="{ 'tool-card--divided': divided, 'tool-card--sm': size === 'sm' }"
    :hover-class="pressable ? 'press' : 'none'"
    @tap.stop="$emit('tap')"
  >
    <view class="tool-card__tile" :style="{ backgroundColor: pair.tint, color: pair.fg }">
      <ToolIcon class="tool-card__tile-icon" :icon="icon" />
    </view>
    <view class="tool-card__body">
      <view class="tool-card__title-row">
        <text class="tool-card__title">{{ title }}</text>
        <text v-if="badge" class="tool-card__badge">{{ badge }}</text>
      </view>
      <text class="tool-card__desc">{{ description }}</text>
    </view>
    <slot name="right" />
    <text v-if="chevron" class="tool-card__chev">›</text>
    <!-- 行下方附加区（如运营台的 状态+排序 行），需自撑满整行 -->
    <slot name="bottom" />
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import ToolIcon from '@/components/ToolIcon.vue'
import { pastel } from '@/utils/pastel'

const props = withDefaults(
  defineProps<{
    icon: string
    /** 淡彩图标组 key（= tool.key），未登记回退主蓝淡彩 */
    pastel?: string
    title: string
    description?: string
    /** 标题行尾红点徽章（数字） */
    badge?: string
    /** lg=88rpx 首页/列表行；sm=76rpx 管理页行 */
    size?: 'lg' | 'sm'
    /** 行尾细箭头 */
    chevron?: boolean
    /** 与上一行之间的发丝线 */
    divided?: boolean
    /** 整行可点时启用按压反馈 */
    pressable?: boolean
  }>(),
  { pastel: '', description: '', badge: '', size: 'lg', chevron: true, divided: false, pressable: false },
)

const emit = defineEmits<{ tap: [] }>()
void emit

const pair = computed(() => pastel(props.pastel))
</script>

<style lang="scss" scoped>
.tool-card {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 24rpx;
  padding: 26rpx 28rpx;
  transition: background-color 0.12s ease;

  &--divided {
    border-top: 2rpx solid $line;
  }

  &__tile {
    width: 88rpx;
    height: 88rpx;
    border-radius: 26rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 42rpx;
    flex-shrink: 0;
    overflow: hidden;
  }

  &--sm &__tile {
    width: 76rpx;
    height: 76rpx;
    border-radius: 22rpx;
    font-size: 36rpx;
  }

  &__tile-icon {
    width: 100%;
    height: 100%;
  }

  &__body {
    display: flex;
    flex-direction: column;
    gap: 4rpx;
    flex: 1;
    min-width: 0;
  }

  &__title-row {
    display: flex;
    align-items: center;
    gap: 12rpx;
    min-width: 0;
  }

  &__title {
    font-size: 30rpx;
    font-weight: 600;
    color: $ink;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &--sm &__title {
    font-size: 28rpx;
    font-weight: 500;
  }

  &__badge {
    min-width: 34rpx;
    height: 34rpx;
    padding: 0 8rpx;
    border-radius: $radius-pill;
    background: $red;
    color: #fff;
    font-size: 20rpx;
    font-weight: 600;
    line-height: 34rpx;
    text-align: center;
    flex-shrink: 0;
    box-sizing: border-box;
  }

  &__desc {
    font-size: 24rpx;
    color: $ink2;
    line-height: 1.45;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__chev {
    color: $ink3;
    font-size: 40rpx;
    line-height: 1;
    flex-shrink: 0;
  }
}
</style>

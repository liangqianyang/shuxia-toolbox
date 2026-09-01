<template>
  <view v-if="visible" class="rules-mask" @tap="$emit('close')">
    <view class="rules-panel" @tap.stop>
      <view class="rules-head">
        <text class="rules-title">{{ title }}</text>
        <text class="rules-close" @tap="$emit('close')">✕</text>
      </view>
      <scroll-view class="rules-body" scroll-y :show-scrollbar="false">
        <view v-for="(s, i) in sections" :key="i" class="rules-section">
          <text v-if="s.heading" class="rules-heading">{{ s.heading }}</text>
          <view v-for="(line, j) in s.lines" :key="j" class="rules-line">
            <text class="rules-bullet">·</text>
            <text class="rules-text">{{ line }}</text>
          </view>
        </view>
        <view class="rules-footer">祝玩得开心 🍁</view>
      </scroll-view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 通用游戏规则弹层：底部抽屉 + 分节滚动列表，四个联机游戏共用。
 * 内容由各页面以 sections 传入（heading 可省略），品牌色（奶油白/墨绿）通吃各游戏主题。
 */
defineProps<{
  visible: boolean
  title: string
  sections: { heading?: string; lines: string[] }[]
}>()

defineEmits<{ close: [] }>()
</script>

<style lang="scss" scoped>
$ink: #21483d;
$cream: #fff8ed;
$muted: #9aa79e;
$maple: #e85d4a;

.rules-mask {
  position: fixed;
  inset: 0;
  background: rgba(33, 42, 38, 0.5);
  z-index: 120;
  display: flex;
  align-items: flex-end;
}
.rules-panel {
  width: 100%;
  max-height: 78vh;
  background: $cream;
  border-radius: 32rpx 32rpx 0 0;
  padding: 28rpx 32rpx calc(28rpx + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
}
.rules-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12rpx;
}
.rules-title {
  font-size: 34rpx;
  font-weight: 800;
  color: $ink;
}
.rules-close {
  font-size: 34rpx;
  color: $muted;
  padding: 8rpx 12rpx;
}
.rules-body {
  max-height: 62vh;
  flex: 1;
}
.rules-section {
  margin-bottom: 20rpx;
}
.rules-heading {
  display: inline-block;
  font-size: 27rpx;
  font-weight: 700;
  color: #fff;
  background: $ink;
  border-radius: 10rpx;
  padding: 4rpx 18rpx;
  margin-bottom: 10rpx;
}
.rules-line {
  display: flex;
  gap: 10rpx;
  margin-bottom: 8rpx;
}
.rules-bullet {
  color: $maple;
  font-weight: 800;
  font-size: 26rpx;
  line-height: 40rpx;
}
.rules-text {
  flex: 1;
  font-size: 25rpx;
  color: #3c4a44;
  line-height: 40rpx;
}
.rules-footer {
  text-align: center;
  font-size: 22rpx;
  color: $muted;
  margin-top: 8rpx;
}
</style>

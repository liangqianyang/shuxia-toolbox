<template>
  <view v-if="visible" class="rules-mask" @tap="$emit('close')">
    <view class="rules-panel" @tap.stop>
      <view class="rules-head">
        <text class="rules-title">{{ title }}</text>
        <view class="rules-close" hover-class="press" @tap="$emit('close')"><text>✕</text></view>
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
 * 通用游戏规则弹层：底部抽屉 + 分节滚动列表，各游戏共用。
 * 内容由各页面以 sections 传入（heading 可省略），v4 小清新 chrome（白卡/蓝白）通吃各游戏主题。
 */
defineProps<{
  visible: boolean
  title: string
  sections: { heading?: string; lines: string[] }[]
}>()

defineEmits<{ close: [] }>()
</script>

<style lang="scss" scoped>
// v4 小清新：白底圆顶抽屉 + 蓝 tint 小节标 + 发丝线
$ink: #2e4154;
$muted: #a4b3c0;

.rules-mask {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background: rgba(46, 65, 84, 0.45);
  z-index: 120;
  display: flex;
  align-items: flex-end;
}
.rules-panel {
  width: 100%;
  max-height: 78vh;
  background: #ffffff;
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
  font-weight: 600;
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
  font-size: 26rpx;
  font-weight: 600;
  color: #3b86b8;
  background: #e9f4fb;
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
  color: #58a6dc;
  font-weight: 600;
  font-size: 26rpx;
  line-height: 40rpx;
}
.rules-text {
  flex: 1;
  font-size: 25rpx;
  color: $ink;
  line-height: 40rpx;
}
.rules-footer {
  text-align: center;
  font-size: 22rpx;
  color: $muted;
  margin-top: 8rpx;
}
</style>

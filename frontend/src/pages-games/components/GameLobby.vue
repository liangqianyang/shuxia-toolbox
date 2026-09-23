<!-- 游戏大厅（枫糖纸面模板）—— 8 款联机游戏共用的大厅面板。
     规格来源：docs/design/maple-paper-system.md「游戏大厅模板」+ maple-paper-prototype.html buildLobbies()。
     结构：Hero 图标块 → 创建房间/输入房码 双按钮 → 好友房间卡 → 「在这个游戏里」四宫格。
     页面级差异内容（如枫趣冒险的「我的对局」续局列表）放 #extra 插槽。
     事件全是自定义名（create/join/rules/chat/rematch），勿改成 tap——原生事件名会被父级
     bindtap 双重接收（见 ToolCard 的 .stop 注释）。 -->
<template>
  <view class="g-lobby">
    <view class="g-lobby__head">
      <view class="g-lobby__tile" :style="{ backgroundColor: pair.tint, color: pair.fg }">
        <ToolIcon :icon="icon" />
      </view>
      <view class="g-lobby__titles">
        <text class="g-lobby__kick">派对联机 · 房间码同玩</text>
        <text class="g-lobby__name">{{ name }}</text>
        <text class="g-lobby__desc">{{ description }}</text>
      </view>
    </view>

    <view class="g-lobby__actions">
      <view class="g-lobby__btn g-lobby__btn--primary" hover-class="press" :class="{ 'g-lobby__btn--disabled': busy }" @tap="!busy && $emit('create')">＋ 创建房间</view>
      <view class="g-lobby__btn g-lobby__btn--ghost" hover-class="press" @tap="focusCode">⌨ 输入房码</view>
    </view>

    <slot name="extra" />

    <view class="g-lobby__card">
      <text class="g-lobby__label">好友房间</text>
      <view class="g-lobby__join">
        <input
          v-model="code"
          class="g-lobby__inp"
          type="number"
          :maxlength="4"
          :focus="focused"
          :disabled="busy"
          placeholder="输入 4 位房间码"
          placeholder-class="g-lobby__ph"
          @confirm="submit"
        />
        <view class="g-lobby__joinbtn" hover-class="press" :class="{ 'g-lobby__joinbtn--disabled': busy || code.length !== 4 }" @tap="submit">加入</view>
      </view>
      <text class="g-lobby__note">把房间码发给好友，或直接微信分享房间链接</text>
    </view>

    <text class="g-lobby__seclabel">在这个游戏里</text>
    <view class="g-lobby__grid">
      <view class="g-lobby__feat" hover-class="press" @tap="$emit('rules')">
        <view class="g-lobby__feat-top">
          <text class="g-lobby__feat-icon">📖</text>
          <text class="g-lobby__feat-name">对局规则</text>
        </view>
        <text class="g-lobby__feat-desc">图解玩法与胜负判定</text>
      </view>
      <view class="g-lobby__feat" hover-class="press" @tap="$emit('chat')">
        <view class="g-lobby__feat-top">
          <text class="g-lobby__feat-icon">💬</text>
          <text class="g-lobby__feat-name">房间聊天</text>
        </view>
        <text class="g-lobby__feat-desc">快捷句 · 表情</text>
      </view>
      <button class="g-lobby__feat g-lobby__feat--share" open-type="share" hover-class="press">
        <view class="g-lobby__feat-top">
          <text class="g-lobby__feat-icon">👋</text>
          <text class="g-lobby__feat-name">邀请好友</text>
        </view>
        <text class="g-lobby__feat-desc">微信卡片直达房间</text>
      </button>
      <view class="g-lobby__feat" hover-class="press" @tap="$emit('rematch')">
        <view class="g-lobby__feat-top">
          <text class="g-lobby__feat-icon">🔁</text>
          <text class="g-lobby__feat-name">再来一局</text>
        </view>
        <text class="g-lobby__feat-desc">房间保留，直接重开</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import ToolIcon from '@/components/ToolIcon.vue'
import { pastel } from '@/utils/pastel'

const props = withDefaults(
  defineProps<{
    name: string
    description: string
    icon: string
    /** 淡彩图标组 key（= tool.key） */
    pastelKey: string
    /** 创建/加入请求进行中（按钮禁用态） */
    busy?: boolean
  }>(),
  { busy: false },
)

const emit = defineEmits<{
  create: []
  join: [code: string]
  rules: []
  chat: []
  rematch: []
}>()
void emit

const pair = computed(() => pastel(props.pastelKey))
const code = ref('')
const focused = ref(false)

function focusCode() {
  focused.value = true
}

function submit() {
  if (props.busy || code.value.length !== 4) return
  emit('join', code.value)
}
</script>

<style lang="scss" scoped>
/* 原型 px → rpx ×2；间距/字阶/圆角优先取 token，不在刻度上的取原型实值 */
.g-lobby {
  display: flex;
  flex-direction: column;
  gap: $space-3;

  &__head {
    display: flex;
    align-items: center;
    gap: $space-3;
    padding: $space-2 $space-1 0;
  }

  &__tile {
    width: 88rpx;
    height: 88rpx;
    border-radius: 26rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 44rpx;
    flex-shrink: 0;
    overflow: hidden;
  }

  &__titles {
    display: flex;
    flex-direction: column;
    gap: 4rpx;
    min-width: 0;
  }

  &__kick {
    font-size: 20rpx;
    letter-spacing: 5rpx;
    color: $blue-deep;
    font-weight: 700;
    margin-bottom: 4rpx;
  }

  &__name {
    font-size: 38rpx;
    font-weight: 700;
    color: $ink;
    line-height: 1.2;
  }

  &__desc {
    font-size: $font-caption;
    color: $ink2;
    margin-top: 6rpx;
  }

  &__actions {
    display: flex;
    gap: 18rpx;
  }

  &__btn {
    flex: 1;
    border-radius: $radius-md + 4rpx;
    padding: 26rpx 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12rpx;
    font-size: $font-body;
    font-weight: 600;

    &--primary {
      background: $blue;
      color: #fff;
    }

    &--ghost {
      background: $card;
      border: 2rpx solid $line-strong;
      color: $ink;
    }

    &--disabled {
      opacity: 0.5;
    }
  }

  &__card {
    background: $card;
    border-radius: $radius-lg;
    box-shadow: $shadow-card;
    padding: $space-3 + 4rpx;
    display: flex;
    flex-direction: column;
    gap: 18rpx;
  }

  &__label {
    font-size: 26rpx;
    font-weight: 600;
    color: $ink;
  }

  &__join {
    display: flex;
    gap: $space-2;
  }

  &__inp {
    flex: 1;
    background: #fff;
    border: 2rpx solid $line-strong;
    border-radius: $radius-md;
    padding: 20rpx 24rpx;
    font-size: 26rpx;
    color: $ink;
    text-align: center;
    letter-spacing: 12rpx;
    font-weight: 600;
    height: auto;
    min-height: 0;
  }

  &__ph {
    color: $ink3;
    letter-spacing: 0;
    font-weight: 400;
  }

  &__joinbtn {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    border-radius: $radius-md;
    padding: 0 30rpx;
    font-size: $font-caption;
    font-weight: 600;
    color: $blue-deep;

    &--disabled {
      color: $ink3;
    }
  }

  &__note {
    font-size: 20rpx;
    color: $ink3;
    line-height: 1.6;
  }

  &__seclabel {
    font-size: $font-micro;
    font-weight: 600;
    color: $ink3;
    letter-spacing: 3rpx;
    padding: 4rpx $space-1 0;
  }

  &__grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 18rpx;
  }

  &__feat {
    background: $card;
    border: 2rpx solid $line;
    border-radius: 28rpx;
    padding: 22rpx 24rpx;
    display: flex;
    flex-direction: column;
    gap: 4rpx;
    text-align: left;
    line-height: inherit;

    &--share {
      margin: 0;
      padding: 22rpx 24rpx;
      width: auto;
      font-size: inherit;
      background: $card;

      &::after {
        border: none;
      }
    }
  }

  &__feat-top {
    display: flex;
    align-items: center;
    gap: 10rpx;
  }

  &__feat-icon {
    font-size: 26rpx;
  }

  &__feat-name {
    font-size: $font-caption;
    font-weight: 600;
    color: $ink;
  }

  &__feat-desc {
    font-size: 18rpx;
    color: $ink3;
  }
}
</style>

<!-- 游戏大厅（枫糖纸面模板）—— 8 款联机游戏共用的大厅面板。
     规格来源：docs/design/maple-paper-system.md「游戏大厅模板」+ maple-paper-prototype.html buildLobbies()。
     结构：Hero 图标块（右侧 ⓘ 开对局规则）→ 创建房间/输入房码 双按钮 → 好友房间卡。
     页面级差异内容（如枫趣冒险的「我的对局」续局列表）放 #extra 插槽。
     2026-09-23 用户拍板：原「在这个游戏里」四宫格（对局规则/房间聊天/邀请好友/再来一局）整体下线——
     聊天/邀请/再来一局只在房间创建好后可用（房内聊天 dock、胶囊菜单分享、房内重开），规则改成
     tetris 菜单同款 hero ⓘ 圆钮弹出 GameRulesModal。
     组件自身不带页边距——页面必须提供左右 padding（包一层 .lobby 或页面根加
     `padding: 0 $space-4`），否则按钮/卡片贴屏幕边（uno/ludo/adventure 曾踩）。
     事件全是自定义名（create/join/rules），勿改成 tap——原生事件名会被父级
     bindtap 双重接收（见 ToolCard 的 .stop 注释）。 -->
<template>
  <view class="g-lobby">
    <view class="g-lobby__head">
      <view class="g-lobby__tile" :style="{ backgroundColor: pair.tint, color: pair.fg }">
        <ToolIcon class="g-lobby__tile-icon" :icon="icon" />
      </view>
      <view class="g-lobby__titles">
        <text class="g-lobby__kick">派对联机 · 房间码同玩</text>
        <text class="g-lobby__name">{{ name }}</text>
        <text class="g-lobby__desc">{{ description }}</text>
      </view>
      <view class="g-lobby__flex"></view>
      <view class="g-lobby__rules-btn" hover-class="press" @tap="$emit('rules')">
        <text>ⓘ</text>
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
/* 间距一律用 margin，不用 flex gap：DevTools 旧基础库/旧 WebView 不渲染 flex gap
   （grid gap 支持更早，原四宫格已下线）。原型 px → rpx ×2，token 优先。 */
.g-lobby {
  display: flex;
  flex-direction: column;

  &__head {
    display: flex;
    align-items: center;
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

  /* ToolIcon 宿主必须由父级 class 定尺寸（见 ToolIcon 注释），否则图标块渲染成纯色空块 */
  &__tile-icon {
    width: 100%;
    height: 100%;
  }

  &__titles {
    display: flex;
    flex-direction: column;
    min-width: 0;
    margin-left: $space-3;
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

  &__flex {
    flex: 1;
  }

  /* 对局规则 ⓘ（tetris 菜单同款圆钮） */
  &__rules-btn {
    flex-shrink: 0;
    width: 64rpx;
    height: 64rpx;
    border-radius: 50%;
    background: $card;
    border: 2rpx solid $line-strong;
    display: flex;
    align-items: center;
    justify-content: center;
    color: $ink2;
    font-size: $font-body;
  }

  &__actions {
    display: flex;
    margin-top: $space-3;
  }

  &__btn {
    flex: 1;
    border-radius: $radius-md + 4rpx;
    padding: 26rpx 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: $font-body;
    font-weight: 600;

    & + & {
      margin-left: $space-3;
    }

    &--primary {
      background: $blue;
      color: #fff;
    }

    &--ghost {
      background: $card;
      border: 2rpx solid $line-strong;
      color: $ink;
      box-shadow: $shadow-card;
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
    margin-top: $space-3;
  }

  &__label {
    font-size: 26rpx;
    font-weight: 600;
    color: $ink;
  }

  &__join {
    display: flex;
    margin-top: 18rpx;
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
    margin-left: $space-2;
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
    margin-top: 18rpx;
  }
}
</style>

<template>
  <view v-if="c.chatPanelOpen" class="gcp-mask" @tap="c.chatPanelOpen = false">
    <view class="gcp-panel" @tap.stop>
      <view class="gcp-tabs">
        <view v-for="t in tabs" :key="t.key" class="gcp-tab" :class="{ active: c.chatTab === t.key }" hover-class="press" @tap="c.chatTab = t.key">
          {{ t.label }}
        </view>
        <view class="gcp-close" hover-class="press" @tap="c.chatPanelOpen = false">✕</view>
      </view>
      <scroll-view class="gcp-log" scroll-y :show-scrollbar="false">
        <view v-for="m in c.chatLog" :key="m.seq" class="gcp-log-row">
          <text class="gcp-log-name">{{ c.chatNameOf(m) }}：</text>
          <text class="gcp-log-text" :class="{ 'gcp-log-emoji': m.kind === 'emoji' }">{{ m.kind === 'sticker' ? '[贴纸]' : c.chatBody(m) }}</text>
        </view>
      </scroll-view>
      <view v-if="c.chatTab === 'quick'" class="gcp-groups">
        <view v-for="g in c.phraseGroups" :key="g.key" class="gcp-group">
          <view class="gcp-group-title">{{ g.title }}</view>
          <view class="gcp-group-btns">
            <view
              v-for="p in g.phrases"
              :key="p.id"
              class="gcp-phrase"
              :class="{ disabled: c.chatCooling }"
              hover-class="press"
              @tap="c.sendPhrase(p.id)"
            >{{ p.text }}</view>
          </view>
        </view>
      </view>
      <view v-else-if="c.chatTab === 'emoji'" class="gcp-emoji-grid">
        <view v-for="e in emojis" :key="e" class="gcp-emoji" :class="{ disabled: c.chatCooling }" hover-class="press" @tap="c.sendEmoji(e)">{{ e }}</view>
      </view>
      <view v-else class="gcp-text-row">
        <template v-if="textEnabled">
          <input
            v-model="c.chatInput"
            class="gcp-input"
            type="text"
            maxlength="40"
            placeholder="说点什么（40 字内，须经审核）"
            confirm-type="send"
            :disabled="c.chatCooldown > 0"
            @confirm="c.sendText"
          />
          <button class="gcp-send" :disabled="c.chatCooling || !c.chatInput.trim()" @tap="c.sendText">
            {{ c.chatCooling ? `${c.chatCooldown}s` : '发送' }}
          </button>
        </template>
        <view v-else class="gcp-text-off">文字聊天维护中，先用快捷句和表情斗图吧</view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 通用房间聊天面板（飞行棋/五子棋/军棋/象棋/井字棋/斗兽棋共用）：底部抽屉三 tab（快捷/表情/文字）。
 * 状态机来自 useRoomChat（页面把返回的控制器整包传入，nameOf 提供发送者昵称）；文字 tab 受全局开关控制
 * （feature.uno_chat_text，前端读 unoChatTextEnabled）。贴纸已下线（历史贴纸消息在日志里显示 [贴纸] 占位）。
 */
import { reactive } from 'vue'
import { GAME_EMOJIS } from '@/pages-games/utils/gameChat'
import type { useRoomChat } from '@/pages-games/composables/useRoomChat'

const props = defineProps<{
  ctrl: ReturnType<typeof useRoomChat>
  textEnabled: boolean
}>()

// reactive 包一层让模板直接访问（refs 自动解包，不再写 .value）
const c = reactive(props.ctrl)

const tabs = [
  { key: 'quick', label: '快捷' },
  { key: 'emoji', label: '表情' },
  { key: 'text', label: '文字' },
] as const

const emojis = GAME_EMOJIS
</script>

<style lang="scss" scoped>
$ink: #21483d;
$cream: #fff8ed;
$muted: #9aa79e;
$maple: #e85d4a;
$gold: #f4b942;

.gcp-mask { position: fixed; inset: 0; background: rgba(33, 42, 38, 0.5); z-index: 110; display: flex; align-items: flex-end; }
.gcp-panel {
  width: 100%; max-height: 72vh; background: $cream; border-radius: 32rpx 32rpx 0 0;
  padding: 24rpx 24rpx calc(24rpx + env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 16rpx;
}
.gcp-tabs { display: flex; gap: 24rpx; align-items: center; }
.gcp-tab { font-size: 28rpx; color: $muted; padding: 8rpx 4rpx; border-bottom: 5rpx solid transparent; }
.gcp-tab.active { color: $ink; font-weight: 800; border-bottom-color: $maple; }
.gcp-close { margin-left: auto; font-size: 32rpx; color: $muted; padding: 8rpx; }
.gcp-log { max-height: 260rpx; background: rgba(255, 255, 255, 0.7); border-radius: 16rpx; padding: 12rpx 20rpx; }
.gcp-log-row { display: flex; gap: 8rpx; padding: 6rpx 0; align-items: baseline; }
.gcp-log-name { font-size: 22rpx; color: $muted; white-space: nowrap; flex-shrink: 0; }
.gcp-log-text { font-size: 24rpx; color: $ink; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gcp-log-emoji { font-size: 40rpx; flex-shrink: 0; }
.gcp-groups { max-height: 320rpx; overflow-y: auto; }
.gcp-group { margin-bottom: 16rpx; }
.gcp-group-title { font-size: 22rpx; color: $muted; margin-bottom: 8rpx; }
.gcp-group-btns { display: flex; flex-wrap: wrap; gap: 12rpx; }
.gcp-phrase {
  font-size: 24rpx; color: $ink; background: #fff; border-radius: 999rpx; padding: 10rpx 24rpx;
  border: 2rpx solid rgba(33, 72, 61, 0.12);
}
.gcp-phrase.disabled, .gcp-emoji.disabled { opacity: 0.4; }
.gcp-emoji-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12rpx; max-height: 320rpx; overflow-y: auto; }
.gcp-emoji { font-size: 48rpx; text-align: center; padding: 12rpx 0; background: #fff; border-radius: 14rpx; }
.gcp-text-row { display: flex; gap: 12rpx; align-items: center; }
.gcp-input { flex: 1; height: 72rpx; background: #fff; border-radius: 14rpx; padding: 0 24rpx; font-size: 26rpx; }
.gcp-send {
  background: $maple; color: #fff; border-radius: 14rpx; font-size: 26rpx; font-weight: 700;
  height: 72rpx; line-height: 72rpx; padding: 0 28rpx; border: none;
}
.gcp-send[disabled] { opacity: 0.45; }
.gcp-text-off { flex: 1; font-size: 24rpx; color: $muted; text-align: center; }
</style>

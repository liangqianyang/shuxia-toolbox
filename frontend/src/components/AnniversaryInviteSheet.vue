<template>
  <view class="ais__mask" @tap="emit('close')">
    <view class="ais__sheet" @tap.stop>
      <view class="ais__grabber" />
      <text class="ais__title">邀请共享「{{ eventTitle }}」</text>
      <text class="ais__caption">选择权限，生成一次性邀请码后发给微信好友</text>

      <view class="ais__roles">
        <view
          class="ais__role"
          :class="{ 'ais__role--active': role === 'viewer' }"
          @tap="role = 'viewer'"
        >
          <text class="ais__role-name">👀 仅查看</text>
          <text class="ais__role-hint">只能看到这个日子，提醒和卡片偏好归自己</text>
        </view>
        <view
          class="ais__role"
          :class="{ 'ais__role--active': role === 'editor' }"
          @tap="role = 'editor'"
        >
          <text class="ais__role-name">✏️ 可编辑</text>
          <text class="ais__role-hint">可以改名称、日期和场景，不能删除或邀请</text>
        </view>
      </view>

      <view v-if="invite" class="ais__ready">
        <text class="ais__ready-code">{{ invite.code }}</text>
        <text class="ais__ready-hint">24 小时内有效 · 仅可接受一次</text>
        <button class="ais__share-btn" open-type="share">发给微信好友</button>
        <view class="ais__regen" @tap="generate">重新生成</view>
      </view>

      <view v-else class="ais__generate" :class="{ disabled: generating }" @tap="generate">
        {{ generating ? '生成中…' : '生成邀请码' }}
      </view>

      <view class="ais__cancel" @tap="closeSheet">取消</view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { createAnniversaryInvite, type AnniversaryInvite } from '@/services/anniversary'

const props = defineProps<{
  eventId: number
  eventTitle: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'created', invite: { code: string, role: 'editor' | 'viewer' }): void
}>()

const role = ref<'viewer' | 'editor'>('viewer')
const invite = ref<AnniversaryInvite | null>(null)
const generating = ref(false)

async function generate() {
  if (generating.value) return
  generating.value = true
  try {
    invite.value = await createAnniversaryInvite(props.eventId, role.value)
    emit('created', { code: invite.value.code, role: invite.value.role })
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '生成邀请失败', icon: 'none' })
  } finally {
    generating.value = false
  }
}

function closeSheet() {
  emit('close')
}
</script>

<style lang="scss" scoped>
.ais {
  &__mask {
    position: fixed;
    inset: 0;
    z-index: 95;
    background: rgba(74, 63, 53, 0.55);
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
  }

  &__sheet {
    background: $color-card;
    border-radius: 32rpx 32rpx 0 0;
    padding: 16rpx 32rpx calc(28rpx + env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    gap: 20rpx;
  }

  &__grabber {
    width: 72rpx;
    height: 8rpx;
    border-radius: 999rpx;
    background: #e0d5c5;
    margin: 0 auto 8rpx;
  }

  &__title {
    color: $color-text;
    font-size: 30rpx;
    font-weight: 700;
  }

  &__caption {
    color: $color-text-secondary;
    font-size: 24rpx;
    margin-top: -12rpx;
  }

  &__roles {
    display: flex;
    flex-direction: column;
    gap: 14rpx;
  }

  &__role {
    display: flex;
    flex-direction: column;
    gap: 6rpx;
    padding: 20rpx 24rpx;
    border: 2rpx solid $color-border;
    border-radius: $radius-md;
    background: #fffdfb;
  }

  &__role--active {
    border-color: $color-primary;
    background: $color-primary-light;
  }

  &__role-name {
    color: $color-text;
    font-size: 28rpx;
    font-weight: 600;
  }

  &__role--active &__role-name {
    color: $color-primary-dark;
  }

  &__role-hint {
    color: $color-text-secondary;
    font-size: 22rpx;
  }

  &__ready {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12rpx;
    padding: 24rpx;
    border-radius: $radius-md;
    background: #f6efe7;
  }

  &__ready-code {
    font-family: monospace;
    font-size: 56rpx;
    font-weight: 700;
    letter-spacing: 8rpx;
    color: $color-primary-dark;
  }

  &__ready-hint {
    color: $color-text-secondary;
    font-size: 22rpx;
  }

  &__share-btn {
    width: 100%;
    height: 84rpx;
    margin-top: 8rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: $radius-md;
    background: linear-gradient(180deg, #d95440, #b8402e);
    color: #ffffff;
    font-size: 28rpx;
    font-weight: 700;

    &::after {
      border: none;
    }
  }

  &__regen {
    color: $color-text-secondary;
    font-size: 24rpx;
    text-decoration: underline;
  }

  &__generate {
    height: 88rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: $radius-md;
    background: $color-primary-dark;
    color: #ffffff;
    font-size: 28rpx;
    font-weight: 700;

    &.disabled {
      opacity: 0.6;
    }
  }

  &__cancel {
    text-align: center;
    color: $color-text-secondary;
    font-size: 26rpx;
    padding: 8rpx 0;
  }
}
</style>

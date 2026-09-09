<template>
  <view class="amp__mask" @tap="emit('close')">
    <view class="amp__sheet" @tap.stop>
      <view class="amp__grabber" />
      <text class="amp__title">共享成员</text>

      <view v-if="loading" class="amp__state caption">正在读取成员…</view>

      <template v-else-if="data">
        <view
          v-for="member in data.members"
          :key="member.userId"
          class="amp__member"
        >
          <image
            v-if="member.avatarUrl"
            class="amp__avatar"
            :src="member.avatarUrl"
            mode="aspectFill"
          />
          <view v-else class="amp__avatar amp__avatar--placeholder">🍁</view>
          <view class="amp__texts">
            <view class="amp__name-row">
              <text class="amp__name">{{ member.nickname || '微信用户' }}</text>
              <text v-if="member.userId === data.ownerId" class="amp__role-badge amp__role-badge--owner">创建者</text>
              <text v-else-if="member.role === 'editor'" class="amp__role-badge amp__role-badge--editor">可编辑</text>
              <text v-else class="amp__role-badge">仅查看</text>
            </view>
            <text class="caption">{{ member.joinedAt.slice(0, 10) }} 加入</text>
          </view>

          <template v-if="isOwner && member.userId !== data.ownerId">
            <view
              class="amp__role-toggle"
              hover-class="press"
              @tap="toggleRole(member)"
            >
              {{ member.role === 'editor' ? '改为查看' : '改为编辑' }}
            </view>
            <view class="amp__remove" hover-class="press" @tap="removeMember(member)">移除</view>
          </template>
        </view>

        <view v-if="!isOwner" class="amp__leave" hover-class="press" @tap="leave">退出这个共享</view>
        <text v-else class="amp__owner-note caption">创建者不能退出；删除日子请在「更多」里操作</text>
      </template>

      <view class="amp__done" hover-class="press" @tap="emit('close')">完成</view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AnniversaryMemberInfo, AnniversaryMembersResponse } from '@/types/anniversary'
import {
  fetchAnniversaryMembers,
  leaveAnniversaryEvent,
  removeAnniversaryMember,
  updateAnniversaryMemberRole,
} from '@/services/anniversary'

const props = defineProps<{
  eventId: number
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'changed'): void
  (e: 'left'): void
}>()

const loading = ref(true)
const data = ref<AnniversaryMembersResponse | null>(null)
const isOwner = computed(() => data.value?.myRole === 'owner')

watch(
  () => props.eventId,
  () => {
    void load()
  },
  { immediate: true },
)

async function load() {
  loading.value = true
  try {
    data.value = await fetchAnniversaryMembers(props.eventId)
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '读取成员失败', icon: 'none' })
    emit('close')
  } finally {
    loading.value = false
  }
}

async function toggleRole(member: AnniversaryMemberInfo) {
  if (!data.value) return
  const nextRole = member.role === 'editor' ? 'viewer' : 'editor'
  try {
    data.value = await updateAnniversaryMemberRole(props.eventId, member.userId, nextRole)
    emit('changed')
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '修改权限失败', icon: 'none' })
  }
}

async function removeMember(member: AnniversaryMemberInfo) {
  if (!data.value) return
  uni.showModal({
    title: '移除成员',
    content: `确定移除「${member.nickname || '该成员'}」吗？对方将不再看到这个日子。`,
    confirmText: '移除',
    confirmColor: '#e06a5a',
    success: (result) => {
      if (!result.confirm) return
      void (async () => {
        try {
          data.value = await removeAnniversaryMember(props.eventId, member.userId)
          emit('changed')
          uni.showToast({ title: '已移除', icon: 'success' })
        } catch (error) {
          uni.showToast({ title: error instanceof Error ? error.message : '移除失败', icon: 'none' })
        }
      })()
    },
  })
}

async function leave() {
  uni.showModal({
    title: '退出共享',
    content: '退出后将不再看到这个日子，不影响其他成员。',
    confirmText: '退出',
    confirmColor: '#e06a5a',
    success: (result) => {
      if (!result.confirm) return
      void (async () => {
        try {
          await leaveAnniversaryEvent(props.eventId)
          emit('left')
        } catch (error) {
          uni.showToast({ title: error instanceof Error ? error.message : '退出失败', icon: 'none' })
        }
      })()
    },
  })
}
</script>

<style lang="scss" scoped>
.amp {
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
    gap: 16rpx;
    max-height: 70vh;
    overflow-y: auto;
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
    padding: 4rpx 4rpx 0;
  }

  &__state {
    text-align: center;
    padding: 40rpx 0;
  }

  &__member {
    display: flex;
    align-items: center;
    gap: 18rpx;
    padding: 16rpx 0;
    border-top: 2rpx solid rgba(240, 228, 215, 0.6);
  }

  &__avatar {
    width: 76rpx;
    height: 76rpx;
    border-radius: 50%;
    background: $color-primary-light;
    flex-shrink: 0;
  }

  &__avatar--placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 34rpx;
  }

  &__texts {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4rpx;
  }

  &__name-row {
    display: flex;
    align-items: center;
    gap: 10rpx;
    min-width: 0;
  }

  &__name {
    color: $color-text;
    font-size: 28rpx;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__role-badge {
    padding: 2rpx 12rpx;
    border-radius: 999rpx;
    background: #f0e7da;
    color: $color-text-secondary;
    font-size: 20rpx;
    white-space: nowrap;
    flex-shrink: 0;
  }

  &__role-badge--owner {
    background: $color-primary-light;
    color: $color-primary-dark;
  }

  &__role-badge--editor {
    background: #e8f0f7;
    color: #3d6e96;
  }

  &__role-toggle {
    padding: 10rpx 18rpx;
    border-radius: 999rpx;
    background: $color-primary-light;
    color: $color-primary-dark;
    font-size: 22rpx;
    font-weight: 600;
    white-space: nowrap;
  }

  &__remove {
    padding: 10rpx 18rpx;
    border-radius: 999rpx;
    background: #fbeae5;
    color: $color-danger;
    font-size: 22rpx;
    white-space: nowrap;
  }

  &__leave {
    margin-top: 8rpx;
    padding: 22rpx 0;
    border: 2rpx solid $color-danger;
    border-radius: $radius-md;
    color: $color-danger;
    font-size: 28rpx;
    font-weight: 600;
    text-align: center;
  }

  &__owner-note {
    text-align: center;
    padding: 8rpx 0;
  }

  &__done {
    text-align: center;
    color: $color-primary-dark;
    font-size: 28rpx;
    font-weight: 600;
    padding: 12rpx 0;
  }
}
</style>

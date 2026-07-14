<template>
  <view class="mine">
    <view class="mine__profile">
      <image v-if="profileAvatarUrl" class="mine__avatar" :src="displayAvatarUrl" mode="aspectFill" />
      <view v-else class="mine__avatar mine__avatar--fallback">🍁</view>
      <view class="mine__profile-copy">
        <text class="mine__name">{{ displayName }}</text>
        <text class="mine__caption">{{ user ? '工具与偏好将同步到当前账号' : '登录后保存你的首页工具设置' }}</text>
      </view>
      <view v-if="!user" class="mine__login-btn" @tap="authorizeProfile">登录</view>
      <view v-else class="mine__profile-action" @tap="toggleProfileEditor">编辑资料</view>
    </view>

    <view v-if="editingProfile" class="mine__profile-editor">
      <view class="mine__editor-row">
        <button class="mine__avatar-picker" open-type="chooseAvatar" @chooseavatar="chooseAvatar">
          <image v-if="profileAvatarUrl" class="mine__avatar-picker-image" :src="displayAvatarUrl" mode="aspectFill" />
          <text v-else class="mine__avatar-picker-fallback">🍁</text>
          <text class="mine__avatar-picker-label">更换头像</text>
        </button>
        <view class="mine__nickname-field">
          <text class="mine__field-label">昵称</text>
          <input
            class="mine__nickname-input"
            v-model="profileNickname"
            type="nickname"
            maxlength="20"
            placeholder="请输入昵称"
          />
        </view>
      </view>
      <view class="mine__editor-actions">
        <view class="mine__cancel-btn" @tap="cancelProfileEdit">取消</view>
        <view class="mine__save-btn" :class="{ 'mine__save-btn--disabled': savingProfile }" @tap="saveProfile">
          {{ savingProfile ? '保存中' : '保存资料' }}
        </view>
      </view>
    </view>

    <view class="mine__section">
      <text class="mine__section-title">工具设置</text>
      <view class="mine__menu">
        <view class="mine__menu-row" @tap="openToolLibrary">
          <view class="mine__menu-icon">▦</view>
          <text class="mine__menu-label">首页工具管理</text>
          <text class="mine__menu-arrow">›</text>
        </view>
      </view>
    </view>

    <view v-if="isAdmin" class="mine__section">
      <text class="mine__section-title">运营管理</text>
      <view class="mine__menu">
        <view class="mine__menu-row" @tap="openAdmin">
          <view class="mine__menu-icon">⚙</view>
          <text class="mine__menu-label">工具运营台</text>
          <text class="mine__menu-arrow">›</text>
        </view>
      </view>
    </view>
    <AppBottomNav active="mine" />
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppBottomNav from '@/components/AppBottomNav.vue'
import type { ToolboxUser } from '@/types/toolbox'
import {
  AUTH_STORAGE_KEY,
  fetchAccount,
  loginWithWechatProfile,
  resolveAvatarUrl,
  saveUserProfile,
  storedUser,
  uploadAvatar,
} from '@/services/toolbox'

const user = ref<ToolboxUser | null>(null)
const isAdmin = ref(false)
const editingProfile = ref(false)
const savingProfile = ref(false)
const profileNickname = ref('')
const profileAvatarUrl = ref('')
const displayName = computed(() => user.value?.nickname || (user.value ? '微信用户' : '登录枫叶小屋'))
const displayAvatarUrl = computed(() => resolveAvatarUrl(profileAvatarUrl.value))

onMounted(() => {
  user.value = storedUser()
  syncProfileFields()
  if (String(uni.getStorageSync(AUTH_STORAGE_KEY) || '')) void refreshAccount()
})

async function refreshAccount() {
  try {
    const account = await fetchAccount()
    user.value = account.user
    isAdmin.value = account.isAdmin
    syncProfileFields()
  } catch {
    // Token 过期时，保留登录按钮让用户主动重新授权资料。
    user.value = null
    isAdmin.value = false
  }
}

async function authorizeProfile() {
  try {
    const account = await loginWithWechatProfile()
    user.value = account.user
    isAdmin.value = account.isAdmin
    syncProfileFields()
    uni.showToast({ title: '登录成功', icon: 'success' })
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '微信登录失败', icon: 'none' })
  }
}

function toggleProfileEditor() {
  editingProfile.value = !editingProfile.value
  if (editingProfile.value) syncProfileFields()
}

function cancelProfileEdit() {
  editingProfile.value = false
  syncProfileFields()
}

async function chooseAvatar(event: { detail?: { avatarUrl?: string } }) {
  const avatarUrl = String(event.detail?.avatarUrl || '')
  if (!avatarUrl) return
  profileAvatarUrl.value = avatarUrl
}

async function saveProfile() {
  if (savingProfile.value) return
  if (!user.value) {
    await authorizeProfile()
    return
  }
  const nickname = profileNickname.value.trim()
  if (!nickname) {
    uni.showToast({ title: '请填写昵称', icon: 'none' })
    return
  }

  savingProfile.value = true
  try {
    let avatarUrl = profileAvatarUrl.value
    if (avatarUrl.startsWith('wxfile://') || avatarUrl.startsWith('http://tmp/')) {
      avatarUrl = await uploadAvatar(avatarUrl)
    }
    const updated = await saveUserProfile({ nickname, avatarUrl })
    user.value = updated
    profileAvatarUrl.value = updated.avatarUrl
    editingProfile.value = false
    uni.showToast({ title: '资料已保存', icon: 'success' })
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '资料保存失败', icon: 'none' })
  } finally {
    savingProfile.value = false
  }
}

function syncProfileFields() {
  profileNickname.value = user.value?.nickname || ''
  profileAvatarUrl.value = user.value?.avatarUrl || ''
}

function openToolLibrary() {
  uni.navigateTo({ url: '/pages/tool-library/index' })
}

function openAdmin() {
  uni.navigateTo({ url: '/pages/admin/index' })
}
</script>

<style lang="scss" scoped>
.mine {
  min-height: 100vh;
  padding: 56rpx 32rpx 180rpx;

  &__profile {
    display: flex;
    align-items: center;
    gap: 22rpx;
    padding: 24rpx 0 66rpx;
  }

  &__avatar {
    width: 112rpx;
    height: 112rpx;
    border-radius: 56rpx;
    background: $color-primary-light;
    flex-shrink: 0;
  }

  &__avatar--fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 52rpx;
  }

  &__profile-copy {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 10rpx;
  }

  &__name {
    color: $color-text;
    font-size: 36rpx;
    font-weight: 700;
  }

  &__caption {
    color: $color-text-secondary;
    font-size: 22rpx;
    line-height: 1.45;
  }

  &__login-btn,
  &__profile-action {
    padding: 12rpx 8rpx;
    color: $color-primary;
    font-size: 25rpx;
    font-weight: 600;
    flex-shrink: 0;
  }

  &__profile-action {
    color: $color-primary-dark;
  }

  &__profile-editor {
    margin: -36rpx 0 52rpx;
    padding: 24rpx 0;
    border-top: 2rpx solid $color-border;
    border-bottom: 2rpx solid $color-border;
    display: flex;
    flex-direction: column;
    gap: 24rpx;
  }

  &__editor-row {
    display: flex;
    align-items: center;
    gap: 22rpx;
  }

  &__avatar-picker {
    width: 128rpx;
    height: 128rpx;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 64rpx;
    background: $color-primary-light;
    position: relative;
    overflow: hidden;
    flex-shrink: 0;
  }

  &__avatar-picker::after {
    border: 0;
  }

  &__avatar-picker-image,
  &__avatar-picker-fallback {
    width: 128rpx;
    height: 128rpx;
    display: block;
  }

  &__avatar-picker-fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 56rpx;
  }

  &__avatar-picker-label {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    min-height: 40rpx;
    background: rgba(74, 63, 53, 0.64);
    color: #fff;
    font-size: 19rpx;
    line-height: 40rpx;
    text-align: center;
  }

  &__nickname-field {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 12rpx;
  }

  &__field-label {
    color: $color-text-secondary;
    font-size: 22rpx;
  }

  &__nickname-input {
    height: 78rpx;
    padding: 0 20rpx;
    border: 2rpx solid $color-border;
    border-radius: $radius-sm;
    background: #fff;
    color: $color-text;
    font-size: 28rpx;
    box-sizing: border-box;
  }

  &__editor-actions {
    display: grid;
    grid-template-columns: minmax(140rpx, 0.7fr) minmax(260rpx, 1.3fr);
    gap: 18rpx;
  }

  &__cancel-btn,
  &__save-btn {
    min-height: 76rpx;
    border-radius: $radius-sm;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 26rpx;
    font-weight: 600;
  }

  &__cancel-btn {
    border: 2rpx solid $color-border;
    color: $color-text-secondary;
  }

  &__save-btn {
    background: $color-primary;
    color: #fff;
  }

  &__save-btn--disabled {
    opacity: 0.55;
  }

  &__section {
    display: flex;
    flex-direction: column;
    gap: 16rpx;
    margin-bottom: 44rpx;
  }

  &__section-title {
    color: $color-text-secondary;
    font-size: 24rpx;
  }

  &__menu {
    border-top: 2rpx solid $color-border;
    border-bottom: 2rpx solid $color-border;
  }

  &__menu-row {
    min-height: 106rpx;
    display: flex;
    align-items: center;
    gap: 18rpx;
  }

  &__menu-icon {
    width: 48rpx;
    color: $color-primary;
    font-size: 32rpx;
    text-align: center;
    flex-shrink: 0;
  }

  &__menu-label {
    flex: 1;
    color: $color-text;
    font-size: 29rpx;
    font-weight: 600;
  }

  &__menu-arrow {
    color: $color-text-secondary;
    font-size: 42rpx;
  }
}
</style>

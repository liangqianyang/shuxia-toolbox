<template>
  <view class="mine">
    <view class="mine__card">
      <view class="mine__profile">
        <image v-if="profileAvatarUrl" class="mine__avatar" :src="displayAvatarUrl" mode="aspectFill" />
        <view v-else class="mine__avatar mine__avatar--fallback">🍁</view>
        <view class="mine__profile-copy">
          <text class="mine__name">{{ displayName }}</text>
          <text class="mine__caption">{{ user ? '工具与偏好将同步到当前账号' : '登录后保存你的首页工具设置' }}</text>
        </view>
        <view v-if="!user" class="mine__pillbtn" hover-class="press" @tap="authorizeProfile">登录</view>
        <view v-else class="mine__pillbtn" hover-class="press" @tap="toggleProfileEditor">编辑资料</view>
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
          <view class="mine__cancel-btn" hover-class="press" @tap="cancelProfileEdit">取消</view>
          <view class="mine__save-btn" :class="{ 'mine__save-btn--disabled': savingProfile }" hover-class="press" @tap="saveProfile">
            {{ savingProfile ? '保存中' : '保存资料' }}
          </view>
        </view>
      </view>
    </view>

    <AppSection title="工具设置" card>
      <view class="mine__menu-row" hover-class="press" @tap="openToolLibrary">
        <view class="mine__menu-icon" :style="{ background: libraryChip.tint, color: libraryChip.fg }">▦</view>
        <view class="mine__menu-body">
          <text class="mine__menu-label">首页工具管理</text>
        </view>
        <text class="mine__menu-arrow">›</text>
      </view>
    </AppSection>

    <AppSection v-if="isAdmin" title="运营管理" card>
      <view class="mine__menu-row" hover-class="press" @tap="openAdmin">
        <view class="mine__menu-icon" :style="{ background: adminChip.tint, color: adminChip.fg }">⚙</view>
        <view class="mine__menu-body">
          <text class="mine__menu-label">工具运营台</text>
        </view>
        <text class="mine__menu-arrow">›</text>
      </view>
    </AppSection>

    <view class="mine__footer">枫叶小屋 · v1.0.0</view>
    <AppBottomNav active="mine" />
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppBottomNav from '@/components/AppBottomNav.vue'
import AppSection from '@/components/AppSection.vue'
import type { ToolboxUser } from '@/types/toolbox'
import { pastel } from '@/utils/pastel'
import {
  AUTH_STORAGE_KEY,
  fetchAccount,
  loginWithWechatProfile,
  resolveAvatarUrl,
  saveUserProfile,
  storedUser,
  uploadAvatar,
} from '@/services/toolbox'

// menu 图标小方块淡彩色：照原型 mine 屏（工具管理=蓝、运营台=琥珀，取自 PASTEL 表相邻组）
const libraryChip = pastel('travel')
const adminChip = pastel('sokoban')

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
  padding: 32rpx 32rpx 200rpx;

  &__card {
    background: $card;
    border: 2rpx solid $line;
    border-radius: $radius-lg;
    margin-bottom: $space-4;
  }

  &__profile {
    display: flex;
    align-items: center;
    gap: 24rpx;
    padding: 28rpx;
  }

  &__avatar {
    width: 104rpx;
    height: 104rpx;
    border-radius: 52rpx;
    background: $blue-tint;
    flex-shrink: 0;
  }

  &__avatar--fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 48rpx;
  }

  &__profile-copy {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4rpx;
  }

  &__name {
    color: $ink;
    font-size: 32rpx;
    font-weight: 700;
  }

  &__caption {
    color: $ink3;
    font-size: 22rpx;
    line-height: 1.45;
  }

  &__pillbtn {
    background: $blue;
    color: #fff;
    border-radius: $radius-pill;
    padding: 12rpx 26rpx;
    font-size: 24rpx;
    font-weight: 600;
    flex-shrink: 0;
  }

  &__profile-editor {
    padding: 28rpx;
    border-top: 2rpx solid $line;
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
    background: $blue-tint;
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
    background: rgba(46, 65, 84, 0.6);
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
    color: $ink2;
    font-size: 22rpx;
  }

  &__nickname-input {
    height: 78rpx;
    padding: 0 20rpx;
    border: 2rpx solid $line-strong;
    border-radius: 20rpx;
    background: #fff;
    color: $ink;
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
    border-radius: 20rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 26rpx;
    font-weight: 600;
  }

  &__cancel-btn {
    border: 2rpx solid $line-strong;
    background: $card;
    color: $ink2;
  }

  &__save-btn {
    background: $blue;
    color: #fff;
  }

  &__save-btn--disabled {
    opacity: 0.45;
  }

  &__menu-row {
    display: flex;
    align-items: center;
    gap: 20rpx;
    padding: 24rpx 28rpx;
  }

  &__menu-icon {
    width: 60rpx;
    height: 60rpx;
    border-radius: 18rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 30rpx;
    flex-shrink: 0;
  }

  &__menu-body {
    flex: 1;
    min-width: 0;
  }

  &__menu-label {
    color: $ink;
    font-size: 28rpx;
    font-weight: 500;
  }

  &__menu-arrow {
    color: $ink3;
    font-size: 40rpx;
    line-height: 1;
  }

  &__footer {
    font-size: 20rpx;
    color: $ink3;
    text-align: center;
    padding: 8rpx 0;
  }
}
</style>

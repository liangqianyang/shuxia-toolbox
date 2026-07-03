<template>
  <view class="stop card">
    <!-- 类型选择 -->
    <view class="stop__types">
      <view
        v-for="t in POI_TYPE_ORDER"
        :key="t"
        class="stop__type"
        :class="{ 'stop__type--active': stop.type === t }"
        :style="
          stop.type === t
            ? { backgroundColor: POI_THEME[t].hex, color: textColorOn(POI_THEME[t].rgb) }
            : {}
        "
        @tap="emit('update', { type: t })"
      >
        <text class="stop__type-icon">{{ POI_ICON[t] }}</text>
        <text class="stop__type-label">{{ POI_LABEL[t] }}</text>
      </view>
    </view>

    <!-- 地点搜索（地理编码） -->
    <view class="stop__search">
      <input class="stop__search-input" v-model="searchText" placeholder="搜地点名获取坐标，如「外滩」" />
      <view class="stop__search-btn" @tap="doGeocode">{{ geocoding ? '…' : '搜索' }}</view>
    </view>
    <view v-if="candidates.length" class="stop__candidates">
      <view
        v-for="(c, i) in candidates"
        :key="i"
        class="stop__candidate"
        @tap="pickCandidate(c)"
      >
        <text class="stop__cand-name">{{ c.title }}</text>
        <text class="stop__cand-addr">{{ c.province }}{{ c.city }}</text>
      </view>
    </view>

    <!-- 名称 -->
    <input class="stop__name" v-model="localName" placeholder="地点名称" @blur="commitName" />

    <!-- 时间段 -->
    <input
      class="stop__time"
      v-model="localTime"
      placeholder="时间段，如 09:30-12:00（可选）"
      @blur="commitTime"
    />

    <!-- 备注 -->
    <textarea
      class="stop__note"
      v-model="localNote"
      placeholder="备注：推荐菜、营业时间、tips…"
      :auto-height="true"
      @blur="commitNote"
    />

    <!-- 配图 -->
    <view class="stop__photo-row">
      <view v-if="stop.photo" class="stop__photo">
        <image :src="stop.photo" mode="aspectFill" />
        <text class="stop__photo-remove" @tap="emit('update', { photo: null })">×</text>
      </view>
      <view v-else class="stop__add-photo" @tap="pickPhoto">+ 配图</view>
    </view>

    <!-- 操作 -->
    <view class="stop__ops">
      <text class="stop__op" @tap="emit('move', -1)">上移</text>
      <text class="stop__op" @tap="emit('move', 1)">下移</text>
      <text class="stop__op stop__op--del" @tap="emit('remove')">删除</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { chooseImage } from '@/utils/canvasAdapter'
import { textColorOn } from '@/utils/color'
import {
  POI_TYPE_ORDER,
  POI_ICON,
  POI_LABEL,
  POI_THEME,
  type Stop,
  type GeocodeCandidate,
} from '@/types/travel'

const props = defineProps<{
  stop: Stop
  onGeocode: (query: string) => Promise<GeocodeCandidate[]>
}>()

const emit = defineEmits<{
  update: [patch: Partial<Stop>]
  remove: []
  move: [dir: -1 | 1]
}>()

const searchText = ref(props.stop.name)
const localName = ref(props.stop.name)
const localNote = ref(props.stop.note)
const localTime = ref(props.stop.time)
const candidates = ref<GeocodeCandidate[]>([])
const geocoding = ref(false)

// 父组件替换 stop（如 geocode 命中）时同步本地输入
watch(() => props.stop.name, (v) => {
  localName.value = v
})
watch(() => props.stop.note, (v) => {
  localNote.value = v
})
watch(() => props.stop.time, (v) => {
  localTime.value = v
})

async function doGeocode(): Promise<void> {
  if (!searchText.value.trim()) return
  geocoding.value = true
  candidates.value = []
  try {
    candidates.value = await props.onGeocode(searchText.value.trim())
  } finally {
    geocoding.value = false
  }
}

function pickCandidate(c: GeocodeCandidate): void {
  const name = c.name || c.title
  emit('update', { name, lng: c.lng, lat: c.lat })
  localName.value = name
  searchText.value = name
  candidates.value = []
}

function commitName(): void {
  if (localName.value !== props.stop.name) emit('update', { name: localName.value })
}
function commitNote(): void {
  if (localNote.value !== props.stop.note) emit('update', { note: localNote.value })
}
function commitTime(): void {
  if (localTime.value !== props.stop.time) emit('update', { time: localTime.value })
}

async function pickPhoto(): Promise<void> {
  try {
    const path = await chooseImage()
    emit('update', { photo: path })
  } catch {
    /* 用户取消 */
  }
}
</script>

<style lang="scss" scoped>
.stop {
  display: flex;
  flex-direction: column;
  gap: 20rpx;

  &__types {
    display: flex;
    flex-wrap: wrap;
    gap: 12rpx;
  }

  &__type {
    display: flex;
    align-items: center;
    gap: 6rpx;
    padding: 8rpx 20rpx;
    border-radius: 999rpx;
    background-color: $color-bg;
    border: 2rpx solid $color-border;
    font-size: $font-caption;
    color: $color-text-secondary;

    &--active {
      border-color: transparent;
      font-weight: 600;
    }
  }

  &__type-icon {
    font-size: 30rpx;
  }

  &__search {
    display: flex;
    gap: 16rpx;
  }

  &__search-input {
    flex: 1;
    padding: 16rpx 24rpx;
    border-radius: $radius-md;
    background-color: $color-bg;
    border: 2rpx solid $color-border;
    font-size: $font-body;
  }

  &__search-btn {
    padding: 0 32rpx;
    display: flex;
    align-items: center;
    border-radius: $radius-md;
    background-color: $color-primary;
    color: #ffffff;
    font-size: $font-body;
  }

  &__candidates {
    display: flex;
    flex-direction: column;
    border: 2rpx solid $color-border;
    border-radius: $radius-md;
    overflow: hidden;
  }

  &__candidate {
    display: flex;
    flex-direction: column;
    gap: 4rpx;
    padding: 16rpx 24rpx;
    border-bottom: 2rpx solid $color-border;

    &:last-child {
      border-bottom: none;
    }
  }

  &__cand-name {
    font-size: $font-body;
    color: $color-text;
  }

  &__cand-addr {
    font-size: $font-caption;
    color: $color-text-secondary;
  }

  &__name {
    padding: 16rpx 24rpx;
    border-radius: $radius-md;
    background-color: $color-bg;
    border: 2rpx solid $color-border;
    font-size: $font-body;
    font-weight: 600;
  }

  &__time {
    padding: 12rpx 24rpx;
    border-radius: $radius-md;
    background-color: $color-bg;
    border: 2rpx solid $color-border;
    font-size: $font-caption;
    color: $color-text-secondary;
  }

  &__note {
    width: 100%;
    box-sizing: border-box;
    padding: 16rpx 24rpx;
    border-radius: $radius-md;
    background-color: $color-bg;
    border: 2rpx solid $color-border;
    font-size: $font-body;
    min-height: 80rpx;
  }

  &__photo-row {
    display: flex;
  }

  &__photo {
    position: relative;
    width: 160rpx;
    height: 160rpx;
    border-radius: $radius-md;
    overflow: hidden;

    image {
      width: 100%;
      height: 100%;
    }
  }

  &__photo-remove {
    position: absolute;
    top: 4rpx;
    right: 8rpx;
    color: #ffffff;
    background-color: rgba(0, 0, 0, 0.5);
    border-radius: 999rpx;
    width: 40rpx;
    height: 40rpx;
    line-height: 40rpx;
    text-align: center;
  }

  &__add-photo {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 160rpx;
    height: 160rpx;
    border-radius: $radius-md;
    border: 2rpx dashed $color-border;
    color: $color-text-secondary;
    font-size: $font-caption;
  }

  &__ops {
    display: flex;
    gap: 32rpx;
    justify-content: flex-end;
    font-size: $font-caption;
    color: $color-text-secondary;
  }

  &__op {
    padding: 8rpx 0;

    &--del {
      color: #d9534f;
    }
  }
}
</style>

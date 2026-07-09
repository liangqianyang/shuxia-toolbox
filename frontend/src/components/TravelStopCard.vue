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

    <view class="stop__handbook">
      <view class="stop__poi-head">
        <text class="stop__poi-title">手帐文案</text>
        <text class="stop__poi-caption">短句</text>
      </view>
      <textarea
        class="stop__handbook-input"
        v-model="localHandbookText"
        placeholder="例如：风吹过湖面，把午后的光留在照片里。"
        :auto-height="true"
        @blur="commitHandbookText"
      />
    </view>

    <!-- 可信信息：AI 生成，用户可按真实情况修正 -->
    <view class="stop__poi">
      <view class="stop__poi-head">
        <text class="stop__poi-title">可信信息</text>
        <text class="stop__poi-caption">出发前建议再确认</text>
      </view>
      <input
        class="stop__poi-input"
        v-model="localPoiInfo.openHours"
        placeholder="开放/营业时间，如 09:00-17:00"
        @blur="commitPoiInfo"
      />
      <input
        class="stop__poi-input"
        v-model="localPoiInfo.reservation"
        placeholder="预约要求，如 需提前预约 / 无需预约"
        @blur="commitPoiInfo"
      />
      <input
        class="stop__poi-input"
        v-model="localPoiInfo.ticket"
        placeholder="门票/消费，如 免费 / 约 60 元 / 人均 80"
        @blur="commitPoiInfo"
      />
      <input
        class="stop__poi-input"
        v-model="localPoiInfo.duration"
        placeholder="建议停留，如 1.5 小时"
        @blur="commitPoiInfo"
      />
    </view>

    <!-- 配图 -->
    <view class="stop__photo-row">
      <view v-if="stop.photo" class="stop__photo">
        <image :src="stop.photo" mode="aspectFill" />
        <text class="stop__photo-remove" @tap="emit('update', { photo: null })">×</text>
      </view>
      <view v-else class="stop__add-photo" @tap="pickPhoto">+ 配图</view>
    </view>

    <!-- 到下一站交通（可自定义方式/线路/耗时）-->
    <view class="stop__leg">
      <view class="stop__leg-toggle" @tap="legOpen = !legOpen">
        <text class="stop__leg-title">↳ 到下一站</text>
        <text v-if="stop.travelToNext" class="stop__leg-cur"
          >{{ modeIcon(stop.travelToNext.mode) }} {{ modeLabel(stop.travelToNext.mode)
          }}{{ stop.travelToNext.durationMin ? ' · ' + stop.travelToNext.durationMin + '分钟' : '' }}</text
        >
        <text v-else class="stop__leg-cur caption">未设置</text>
        <text class="stop__leg-chev">{{ legOpen ? '收起' : '设置' }}</text>
      </view>
      <view v-if="legOpen" class="stop__leg-body">
        <view class="stop__leg-modes">
          <view
            v-for="m in LEG_MODE_ORDER"
            :key="m"
            class="stop__leg-mode"
            :class="{ 'stop__leg-mode--active': legMode === m }"
            @tap="pickLegMode(m)"
          >
            <text class="stop__leg-mode-icon">{{ modeIcon(m) }}</text>
            <text class="stop__leg-mode-label">{{ modeLabel(m) }}</text>
          </view>
        </view>
        <input
          class="stop__leg-detail"
          v-model="legDetail"
          placeholder="线路/换乘，如 1号线至凤起路站"
          @blur="commitLegDetail"
        />
        <view class="stop__leg-durrow">
          <text class="caption">约</text>
          <input class="stop__leg-dur" type="number" v-model="legDur" @blur="commitLegDur" />
          <text class="caption">分钟</text>
        </view>
        <view v-if="stop.travelToNext?.reason" class="stop__leg-reason">
          <text class="stop__leg-reason-label">推荐理由</text>
          <text class="stop__leg-reason-text">{{ stop.travelToNext.reason }}</text>
        </view>
        <view v-if="legAlternatives.length" class="stop__leg-alts">
          <text class="stop__leg-alts-title">备选方案</text>
          <view
            v-for="alt in legAlternatives"
            :key="`${alt.mode}-${alt.durationMin}-${alt.distanceM}`"
            class="stop__leg-alt"
            @tap="pickAlternative(alt)"
          >
            <text class="stop__leg-alt-main"
              >{{ modeIcon(alt.mode) }} {{ modeLabel(alt.mode) }} · {{ alt.durationMin }}分钟</text
            >
            <text class="stop__leg-alt-sub">{{ alt.reason || alt.detail || formatDistance(alt.distanceM) }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 操作 -->
    <view class="stop__ops">
      <text
        class="stop__op"
        :class="{ 'stop__op--disabled': replacing || stop.locked }"
        @tap="requestReplace"
        >{{ replacing ? '替换中' : '替换' }}</text
      >
      <text class="stop__op" :class="{ 'stop__op--locked': stop.locked }" @tap="emit('update', { locked: !stop.locked })">{{
        stop.locked ? '已锁定' : '锁定'
      }}</text>
      <text class="stop__op" @tap="emit('move', -1)">上移</text>
      <text class="stop__op" @tap="emit('move', 1)">下移</text>
      <text class="stop__op stop__op--del" @tap="emit('remove')">删除</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { chooseImage } from '@/utils/canvasAdapter'
import { textColorOn } from '@/utils/color'
import { LEG_MODE_ORDER, modeIcon, modeLabel } from '@/utils/guide/theme'
import {
  POI_TYPE_ORDER,
  POI_ICON,
  POI_LABEL,
  POI_THEME,
  createEmptyPoiInfo,
  type PoiInfo,
  type Stop,
  type GeocodeCandidate,
  type TravelAlternative,
} from '@/types/travel'

const props = defineProps<{
  stop: Stop
  onGeocode: (query: string) => Promise<GeocodeCandidate[]>
  replacing?: boolean
}>()

const emit = defineEmits<{
  update: [patch: Partial<Stop>]
  remove: []
  move: [dir: -1 | 1]
  replace: []
}>()

const searchText = ref(props.stop.name)
const localName = ref(props.stop.name)
const localNote = ref(props.stop.note)
const localHandbookText = ref(props.stop.handbookText ?? '')
const localTime = ref(props.stop.time)
const localPoiInfo = ref<PoiInfo>({ ...createEmptyPoiInfo(), ...(props.stop.poiInfo ?? {}) })
const candidates = ref<GeocodeCandidate[]>([])
const geocoding = ref(false)

// 「到下一站」交通编辑态（折叠式）：方式 chips + 线路/换乘说明 + 耗时
const legOpen = ref(false)
const legDetail = ref(props.stop.travelToNext?.detail ?? '')
const legDur = ref(props.stop.travelToNext?.durationMin ? String(props.stop.travelToNext.durationMin) : '')
const legMode = computed(() => props.stop.travelToNext?.mode ?? 'walking')
const legAlternatives = computed(() => props.stop.travelToNext?.alternatives ?? [])
watch(
  () => props.stop.travelToNext,
  (t) => {
    legDetail.value = t?.detail ?? ''
    legDur.value = t?.durationMin ? String(t.durationMin) : ''
  },
)
function patchLeg(patch: Partial<NonNullable<Stop['travelToNext']>>): void {
  const cur = props.stop.travelToNext ?? { mode: 'walking', distanceM: 0, durationMin: 0, detail: '' }
  emit('update', { travelToNext: { ...cur, ...patch } })
}
function pickLegMode(m: string): void {
  patchLeg({ mode: m })
}
function commitLegDetail(): void {
  patchLeg({ detail: legDetail.value })
}
function commitLegDur(): void {
  patchLeg({ durationMin: Math.max(0, Math.round(Number(legDur.value) || 0)) })
}
function pickAlternative(alt: TravelAlternative): void {
  patchLeg({
    mode: alt.mode,
    distanceM: alt.distanceM,
    durationMin: alt.durationMin,
    detail: alt.detail ?? '',
    reason: alt.reason,
  })
  legDetail.value = alt.detail ?? ''
  legDur.value = alt.durationMin ? String(alt.durationMin) : ''
}
function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${m}m`
}

// 父组件替换 stop（如 geocode 命中）时同步本地输入
watch(() => props.stop.name, (v) => {
  localName.value = v
})
watch(() => props.stop.note, (v) => {
  localNote.value = v
})
watch(() => props.stop.handbookText, (v) => {
  localHandbookText.value = v ?? ''
})
watch(() => props.stop.time, (v) => {
  localTime.value = v
})
watch(() => props.stop.poiInfo, (v) => {
  localPoiInfo.value = { ...createEmptyPoiInfo(), ...(v ?? {}) }
}, { deep: true })

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
function commitHandbookText(): void {
  if (localHandbookText.value !== (props.stop.handbookText ?? '')) {
    emit('update', { handbookText: localHandbookText.value })
  }
}
function commitTime(): void {
  if (localTime.value !== props.stop.time) emit('update', { time: localTime.value })
}
function commitPoiInfo(): void {
  emit('update', { poiInfo: { ...localPoiInfo.value } })
}

function requestReplace(): void {
  if (props.replacing) return
  if (props.stop.locked) {
    uni.showToast({ title: '先解锁再替换', icon: 'none' })
    return
  }
  emit('replace')
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

  &__handbook {
    display: flex;
    flex-direction: column;
    gap: 12rpx;
    padding: 16rpx 20rpx;
    border-radius: $radius-md;
    background-color: #fff8ef;
    border: 2rpx solid #ead6bf;
  }

  &__handbook-input {
    width: 100%;
    box-sizing: border-box;
    padding: 14rpx 20rpx;
    border-radius: $radius-md;
    background-color: #ffffff;
    border: 2rpx solid $color-border;
    font-size: $font-body;
    color: $color-text;
    line-height: 1.45;
    min-height: 88rpx;
  }

  &__poi {
    display: flex;
    flex-direction: column;
    gap: 12rpx;
    padding: 16rpx 20rpx;
    border-radius: $radius-md;
    background-color: $color-bg;
    border: 2rpx solid $color-border;
  }

  &__poi-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12rpx;
  }

  &__poi-title {
    font-size: $font-caption;
    font-weight: 700;
    color: $color-text;
  }

  &__poi-caption {
    font-size: 22rpx;
    color: $color-text-secondary;
  }

  &__poi-input {
    padding: 12rpx 18rpx;
    border-radius: $radius-md;
    background-color: #ffffff;
    border: 2rpx solid $color-border;
    font-size: $font-caption;
    color: $color-text-secondary;
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

    &--disabled {
      color: #b8a797;
    }

    &--locked {
      color: $color-primary;
      font-weight: 600;
    }

    &--del {
      color: #d9534f;
    }
  }

  &__leg {
    display: flex;
    flex-direction: column;
    gap: 14rpx;
    padding: 16rpx 20rpx;
    border-radius: $radius-md;
    background-color: $color-bg;
    border: 2rpx solid $color-border;
  }

  &__leg-toggle {
    display: flex;
    align-items: center;
    gap: 12rpx;
  }

  &__leg-title {
    font-size: $font-caption;
    font-weight: 600;
    color: $color-text;
  }

  &__leg-cur {
    flex: 1;
    font-size: $font-caption;
    color: $color-text-secondary;
  }

  &__leg-chev {
    font-size: $font-caption;
    color: $color-primary;
    flex-shrink: 0;
  }

  &__leg-body {
    display: flex;
    flex-direction: column;
    gap: 14rpx;
  }

  &__leg-modes {
    display: flex;
    flex-wrap: wrap;
    gap: 10rpx;
  }

  &__leg-mode {
    display: flex;
    align-items: center;
    gap: 4rpx;
    padding: 6rpx 16rpx;
    border-radius: 999rpx;
    background-color: #ffffff;
    border: 2rpx solid $color-border;
    font-size: $font-caption;
    color: $color-text-secondary;

    &--active {
      border-color: $color-primary;
      background-color: #fff3e6;
      color: $color-primary-dark;
      font-weight: 600;
    }
  }

  &__leg-mode-icon {
    font-size: 28rpx;
  }

  &__leg-mode-label {
    font-size: $font-caption;
  }

  &__leg-detail {
    width: 100%;
    box-sizing: border-box;
    padding: 14rpx 20rpx;
    border-radius: $radius-md;
    background-color: #ffffff;
    border: 2rpx solid $color-border;
    font-size: $font-body;
  }

  &__leg-durrow {
    display: flex;
    align-items: center;
    gap: 12rpx;
  }

  &__leg-dur {
    width: 120rpx;
    padding: 10rpx 16rpx;
    text-align: center;
    border-radius: $radius-md;
    background-color: #ffffff;
    border: 2rpx solid $color-border;
    font-size: $font-body;
    font-weight: 600;
  }

  &__leg-reason {
    display: flex;
    flex-direction: column;
    gap: 6rpx;
    padding: 14rpx 18rpx;
    border-radius: $radius-md;
    background-color: #fff8ef;
    border: 2rpx solid #ead6bf;
  }

  &__leg-reason-label,
  &__leg-alts-title {
    font-size: 22rpx;
    font-weight: 700;
    color: $color-primary-dark;
  }

  &__leg-reason-text {
    font-size: $font-caption;
    line-height: 1.45;
    color: $color-text-secondary;
  }

  &__leg-alts {
    display: flex;
    flex-direction: column;
    gap: 10rpx;
  }

  &__leg-alt {
    display: flex;
    flex-direction: column;
    gap: 4rpx;
    padding: 12rpx 16rpx;
    border-radius: $radius-md;
    background-color: #ffffff;
    border: 2rpx solid $color-border;
  }

  &__leg-alt-main {
    font-size: $font-caption;
    font-weight: 700;
    color: $color-text;
  }

  &__leg-alt-sub {
    font-size: 22rpx;
    line-height: 1.35;
    color: $color-text-secondary;
  }
}
</style>

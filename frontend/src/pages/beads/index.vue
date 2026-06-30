<template>
  <view class="beads" :class="{ 'beads--editing': editMode }">
    <!-- 选图区 -->
    <view v-if="!imagePath" class="beads__picker card" @tap="pickImage">
      <view class="beads__picker-icon">🖼️</view>
      <text class="beads__picker-text">点击选择图片</text>
      <text class="caption">支持照片、表情包、像素图</text>
      <text class="beads__privacy caption">图片仅在本机处理，不会上传</text>
    </view>

    <view v-else class="beads__preview card">
      <image class="beads__thumb" :src="imagePath" mode="aspectFit" />
      <view class="beads__preview-actions">
        <view class="btn-ghost beads__small-btn" @tap="pickImage">换一张图</view>
      </view>
    </view>

    <!-- 参数面板 -->
    <ParamPanel v-if="imagePath" :params="params" :disabled="generating" @change="onParamsChange" />

    <!-- 生成按钮 / 重新生成提示 -->
    <view v-if="imagePath && !result" class="btn-primary" :class="{ disabled: generating }" @tap="onGenerate">
      {{ generating ? '生成中…' : '生成图纸' }}
    </view>
    <view v-if="result && dirty" class="beads__dirty" @tap="onGenerate">
      参数已修改，点击重新生成
    </view>

    <!-- 结果区 -->
    <template v-if="result">
      <view class="card beads__result">
        <view class="beads__summary">
          <text class="section-title beads__summary-text">{{ summaryText }}</text>
          <view
            class="beads__edit-toggle"
            :class="{ 'beads__edit-toggle--active': editMode, disabled: dirty }"
            @tap="toggleEditMode"
          >
            编辑格子
          </view>
          <view class="beads__zoom">
            <view
              v-for="z in [1, 2, 3, 4]"
              :key="z"
              class="beads__zoom-btn"
              :class="{ 'beads__zoom-btn--active': preview.zoom.value === z }"
              @tap="onZoom(z)"
            >
              {{ z }}x
            </view>
          </view>
        </view>
        <view class="beads__zoom-slider">
          <text class="caption">{{ Math.round(preview.zoom.value * 100) }}%</text>
          <slider
            class="beads__zoom-range"
            :min="75"
            :max="400"
            :step="5"
            :value="Math.round(preview.zoom.value * 100)"
            activeColor="#C8956C"
            block-size="20"
            @changing="onZoomSliderChanging"
            @change="onZoomSliderChange"
          />
        </view>
        <scroll-view
          class="beads__scroll"
          :class="{ 'beads__scroll--editing': editMode }"
          :scroll-x="!preview.pinching.value"
          :scroll-y="!preview.pinching.value"
          enhanced
          :scroll-left="preview.scrollLeft.value"
          :scroll-top="preview.scrollTop.value"
          @scroll="preview.onScroll"
        >
          <view
            class="beads__canvas-wrap"
            :class="{ 'beads__canvas-wrap--editing': editMode }"
            :style="{
              width: (preview.contentWidth.value || 100) + 'px',
              height: (preview.contentHeight.value || 100) + 'px',
            }"
          >
            <canvas
              id="preview-canvas"
              type="2d"
              class="beads__canvas"
              :style="{
                width: (preview.cssWidth.value || 100) + 'px',
                height: (preview.cssHeight.value || 100) + 'px',
              }"
            />
            <view
              class="beads__canvas-hit"
              :class="{ 'beads__canvas-hit--active': editMode, 'beads__canvas-hit--pinching': preview.pinching.value }"
              @tap="onCanvasTap"
              @touchstart="onCanvasTouchStart"
              @touchmove="onCanvasTouchMove"
              @touchend="onCanvasTouchEnd"
              @touchcancel="onCanvasTouchEnd"
            />
          </view>
        </scroll-view>
        <text class="caption">可滑动查看，双指捏合缩放，点“编辑格子”后可改单格颜色</text>
      </view>

      <view v-if="editMode" class="beads__edit-dock">
        <view class="beads__edit-dock-head">
          <view class="beads__brush-current">
            <view
              class="beads__brush-preview"
              :class="{ 'beads__brush-preview--empty': activePaletteIndex === EMPTY_CELL || activePaletteIndex === null }"
              :style="activeBrushPreviewStyle"
            />
            <text class="section-title">画笔 {{ activeBrushText }}</text>
          </view>
          <text class="caption beads__selected-text">{{ selectedCellText }}</text>
          <view class="beads__edit-done" @tap="toggleEditMode">完成</view>
        </view>
        <scroll-view class="beads__brush-strip" scroll-x enhanced>
          <view class="beads__brush-row">
            <view class="beads__brush-column">
              <view
                class="beads__brush-swatch beads__brush-swatch--empty"
                :class="{ 'beads__brush-swatch--active': activePaletteIndex === EMPTY_CELL }"
                @tap="selectBrush(EMPTY_CELL)"
              >
                空
              </view>
            </view>
            <view
              v-for="(column, columnIndex) in editPaletteColumns"
              :key="columnIndex"
              class="beads__brush-column"
            >
              <view
                v-for="entry in column"
                :key="entry.index"
                class="beads__brush-swatch"
                :class="{ 'beads__brush-swatch--active': activePaletteIndex === entry.index }"
                :style="{ backgroundColor: entry.color.hex, color: textColorOn(entry.color.rgb) }"
                @tap="selectBrush(entry.index)"
              >
                {{ displayCode(entry.color.code) }}
              </view>
            </view>
          </view>
        </scroll-view>
      </view>

      <ColorLegend :used="result.used" />

      <view class="beads__actions">
        <view
          class="btn-primary beads__save"
          :class="{ disabled: exporter.exporting.value || dirty }"
          @tap="onSave"
        >
          保存高清图纸
        </view>
      </view>
    </template>

    <!-- 导出专用隐藏 canvas（导出瞬间才设置大尺寸） -->
    <canvas id="export-canvas" type="2d" class="beads__export-canvas" />
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, ref } from 'vue'
import ParamPanel from '@/components/ParamPanel.vue'
import ColorLegend from '@/components/ColorLegend.vue'
import { useBeadPattern } from '@/composables/useBeadPattern'
import { useBeadCanvas } from '@/composables/useBeadCanvas'
import { useBeadExport } from '@/composables/useBeadExport'
import { getPalette } from '@/utils/beadPalette'
import { chooseImage } from '@/utils/canvasAdapter'
import { EMPTY_CELL } from '@/types/beads'
import { displayCode } from '@/utils/format'
import { textColorOn } from '@/utils/color'

const instance = getCurrentInstance()?.proxy

const imagePath = ref('')
const { params, result, generating, error, generate, editCell, reset } = useBeadPattern()
const preview = useBeadCanvas('#preview-canvas')
const exporter = useBeadExport('#export-canvas')
const editMode = ref(false)
const selectedCell = ref<{ x: number; y: number; paletteIndex: number } | null>(null)
const activePaletteIndex = ref<number | null>(null)
const ignoreNextTap = ref(false)

/** 参数与已生成结果不一致时提示重新生成 */
const dirty = computed(() => {
  if (!result.value) return false
  const generated = result.value.params
  return (
    generated.boardPresetKey !== params.boardPresetKey ||
    generated.gridWidth !== params.gridWidth ||
    generated.gridHeight !== params.gridHeight ||
    generated.autoGridSize !== params.autoGridSize ||
    generated.gridLongSide !== params.gridLongSide ||
    generated.paletteKey !== params.paletteKey ||
    generated.removeBackground !== params.removeBackground
  )
})

const editPaletteColors = computed(() => {
  if (!result.value) return []
  return getPalette(result.value.params.paletteKey).colors
})

const editPaletteEntries = computed(() => {
  if (!result.value) return []
  const colors = editPaletteColors.value
  const usedIndexes = new Set(result.value.used.map((item) => item.paletteIndex))
  const used = result.value.used.map((item) => ({
    index: item.paletteIndex,
    color: item.color,
  }))
  const rest = colors
    .map((color, index) => ({ index, color }))
    .filter((entry) => !usedIndexes.has(entry.index))
  return [...used, ...rest]
})

const editPaletteColumns = computed(() => {
  const columns: Array<Array<{ index: number; color: (typeof editPaletteEntries.value)[number]['color'] }>> = []
  const entries = editPaletteEntries.value
  for (let i = 0; i < entries.length; i += 2) {
    columns.push(entries.slice(i, i + 2))
  }
  return columns
})

const selectedCellText = computed(() => {
  if (!selectedCell.value || !result.value) return '未选中'
  const { x, y, paletteIndex } = selectedCell.value
  if (paletteIndex === EMPTY_CELL) {
    return `${x + 1} 列 · ${y + 1} 行 · 空格`
  }
  const color = getPalette(result.value.params.paletteKey).colors[paletteIndex]
  return `${x + 1} 列 · ${y + 1} 行 · ${color ? displayCode(color.code) : '未知'}`
})

const activeBrushText = computed(() => {
  if (activePaletteIndex.value === null) return '未选'
  if (activePaletteIndex.value === EMPTY_CELL) return '空格'
  const color = editPaletteColors.value[activePaletteIndex.value]
  return color ? displayCode(color.code) : '未知'
})

const activeBrushPreviewStyle = computed<Record<string, string>>(() => {
  if (activePaletteIndex.value === null || activePaletteIndex.value === EMPTY_CELL) {
    return {} as Record<string, string>
  }
  const color = editPaletteColors.value[activePaletteIndex.value]
  if (!color) return {} as Record<string, string>
  return {
    backgroundColor: color.hex,
  }
})

const summaryText = computed(() => {
  if (!result.value) return ''
  const palette = getPalette(result.value.params.paletteKey)
  const { width, height, totalBeads, used, boardPlan } = result.value
  return `${palette.displayName}(${totalBeads}) · ${width}×${height} · ${boardPlan.label} · ${used.length} 色`
})

async function pickImage() {
  try {
    const path = await chooseImage()
    imagePath.value = path
    reset()
    editMode.value = false
    selectedCell.value = null
    activePaletteIndex.value = null
    // 结果区 v-if 卸载会让缓存的 canvas 节点失效，必须释放重查
    preview.release()
  } catch {
    // 用户取消选图，不提示
  }
}

function onParamsChange() {
  editMode.value = false
  selectedCell.value = null
  activePaletteIndex.value = null
}

async function onGenerate() {
  if (generating.value || !imagePath.value) return
  const generated = await generate(imagePath.value)
  if (!generated) {
    uni.showToast({ title: error.value || '生成失败，请重试', icon: 'none' })
    return
  }
  if (generated.totalBeads === 0) {
    reset()
    uni.showToast({ title: '图片内容为空，请换一张试试', icon: 'none' })
    return
  }
  await nextTick()
  selectedCell.value = null
  activePaletteIndex.value = null
  await preview.render(generated, instance)
}

async function onZoom(zoom: number) {
  await preview.setZoom(zoom, result.value, instance)
}

function onZoomSliderChanging(event: { detail: { value: number } }) {
  preview.setLiveZoom(event.detail.value / 100)
}

async function onZoomSliderChange(event: { detail: { value: number } }) {
  await preview.setZoom(event.detail.value / 100, result.value, instance)
}

async function onSave() {
  if (!result.value || dirty.value) return
  await exporter.exportAndSave(result.value, instance)
}

function toggleEditMode() {
  if (!result.value || dirty.value) return
  editMode.value = !editMode.value
  selectedCell.value = null
  if (!editMode.value) {
    activePaletteIndex.value = null
  }
}

async function onCanvasTap(event: unknown) {
  if (ignoreNextTap.value) {
    ignoreNextTap.value = false
    return
  }
  if (!editMode.value || !result.value) return
  const hit = await preview.getCellFromEvent(event, result.value, instance)
  if (!hit) return
  if (activePaletteIndex.value === null) {
    selectedCell.value = hit
    return
  }
  await paintCell(hit.x, hit.y, activePaletteIndex.value)
}

function onCanvasTouchStart(event: unknown) {
  if (preview.onPinchStart(event)) {
    ignoreNextTap.value = true
  }
}

function onCanvasTouchMove(event: unknown) {
  if (preview.onPinchMove(event)) {
    ignoreNextTap.value = true
  }
}

async function onCanvasTouchEnd() {
  const wasPinching = await preview.onPinchEnd(result.value, instance)
  if (wasPinching) {
    ignoreNextTap.value = true
    setTimeout(() => {
      ignoreNextTap.value = false
    }, 300)
  }
}

async function applyCellColor(paletteIndex: number) {
  if (!selectedCell.value || !result.value) return
  await paintCell(selectedCell.value.x, selectedCell.value.y, paletteIndex)
}

async function selectBrush(paletteIndex: number) {
  activePaletteIndex.value = paletteIndex
  if (selectedCell.value) {
    await applyCellColor(paletteIndex)
  }
}

async function paintCell(x: number, y: number, paletteIndex: number) {
  if (!result.value) return
  const current = result.value.cells[y * result.value.width + x]
  if (current === paletteIndex) {
    selectedCell.value = { x, y, paletteIndex }
    return
  }
  const edited = editCell(x, y, paletteIndex)
  if (!edited) return
  selectedCell.value = {
    x,
    y,
    paletteIndex,
  }
  await preview.render(edited, instance)
}
</script>

<style lang="scss" scoped>
.beads {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
  padding: 32rpx 32rpx 64rpx;

  &--editing {
    padding-bottom: 280rpx;
  }

  &__picker {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16rpx;
    padding: 96rpx 32rpx;
    border: 4rpx dashed $color-border;
    box-shadow: none;
  }

  &__picker-icon {
    font-size: 88rpx;
  }

  &__picker-text {
    font-size: $font-title;
    font-weight: 600;
    color: $color-primary-dark;
  }

  &__privacy {
    margin-top: 24rpx;
  }

  &__preview {
    display: flex;
    flex-direction: column;
    gap: 20rpx;
    align-items: center;
  }

  &__thumb {
    width: 100%;
    height: 360rpx;
    border-radius: $radius-md;
    background-color: $color-bg;
  }

  &__preview-actions {
    display: flex;
    gap: 16rpx;
  }

  &__small-btn {
    padding: 12rpx 40rpx;
  }

  &__dirty {
    background-color: #fdf1e3;
    border: 2rpx solid $color-primary-light;
    color: $color-primary-dark;
    border-radius: $radius-md;
    text-align: center;
    padding: 20rpx 0;
    font-size: $font-body;
  }

  &__result {
    display: flex;
    flex-direction: column;
    gap: 20rpx;
  }

  &__summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 16rpx;
  }

  &__summary-text {
    flex: 1;
    min-width: 0;
  }

  &__zoom {
    display: flex;
    flex-shrink: 0;
    gap: 8rpx;
  }

  &__zoom-slider {
    display: flex;
    align-items: center;
    gap: 16rpx;

    .caption {
      width: 72rpx;
      text-align: right;
    }
  }

  &__zoom-range {
    flex: 1;
    min-width: 0;
    margin: 0;
  }

  &__edit-toggle {
    flex-shrink: 0;
    padding: 8rpx 20rpx;
    border-radius: $radius-sm;
    background-color: $color-bg;
    border: 2rpx solid $color-border;
    color: $color-text-secondary;
    font-size: $font-caption;

    &--active {
      background-color: $color-primary;
      border-color: $color-primary;
      color: #ffffff;
      font-weight: 600;
    }
  }

  &__zoom-btn {
    padding: 8rpx 24rpx;
    border-radius: 999rpx;
    background-color: $color-bg;
    border: 2rpx solid $color-border;
    font-size: $font-caption;
    color: $color-text-secondary;

    &--active {
      background-color: $color-primary;
      border-color: $color-primary;
      color: #ffffff;
    }
  }

  &__scroll {
    width: 100%;
    height: 720rpx;
    background-color: $color-bg;
    border-radius: $radius-md;

    &--editing {
      height: calc(100vh - 520rpx);
      min-height: 460rpx;
      max-height: 720rpx;
    }
  }

  &__canvas-wrap {
    display: inline-block;
    position: relative;

    &--editing {
      padding-bottom: 300rpx;
    }
  }

  &__canvas {
    display: block;
    pointer-events: none;
  }

  &__canvas-hit {
    position: absolute;
    left: 0;
    top: 0;
    z-index: 1;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    background-color: rgba(255, 255, 255, 0.001);
    touch-action: none;

    &--active {
      border: 4rpx solid rgba(200, 149, 108, 0.55);
    }

    &--pinching {
      border: 4rpx solid rgba(168, 116, 75, 0.85);
    }
  }

  &__edit-dock {
    position: fixed;
    left: 24rpx;
    right: 24rpx;
    bottom: calc(20rpx + constant(safe-area-inset-bottom));
    bottom: calc(20rpx + env(safe-area-inset-bottom));
    z-index: 20;
    display: flex;
    flex-direction: column;
    gap: 16rpx;
    padding: 20rpx;
    border: 2rpx solid rgba(200, 149, 108, 0.28);
    border-radius: $radius-md;
    background-color: rgba(255, 255, 255, 0.96);
    box-shadow: 0 -10rpx 34rpx rgba(55, 39, 30, 0.16);
    backdrop-filter: blur(12px);
  }

  &__edit-dock-head {
    display: flex;
    align-items: center;
    gap: 14rpx;
  }

  &__brush-current {
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
    gap: 10rpx;
  }

  &__brush-preview {
    width: 36rpx;
    height: 36rpx;
    flex-shrink: 0;
    border-radius: $radius-sm;
    border: 2rpx solid rgba(0, 0, 0, 0.16);
  }

  &__brush-preview--empty,
  &__brush-swatch--empty {
    background-image:
      linear-gradient(45deg, #e6e6e6 25%, transparent 25%),
      linear-gradient(-45deg, #e6e6e6 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #e6e6e6 75%),
      linear-gradient(-45deg, transparent 75%, #e6e6e6 75%);
    background-size: 24rpx 24rpx;
    background-position: 0 0, 0 12rpx, 12rpx -12rpx, -12rpx 0;
    background-color: #ffffff;
  }

  &__selected-text {
    max-width: 260rpx;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: right;
  }

  &__edit-done {
    flex-shrink: 0;
    padding: 10rpx 22rpx;
    border-radius: $radius-sm;
    background-color: $color-primary;
    color: #ffffff;
    font-size: $font-caption;
    font-weight: 600;
  }

  &__brush-strip {
    width: 100%;
    white-space: nowrap;
  }

  &__brush-row {
    display: inline-flex;
    gap: 10rpx;
    padding-bottom: 4rpx;
  }

  &__brush-column {
    display: flex;
    flex-direction: column;
    gap: 10rpx;
  }

  &__brush-swatch {
    width: 82rpx;
    height: 56rpx;
    border-radius: $radius-sm;
    border: 4rpx solid rgba(0, 0, 0, 0.12);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22rpx;
    font-weight: 700;

    &--active {
      border-color: $color-primary;
      box-shadow: 0 0 0 4rpx rgba(200, 149, 108, 0.24);
    }
  }

  &__export-canvas {
    position: fixed;
    left: 9999px;
    top: 0;
    width: 10px;
    height: 10px;
  }
}
</style>

<template>
  <view class="beads" :class="{ 'beads--panel': panelOpen }">
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
    <ParamPanel
      v-if="imagePath"
      :params="params"
      :disabled="generating"
      @change="onParamsChange"
      @inventory-change="onInventoryChange"
    />

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
          <view v-if="canUndo && !build.active.value" class="beads__edit-toggle" @tap="onUndo">↶ 撤销</view>
          <view
            v-if="!build.active.value"
            class="beads__edit-toggle"
            :class="{ 'beads__edit-toggle--active': editMode, disabled: dirty }"
            @tap="toggleEditMode"
          >
            编辑格子
          </view>
          <view
            class="beads__edit-toggle"
            :class="{ 'beads__edit-toggle--active': build.active.value, disabled: dirty }"
            @tap="toggleBuildMode"
          >
            {{ build.active.value ? '退出拼制' : '开始拼制' }}
          </view>
          <view
            v-if="!build.active.value"
            class="beads__edit-toggle"
            :class="{ 'beads__edit-toggle--active': compareOpen }"
            @tap="toggleCompare"
          >
            对比原图
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
        <!-- 原图 vs 图纸 左右并排对比 -->
        <view v-if="compareOpen" class="beads__compare">
          <view class="beads__compare-col">
            <image
              class="beads__compare-img"
              :style="{ height: compareCssH + 'px' }"
              :src="imagePath"
              mode="aspectFit"
            />
            <text class="caption">原图</text>
          </view>
          <view class="beads__compare-col">
            <canvas
              id="compare-canvas"
              type="2d"
              class="beads__compare-img"
              :style="{ width: compareCssW + 'px', height: compareCssH + 'px' }"
            />
            <text class="caption">图纸</text>
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

        <!-- 拼制模式：进度条 + 当前施工色 -->
        <view v-if="build.active.value" class="beads__build-bar">
          <view class="beads__build-track">
            <view class="beads__build-fill" :style="{ width: buildPercent + '%' }" />
          </view>
          <text class="caption">
            拼制进度 {{ buildDoneBeads }}/{{ result.totalBeads }} 颗 ·
            {{ build.doneCount.value }}/{{ result.used.length }} 色
          </text>
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

      <!-- 底部面板：逐格编辑(画笔/橡皮擦) · 隔离高亮(批量改色擦除) · 选目标色 -->
      <view v-if="panelOpen" class="beads__edit-dock">
        <template v-if="bottomMode === 'edit'">
          <view class="beads__edit-dock-head">
            <view class="beads__brush-current">
              <view
                class="beads__brush-preview"
                :class="{ 'beads__brush-preview--empty': activePaletteIndex === EMPTY_CELL || activePaletteIndex === null }"
                :style="activeBrushPreviewStyle"
              />
              <text class="section-title">{{ activeBrushText }}</text>
            </view>
            <text class="caption beads__selected-text">{{ selectedCellText }}</text>
            <view
              class="beads__dock-eraser"
              :class="{ 'beads__dock-eraser--active': activePaletteIndex === EMPTY_CELL }"
              @tap="toggleEraser"
            >
              ⌫ 擦除
            </view>
            <view class="beads__edit-done" @tap="toggleEditMode">完成</view>
          </view>
          <scroll-view class="beads__brush-strip" scroll-x enhanced>
            <view class="beads__brush-row">
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
        </template>

        <template v-else-if="bottomMode === 'highlight'">
          <view class="beads__edit-dock-head">
            <view class="beads__brush-current">
              <view
                v-if="highlightedColor"
                class="beads__brush-preview"
                :style="{ backgroundColor: highlightedColor.hex }"
              />
              <text class="section-title">
                {{ highlightedColor ? displayCode(highlightedColor.code) : '' }} 已高亮
              </text>
            </view>
            <view class="beads__dock-action beads__dock-action--primary" @tap="onRecolorAll">
              全部改色
            </view>
            <view class="beads__dock-action beads__dock-action--danger" @tap="onEraseAll">
              全部擦除
            </view>
            <view class="beads__edit-done" @tap="onCancelHighlight">取消</view>
          </view>
        </template>

        <template v-else-if="bottomMode === 'pick-target'">
          <view class="beads__edit-dock-head">
            <view class="beads__brush-current">
              <text class="section-title">改成哪种颜色？</text>
            </view>
            <view class="beads__edit-done" @tap="onCancelPick">返回</view>
          </view>
          <scroll-view class="beads__brush-strip" scroll-x enhanced>
            <view class="beads__brush-row">
              <view
                v-for="(column, columnIndex) in editPaletteColumns"
                :key="columnIndex"
                class="beads__brush-column"
              >
                <view
                  v-for="entry in column"
                  :key="entry.index"
                  class="beads__brush-swatch"
                  :style="{ backgroundColor: entry.color.hex, color: textColorOn(entry.color.rgb) }"
                  @tap="onPickTarget(entry.index)"
                >
                  {{ displayCode(entry.color.code) }}
                </view>
              </view>
            </view>
          </scroll-view>
        </template>
      </view>

      <!-- 拼制向导底部面板：当前施工色 + 完成跳转 + 全色清单打勾 -->
      <view v-if="build.active.value" class="beads__edit-dock">
        <view class="beads__edit-dock-head">
          <view class="beads__brush-current">
            <view
              v-if="buildFocusColor"
              class="beads__brush-preview"
              :style="{ backgroundColor: buildFocusColor.hex }"
            />
            <text class="section-title">{{ build.focusText(result) }}</text>
          </view>
          <view
            v-if="build.focusIndex.value !== null"
            class="beads__dock-action beads__dock-action--primary"
            @tap="onCompleteFocused"
          >
            这个色拼好了 ✓
          </view>
          <view class="beads__edit-done" @tap="toggleBuildMode">退出</view>
        </view>
        <scroll-view class="beads__brush-strip" scroll-x enhanced>
          <view class="beads__brush-row beads__build-row">
            <view
              v-for="item in result.used"
              :key="item.color.code"
              class="beads__build-chip"
              :class="{
                'beads__build-chip--focus': build.focusIndex.value === item.paletteIndex,
                'beads__build-chip--done': build.isDone(item.color.code),
              }"
              :style="{ backgroundColor: item.color.hex, color: textColorOn(item.color.rgb) }"
              @tap="onFocusColor(item.paletteIndex)"
              @longpress="onToggleDone(item.paletteIndex)"
            >
              <text class="beads__build-chip-code">{{ displayCode(item.color.code) }}</text>
              <text class="beads__build-chip-count">{{ item.count }}</text>
              <text v-if="build.isDone(item.color.code)" class="beads__build-chip-check">✓</text>
            </view>
          </view>
        </scroll-view>
        <text class="caption">点色号聚焦施工 · 长按可标记/取消完成</text>
      </view>

      <ColorLegend :used="result.used" :active-index="highlightIndex" @select="onLegendSelect" />

      <ShoppingList :used="result.used" />

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
import ShoppingList from '@/components/ShoppingList.vue'
import { useBeadPattern } from '@/composables/useBeadPattern'
import { useBeadCanvas } from '@/composables/useBeadCanvas'
import { useBeadExport } from '@/composables/useBeadExport'
import { useBeadInventory } from '@/composables/useBeadInventory'
import { useBuildProgress } from '@/composables/useBuildProgress'
import { getPalette } from '@/utils/beadPalette'
import { chooseImage, getCanvasNode, getWindowInfo } from '@/utils/canvasAdapter'
import { EMPTY_CELL } from '@/types/beads'
import { PAGE_CELLS } from '@/utils/sheetPaginator'
import { displayCode } from '@/utils/format'
import { textColorOn } from '@/utils/color'

const instance = getCurrentInstance()?.proxy

const imagePath = ref('')
const { params, result, generating, error, generate, editCell, recolor, eraseAll, undo, canUndo, reset } =
  useBeadPattern()
const inventory = useBeadInventory()
const build = useBuildProgress()
const preview = useBeadCanvas('#preview-canvas')
const exporter = useBeadExport('#export-canvas')
const editMode = ref(false)
/** ownedOnly 下库存内容变了（勾选/取消豆色）→ 需重新生成，参数无差异也要提示 */
const inventoryDirty = ref(false)
/** 隔离高亮的色板下标（点图例颜色定位该色）；null = 不高亮 */
const highlightIndex = ref<number | null>(null)
/** "全部改色"时正在选目标色 */
const pickingTarget = ref(false)
const selectedCell = ref<{ x: number; y: number; paletteIndex: number } | null>(null)
const activePaletteIndex = ref<number | null>(null)
const ignoreNextTap = ref(false)

/** 参数与已生成结果不一致时提示重新生成 */
const dirty = computed(() => {
  if (!result.value) return false
  if (inventoryDirty.value) return true
  const generated = result.value.params
  return (
    generated.boardPresetKey !== params.boardPresetKey ||
    generated.gridWidth !== params.gridWidth ||
    generated.gridHeight !== params.gridHeight ||
    generated.autoGridSize !== params.autoGridSize ||
    generated.gridLongSide !== params.gridLongSide ||
    generated.paletteKey !== params.paletteKey ||
    generated.removeBackground !== params.removeBackground ||
    generated.ownedOnly !== params.ownedOnly
  )
})

/** 底部面板形态：逐格编辑 / 隔离高亮(批量改色擦除) / 选目标色 / 无 */
const bottomMode = computed<'none' | 'edit' | 'highlight' | 'pick-target'>(() => {
  if (editMode.value) return 'edit'
  if (pickingTarget.value) return 'pick-target'
  if (highlightIndex.value !== null) return 'highlight'
  return 'none'
})
const panelOpen = computed(() => bottomMode.value !== 'none' || build.active.value)

const highlightedColor = computed(() => {
  if (highlightIndex.value === null || !result.value) return null
  return getPalette(result.value.params.paletteKey).colors[highlightIndex.value] ?? null
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
  if (activePaletteIndex.value === EMPTY_CELL) return '橡皮擦'
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

/** 拼制进度：已拼豆数 / 百分比 / 当前聚焦色 */
const buildDoneBeads = computed(() => (result.value ? build.doneBeads(result.value) : 0))
const buildPercent = computed(() => {
  if (!result.value || result.value.totalBeads === 0) return 0
  return Math.round((buildDoneBeads.value / result.value.totalBeads) * 100)
})
const buildFocusColor = computed(() => {
  if (build.focusIndex.value === null || !result.value) return null
  return getPalette(result.value.params.paletteKey).colors[build.focusIndex.value] ?? null
})

/** 原图 vs 图纸对比 */
const compareOpen = ref(false)
const compareCssW = ref(0)
const compareCssH = ref(0)

async function toggleCompare() {
  compareOpen.value = !compareOpen.value
  if (compareOpen.value) {
    await nextTick()
    await renderCompareGrid()
  }
}

/** 右侧对比图：只画纯色格（无色号/图例/标题），最能直观对照原图还原度 */
async function renderCompareGrid() {
  if (!result.value) return
  const r = result.value
  const half = ((getWindowInfo().windowWidth || 375) - 32) / 2 - 8
  const cssW = Math.max(80, half)
  const cssH = (r.height / r.width) * cssW
  compareCssW.value = cssW
  compareCssH.value = cssH
  try {
    const { canvas, ctx, dpr } = await getCanvasNode('#compare-canvas', instance)
    const px = Math.min(800, Math.round(cssW * dpr))
    const cellPx = px / r.width
    canvas.width = Math.round(r.width * cellPx)
    canvas.height = Math.round(r.height * cellPx)
    const palette = getPalette(r.params.paletteKey)
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    for (let y = 0; y < r.height; y++) {
      const py = Math.round(y * cellPx)
      const ph = Math.round((y + 1) * cellPx) - py
      for (let x = 0; x < r.width; x++) {
        const idx = r.cells[y * r.width + x]
        if (idx === EMPTY_CELL) continue
        ctx.fillStyle = palette.colors[idx].hex
        ctx.fillRect(Math.round(x * cellPx), py, Math.round((x + 1) * cellPx) - Math.round(x * cellPx), ph)
      }
    }
  } catch {
    /* 对比图渲染失败不影响主流程 */
  }
}

async function pickImage() {
  try {
    const path = await chooseImage()
    imagePath.value = path
    reset()
    editMode.value = false
    highlightIndex.value = null
    pickingTarget.value = false
    selectedCell.value = null
    activePaletteIndex.value = null
    if (build.active.value) build.exit()
    compareOpen.value = false
    // 结果区 v-if 卸载会让缓存的 canvas 节点失效，必须释放重查
    preview.release()
  } catch (e) {
    // 用户主动取消不提示；其它错误弹出真实原因，避免"点了没反应"
    const msg = e instanceof Error ? e.message : ''
    if (msg && !/cancel|未选择图片/i.test(msg)) {
      uni.showToast({ title: msg, icon: 'none' })
    }
  }
}

function onParamsChange() {
  editMode.value = false
  highlightIndex.value = null
  pickingTarget.value = false
  selectedCell.value = null
  activePaletteIndex.value = null
}

/** 库存勾选变化：ownedOnly 开启且已有结果时，标记需重新生成 */
function onInventoryChange() {
  if (params.ownedOnly && result.value) {
    inventoryDirty.value = true
  }
}

async function onGenerate() {
  if (generating.value || !imagePath.value) return
  highlightIndex.value = null
  pickingTarget.value = false
  editMode.value = false
  activePaletteIndex.value = null
  if (build.active.value) build.exit()
  compareOpen.value = false
  await preview.setHighlight(null, null)
  const allowed = params.ownedOnly ? inventory.allowedIndices(params.paletteKey) : undefined
  const generated = await generate(imagePath.value, allowed)
  if (!generated) {
    uni.showToast({ title: error.value || '生成失败，请重试', icon: 'none' })
    return
  }
  if (generated.totalBeads === 0) {
    reset()
    uni.showToast({ title: '图片内容为空，请换一张试试', icon: 'none' })
    return
  }
  inventoryDirty.value = false
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
  const r = result.value
  // 大图（多板或长边 >64）整图导出后单格色号太小，提示可选分页打印
  const longSide = Math.max(r.width, r.height)
  if (r.boardPlan.total > 1 || longSide > 64) {
    const pageCount = Math.ceil(r.width / PAGE_CELLS) * Math.ceil(r.height / PAGE_CELLS)
    uni.showActionSheet({
      itemList: ['整图（一张）', `分页打印（${pageCount} 张，色号更清晰）`],
      success: async (res) => {
        if (res.tapIndex === 0) {
          await exporter.exportAndSave(r, instance)
        } else if (res.tapIndex === 1) {
          await exporter.exportPagesAndSave(r, instance)
        }
      },
    })
    return
  }
  await exporter.exportAndSave(r, instance)
}

async function toggleEditMode() {
  if (!result.value || dirty.value) return
  editMode.value = !editMode.value
  selectedCell.value = null
  if (editMode.value) {
    // 进入逐格编辑：退出隔离高亮 / 选目标色 / 拼制
    highlightIndex.value = null
    pickingTarget.value = false
    if (build.active.value) build.exit()
    await preview.setHighlight(null, result.value, instance)
  } else {
    activePaletteIndex.value = null
  }
}

/** 进入/退出拼制向导：进入即聚焦第一个未完成色并在图上高亮 */
async function toggleBuildMode() {
  if (!result.value || dirty.value) return
  if (build.active.value) {
    build.exit()
    await preview.setHighlight(null, result.value, instance)
    return
  }
  // 进入拼制：退出编辑 / 隔离高亮 / 选目标色
  editMode.value = false
  pickingTarget.value = false
  highlightIndex.value = null
  selectedCell.value = null
  activePaletteIndex.value = null
  build.enter(result.value)
  await preview.setHighlight(build.focusIndex.value, result.value, instance)
}

/** 标记当前色拼好 → 聚焦下一个未完成色并重绘高亮 */
async function onCompleteFocused() {
  if (!result.value) return
  build.completeFocused(result.value)
  await preview.setHighlight(build.focusIndex.value, result.value, instance)
  if (build.focusIndex.value === null) {
    uni.showToast({ title: '全部拼完啦 🎉', icon: 'success' })
  }
}

/** 拼制中点色号聚焦该色施工 */
async function onFocusColor(paletteIndex: number) {
  if (!result.value) return
  build.focus(paletteIndex)
  await preview.setHighlight(paletteIndex, result.value, instance)
}

/** 长按切换某色完成标记 */
async function onToggleDone(paletteIndex: number) {
  if (!result.value) return
  build.toggleDone(result.value, paletteIndex)
}

/** 点图例颜色：隔离高亮该色（图纸里暗化其它聚焦该色），再点同一色取消 */
async function onLegendSelect(paletteIndex: number) {
  if (!result.value || dirty.value) return
  const next = highlightIndex.value === paletteIndex ? null : paletteIndex
  editMode.value = false
  pickingTarget.value = false
  selectedCell.value = null
  activePaletteIndex.value = null
  highlightIndex.value = next
  await preview.setHighlight(next, result.value, instance)
}

/** 高亮色 → 进入选目标色，挑一个色把全部高亮格改成它 */
function onRecolorAll() {
  if (highlightIndex.value === null) return
  pickingTarget.value = true
}

async function onPickTarget(targetIndex: number) {
  if (!result.value || highlightIndex.value === null) return
  const edited = recolor(highlightIndex.value, targetIndex)
  highlightIndex.value = null
  pickingTarget.value = false
  if (edited) await preview.setHighlight(null, edited, instance)
}

async function onEraseAll() {
  if (!result.value || highlightIndex.value === null) return
  const edited = eraseAll(highlightIndex.value)
  highlightIndex.value = null
  if (edited) await preview.setHighlight(null, edited, instance)
}

async function onCancelHighlight() {
  highlightIndex.value = null
  if (result.value) await preview.setHighlight(null, result.value, instance)
}

function onCancelPick() {
  pickingTarget.value = false
}

/** 橡皮擦开关：激活后点单格即擦除（与画笔互斥） */
function toggleEraser() {
  activePaletteIndex.value = activePaletteIndex.value === EMPTY_CELL ? null : EMPTY_CELL
}

/** 撤销最近一次编辑（单格画/擦、批量改色/擦除各算一步） */
async function onUndo() {
  if (!result.value) return
  const restored = undo()
  if (!restored) return
  selectedCell.value = null
  pickingTarget.value = false
  // 保持当前隔离高亮（如有），用恢复后的结果重绘
  await preview.setHighlight(highlightIndex.value, restored, instance)
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
  // 优先增量重绘该格（版式未变时秒回），版式变化则回退全量
  if (!preview.renderEditedCell(edited, x, y)) {
    await preview.render(edited, instance)
  }
}
</script>

<style lang="scss" scoped>
.beads {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
  padding: 32rpx 32rpx 64rpx;

  &--panel {
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

  &__build-bar {
    display: flex;
    flex-direction: column;
    gap: 8rpx;
  }

  &__compare {
    display: flex;
    gap: 16rpx;
  }

  &__compare-col {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8rpx;
  }

  &__compare-img {
    width: 100%;
    border-radius: $radius-sm;
    background-color: $color-bg;
    border: 2rpx solid $color-border;
  }

  &__build-track {
    width: 100%;
    height: 16rpx;
    border-radius: 999rpx;
    background-color: $color-bg;
    overflow: hidden;
  }

  &__build-fill {
    height: 100%;
    border-radius: 999rpx;
    background-color: $color-primary;
    transition: width 0.25s;
  }

  &__build-row {
    align-items: stretch;
  }

  &__build-chip {
    position: relative;
    min-width: 96rpx;
    padding: 12rpx 16rpx;
    border-radius: $radius-sm;
    border: 4rpx solid rgba(0, 0, 0, 0.12);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2rpx;

    &--focus {
      border-color: $color-primary-dark;
      box-shadow: 0 0 0 4rpx rgba(200, 149, 108, 0.3);
    }

    &--done {
      opacity: 0.45;
    }
  }

  &__build-chip-code {
    font-size: 24rpx;
    font-weight: 700;
  }

  &__build-chip-count {
    font-size: 20rpx;
  }

  &__build-chip-check {
    position: absolute;
    top: 2rpx;
    right: 8rpx;
    font-size: 22rpx;
    font-weight: 700;
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
    // 默认允许纵横平移，否则覆盖层会吞掉单指拖动手势，放大后 scroll-view 拖不动（真机）。
    // 仅在双指捏合时禁用原生手势，防止页面缩放干扰自定义 pinch。
    touch-action: pan-x pan-y;

    &--active {
      border: 4rpx solid rgba(200, 149, 108, 0.55);
    }

    &--pinching {
      touch-action: none;
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

  &__dock-eraser {
    flex-shrink: 0;
    padding: 10rpx 22rpx;
    border-radius: $radius-sm;
    background-color: $color-bg;
    border: 2rpx solid $color-border;
    color: $color-text-secondary;
    font-size: $font-caption;
    font-weight: 600;

    &--active {
      background-color: $color-primary;
      border-color: $color-primary;
      color: #ffffff;
    }
  }

  &__dock-action {
    flex-shrink: 0;
    padding: 10rpx 22rpx;
    border-radius: $radius-sm;
    border: 2rpx solid transparent;
    font-size: $font-caption;
    font-weight: 600;

    &--primary {
      background-color: $color-primary;
      color: #ffffff;
    }

    &--danger {
      background-color: #fbecec;
      border-color: #e6b3b3;
      color: #b03a3a;
    }
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

import { ref } from 'vue'
import type { PatternResult } from '@/types/beads'
import { canvasToFile, getCanvasNode, openAuthSetting, saveImageToAlbum } from '@/utils/canvasAdapter'
import { computeSheetLayout, renderSheet } from '@/utils/sheetRenderer'

/**
 * 高清图纸导出：隐藏的页内 <canvas type="2d"> 上按 ≤4000px 渲染完整图纸，
 * 导出 PNG 保存相册。失败降级 2800px 重试一次；授权被拒引导去设置页。
 */
export function useBeadExport(selector: string) {
  const exporting = ref(false)

  async function renderAndExport(
    result: PatternResult,
    maxCanvasPx: number,
    component?: unknown,
  ): Promise<string> {
    const { canvas, ctx } = await getCanvasNode(selector, component)
    const layout = computeSheetLayout(result, maxCanvasPx)
    canvas.width = layout.totalW
    canvas.height = layout.totalH
    renderSheet(ctx, result, layout)
    try {
      return await canvasToFile(canvas, layout.totalW, layout.totalH)
    } finally {
      // 大 canvas 用完立即缩到 1×1 释放内存
      canvas.width = 1
      canvas.height = 1
    }
  }

  async function exportAndSave(result: PatternResult, component?: unknown): Promise<boolean> {
    if (exporting.value) return false
    exporting.value = true
    uni.showLoading({ title: '正在生成图纸…', mask: true })
    try {
      let filePath: string
      try {
        filePath = await renderAndExport(result, 4000, component)
      } catch {
        // 低端机大 canvas 可能导出失败，降分辨率重试一次
        filePath = await renderAndExport(result, 2800, component)
      }

      await saveImageToAlbum(filePath)
      uni.hideLoading()
      // #ifdef MP-WEIXIN
      uni.showToast({ title: '已保存到相册', icon: 'success' })
      // #endif
      // #ifdef H5
      uni.showToast({ title: '图纸已下载', icon: 'success' })
      // #endif
      return true
    } catch (err) {
      uni.hideLoading()
      const message = err instanceof Error ? err.message : String(err)
      if (/auth|deny|denied/i.test(message)) {
        uni.showModal({
          title: '需要相册权限',
          content: '保存图纸需要相册权限，请在设置中开启「添加到相册」',
          confirmText: '去设置',
          success: (res) => {
            if (res.confirm) {
              openAuthSetting()
            }
          },
        })
      } else if (!/cancel/i.test(message)) {
        uni.showToast({ title: '保存失败，请重试', icon: 'none' })
      }
      return false
    } finally {
      exporting.value = false
    }
  }

  return { exporting, exportAndSave }
}

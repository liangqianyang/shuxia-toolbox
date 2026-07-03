import { loadDrawableImage } from '@/utils/canvasAdapter'

/**
 * 攻略卡片图片预加载。
 * 每张卡片有各自的 canvas；MP 下 canvas.createImage() 产出的图片绑定到该 canvas，
 * 所以要在「即将绘制它的那张 canvas」上加载真实底图（route/poi staticMap URL）。
 * 单张加载失败静默返回 null（该卡退化为无底图渲染，不影响整图）。
 */
export async function preloadMapImage(
  canvas: unknown,
  url: string | null,
): Promise<CanvasImageSource | null> {
  if (!url) return null
  return loadDrawableImage(canvas, url)
}

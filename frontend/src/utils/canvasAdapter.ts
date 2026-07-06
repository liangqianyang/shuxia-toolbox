/**
 * 平台差异集中封装：所有 #ifdef 条件编译只出现在这个文件里。
 * 注意 vue-tsc 会同时看到两个分支的代码，因此每个分支都必须能通过类型检查。
 */

export interface PixelBuffer {
  data: Uint8ClampedArray
  width: number
  height: number
}

export interface CanvasNode {
  canvas: any
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  dpr: number
}

export interface ElementRect {
  left: number
  top: number
  width: number
  height: number
}

/**
 * 在指定 canvas 上异步加载一张「可绘制图片」。
 * - MP：image 由目标 canvas.createImage() 创建，**绑定到该 canvas**，只能绘制在该 canvas 上
 *   （预览 canvas 与导出 canvas 各自的图必须分别加载）
 * - H5：普通 new Image()，可绘制到任意 canvas
 * 加载失败 / 空 src 一律解析为 null，调用方按「无配图」回退（画类型色块）。
 */
export function loadDrawableImage(canvas: any, src: string): Promise<CanvasImageSource | null> {
  if (!src) return Promise.resolve(null)
  // #ifdef MP-WEIXIN
  return new Promise((resolve) => {
    if (!canvas || typeof canvas.createImage !== 'function') {
      resolve(null)
      return
    }
    const img = canvas.createImage()
    img.onload = () => resolve(img as CanvasImageSource)
    img.onerror = () => resolve(null)
    img.src = src
  })
  // #endif

  // #ifdef H5
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
  // #endif
}

/** 选一张图，返回临时路径（H5 下是 blob/objectURL） */
export function chooseImage(): Promise<string> {
  return new Promise((resolve, reject) => {
    uni.chooseImage({
      count: 1,
      sizeType: ['original', 'compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const paths = res.tempFilePaths
        const path = Array.isArray(paths) ? paths[0] : paths
        if (path) {
          resolve(path)
        } else {
          reject(new Error('未选择图片'))
        }
      },
      fail: (err) => reject(new Error(err.errMsg ?? '选图失败')),
    })
  })
}

/**
 * 解码图片并取像素。超大图先等比缩到 maxDim 以内再 getImageData，控制内存峰值。
 * 这里的缩放只是粗缩（控制后续 box filter 的样本量），不影响最终采样质量。
 */
export function loadImagePixels(src: string, maxDim = 1200): Promise<PixelBuffer> {
  // #ifdef MP-WEIXIN
  return new Promise((resolve, reject) => {
    const canvas = wx.createOffscreenCanvas({ type: '2d', width: 1, height: 1 })
    const img = canvas.createImage()
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
      const w = Math.max(1, Math.round(img.width * scale))
      const h = Math.max(1, Math.round(img.height * scale))
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)
      const imageData = ctx.getImageData(0, 0, w, h)
      resolve({ data: imageData.data, width: w, height: h })
    }
    img.onerror = () => reject(new Error('图片解码失败'))
    img.src = src
  })
  // #endif

  // #ifdef H5
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
      const w = Math.max(1, Math.round(img.width * scale))
      const h = Math.max(1, Math.round(img.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Canvas 不可用'))
        return
      }
      ctx.drawImage(img, 0, 0, w, h)
      resolve({ data: ctx.getImageData(0, 0, w, h).data, width: w, height: h })
    }
    img.onerror = () => reject(new Error('图片解码失败'))
    img.src = src
  })
  // #endif
}

/** 取页面内 <canvas type="2d"> 节点（MP 必须传组件实例） */
export function getCanvasNode(selector: string, component?: unknown): Promise<CanvasNode> {
  // #ifdef MP-WEIXIN
  return new Promise((resolve, reject) => {
    const query = component
      ? uni.createSelectorQuery().in(component)
      : uni.createSelectorQuery()
    query
      .select(selector)
      .fields({ node: true, size: true }, () => {})
      .exec((res) => {
        const field = res?.[0]
        if (!field?.node) {
          reject(new Error(`找不到 canvas 节点 ${selector}`))
          return
        }
        const canvas = field.node
        const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
        resolve({
          canvas,
          ctx,
          width: field.width ?? 0,
          height: field.height ?? 0,
          dpr: uni.getSystemInfoSync().pixelRatio || 1,
        })
      })
  })
  // #endif

  // #ifdef H5
  return new Promise((resolve, reject) => {
    // uni-app H5 端 <canvas> 编译为 uni-canvas 包裹的原生 canvas
    const id = selector.replace(/^#/, '')
    const host = document.getElementById(id)
    const canvas =
      host instanceof HTMLCanvasElement ? host : host?.querySelector('canvas') ?? null
    if (!canvas) {
      reject(new Error(`找不到 canvas 节点 ${selector}`))
      return
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      reject(new Error('Canvas 2D 上下文不可用'))
      return
    }
    resolve({
      canvas,
      ctx,
      width: canvas.clientWidth,
      height: canvas.clientHeight,
      dpr: window.devicePixelRatio || 1,
    })
  })
  // #endif
}

export function getElementRect(selector: string, component?: unknown): Promise<ElementRect> {
  // #ifdef MP-WEIXIN
  return new Promise((resolve, reject) => {
    const query = component
      ? uni.createSelectorQuery().in(component)
      : uni.createSelectorQuery()
    query
      .select(selector)
      .boundingClientRect((rect) => {
        const item = Array.isArray(rect) ? rect[0] : rect
        if (!item) {
          reject(new Error(`找不到元素 ${selector}`))
          return
        }
        resolve({
          left: item.left ?? 0,
          top: item.top ?? 0,
          width: item.width ?? 0,
          height: item.height ?? 0,
        })
      })
      .exec()
  })
  // #endif

  // #ifdef H5
  return new Promise((resolve, reject) => {
    const el = document.querySelector(selector)
    if (!el) {
      reject(new Error(`找不到元素 ${selector}`))
      return
    }
    const rect = el.getBoundingClientRect()
    resolve({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    })
  })
  // #endif
}

/** 导出 canvas 为图片文件，1:1 像素输出 */
export function canvasToFile(canvas: any, width: number, height: number): Promise<string> {
  // #ifdef MP-WEIXIN
  return new Promise((resolve, reject) => {
    uni.canvasToTempFilePath({
      canvas,
      x: 0,
      y: 0,
      width,
      height,
      destWidth: width,
      destHeight: height,
      fileType: 'png',
      success: (res: { tempFilePath: string }) => resolve(res.tempFilePath),
      fail: (err: { errMsg?: string }) => reject(new Error(err.errMsg ?? '导出失败')),
    } as any)
  })
  // #endif

  // #ifdef H5
  return Promise.resolve((canvas as HTMLCanvasElement).toDataURL('image/png'))
  // #endif
}

/** 保存到相册。授权失败时抛出 errMsg 含 auth 字样的错误，由调用方引导去设置页 */
export function saveImageToAlbum(filePath: string): Promise<void> {
  // #ifdef MP-WEIXIN
  return new Promise((resolve, reject) => {
    uni.saveImageToPhotosAlbum({
      filePath,
      success: () => resolve(),
      fail: (err) => reject(new Error(err.errMsg ?? '保存失败')),
    })
  })
  // #endif

  // #ifdef H5
  return new Promise((resolve) => {
    const link = document.createElement('a')
    link.href = filePath
    link.download = `拼豆图纸-${Date.now()}.png`
    link.click()
    resolve()
  })
  // #endif
}

/** 打开小程序设置页（用于相册授权被拒后的引导） */
export function openAuthSetting(): void {
  // #ifdef MP-WEIXIN
  uni.openSetting({})
  // #endif
}

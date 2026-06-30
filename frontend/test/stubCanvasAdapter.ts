// 测试桩：替代 canvasAdapter，直接注入合成像素
export interface PixelBuffer {
  data: Uint8ClampedArray
  width: number
  height: number
}

let pixels: PixelBuffer | null = null

export function __setPixels(buf: PixelBuffer): void {
  pixels = buf
}

export function loadImagePixels(): Promise<PixelBuffer> {
  if (!pixels) throw new Error('test pixels not set')
  return Promise.resolve(pixels)
}

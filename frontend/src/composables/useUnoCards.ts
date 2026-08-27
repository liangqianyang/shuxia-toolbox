/** UNO 牌面图片仓库：模块级共享缓存（Q版渲染 → 临时图片），页面用 <image> 引用。 */

import { ref } from 'vue'
import { ALL_CARD_KEYS, unoCardImage } from '@/utils/unoCards'

const images = ref<Record<string, string>>({})

export function useUnoCards() {
  /** 确保某些牌面已渲染（异步填充，模板里用 images[key] 有值再显示）。 */
  function ensure(keys: string[]) {
    keys.forEach((key) => {
      if (images.value[key]) return
      void unoCardImage(key)
        .then((src) => {
          images.value = { ...images.value, [key]: src }
        })
        .catch(() => {})
    })
  }

  /** 进入牌桌时预渲染全部牌面；失败不阻塞（用到时会再试）。 */
  async function preload() {
    await Promise.allSettled(
      ALL_CARD_KEYS.map((key) =>
        unoCardImage(key).then((src) => {
          images.value = { ...images.value, [key]: src }
        }),
      ),
    )
  }

  return { images, ensure, preload }
}

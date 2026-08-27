import { ref } from 'vue'
import { fetchFeatures } from '@/services/toolbox'

/**
 * 全局 AI 功能开关（对应后端 feature.ai_enabled）。
 *
 * 默认值是关闭——拉取失败时也保持关闭，宁可隐藏入口（服务端同时硬拦截，双重保险）。
 * 各页面在 onShow/onLoad 里调 refreshFeatures() 拉最新值，运营台改完即时生效。
 */
const aiEnabled = ref(false)
const featuresReady = ref(false)

export function useFeatures() {
  async function refreshFeatures(): Promise<void> {
    try {
      const flags = await fetchFeatures()
      aiEnabled.value = flags.aiEnabled
    } catch {
      // 拉取失败保持现状；首次失败维持关闭（安全默认）。
    } finally {
      featuresReady.value = true
    }
  }

  return { aiEnabled, featuresReady, refreshFeatures }
}

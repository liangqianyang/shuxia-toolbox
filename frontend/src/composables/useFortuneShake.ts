/**
 * 摇签交互：监听手机加速计检测「摇一摇」，附带震动反馈。
 *
 * uni.onAccelerometerChange 在 H5 端不可用（无重力感应），因此页面必须同时提供
 * 长按签筒的备用触发；本 composable 的 start/stop 在不支持的环境里静默无效。
 */

/** 连续两次加速度变化的合矢量超过该值视为一次摇动（实测微信里 2.2 左右手感合适）。 */
const SHAKE_THRESHOLD = 2.2
/** 两次有效摇动的最小间隔，防止一次甩动触发多次。 */
const SHAKE_COOLDOWN_MS = 1500

export function useFortuneShake(onShake: () => void) {
  let last = { x: 0, y: 0, z: 0 }
  let lastShakeAt = 0
  let listening = false

  const handler = (res: { x: number; y: number; z: number }) => {
    const dx = res.x - last.x
    const dy = res.y - last.y
    const dz = res.z - last.z
    last = { x: res.x, y: res.y, z: res.z }
    if (Math.sqrt(dx * dx + dy * dy + dz * dz) < SHAKE_THRESHOLD) return
    const now = Date.now()
    if (now - lastShakeAt < SHAKE_COOLDOWN_MS) return
    lastShakeAt = now
    try {
      uni.vibrateShort({})
    } catch {}
    onShake()
  }

  function start(): void {
    if (listening) return
    try {
      uni.startAccelerometer({ interval: 'game' })
      uni.onAccelerometerChange(handler)
      listening = true
    } catch {
      // H5 等不支持的环境：静默，页面长按兜底。
    }
  }

  function stop(): void {
    if (!listening) return
    try {
      uni.offAccelerometerChange(handler)
      uni.stopAccelerometer({})
    } catch {}
    listening = false
  }

  return { start, stop }
}

<script setup lang="ts">
/** 旧路径兼容跳转页：枫趣冒险 已并入 pages-games 分包（含房间码参数透传）。 */
import { onLoad } from '@dcloudio/uni-app'

onLoad((query) => {
  const qs = query && Object.keys(query).length
    ? '?' + Object.entries(query).map(([k, v]) => `${k}=${v}`).join('&')
    : ''
  uni.redirectTo({ url: `/pages-games/adventure/index${qs}`, fail: () => {} })
})
</script>

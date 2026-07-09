<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app'
import { checkForUpdate } from '@/utils/updateManager'

onLaunch(() => {
  console.log('App launched')
  checkForUpdate()
})
</script>

<style lang="scss">
@import '@/styles/common.scss';
</style>

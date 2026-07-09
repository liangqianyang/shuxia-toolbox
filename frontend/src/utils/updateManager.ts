/**
 * 微信小程序版本更新检查。
 *
 * 微信在小程序发布新版本后,会在用户下次冷启动时下发新包。
 * getUpdateManager 负责拉取并下载新包,下载完成后弹窗引导用户重启应用,
 * 否则用户需等到下一次冷启动才会用上新版本。
 *
 * 仅在 MP-WEIXIN 端生效,其它端 (H5 等) 为空操作。
 * 开发者工具中测试:编译模式勾选「下次编译时模拟更新」。
 */
export function checkForUpdate(): void {
  // #ifdef MP-WEIXIN
  if (typeof uni.getUpdateManager !== 'function') return

  const updateManager = uni.getUpdateManager()

  updateManager.onUpdateReady(() => {
    uni.showModal({
      title: '更新提示',
      content: '新版本已经准备好,是否重启应用?',
      success: (res) => {
        if (res.confirm) {
          // 新版本已下载完成,应用并重启
          updateManager.applyUpdate()
        }
      },
    })
  })

  updateManager.onUpdateFailed(() => {
    uni.showModal({
      title: '更新提示',
      content: '新版本下载失败,请检查网络后删除小程序重新搜索打开',
      showCancel: false,
    })
  })
  // #endif
}

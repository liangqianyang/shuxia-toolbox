/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

/** 微信小程序原生 API，仅在 MP-WEIXIN 条件编译分支中使用 */
declare const wx: any

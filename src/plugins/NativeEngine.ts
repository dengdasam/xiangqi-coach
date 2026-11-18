import { registerPlugin } from '@capacitor/core'
import type { EngineConfig, SearchLimit } from '../engine/types'

/**
 * 原生引擎插件 —— 对应皮卡鱼 APK 里的 `native-engine` 自定义 Capacitor 插件。
 * 这里只声明 TypeScript 侧契约；Android 端实现见
 * android/app/src/main/java/com/xiangqicoach/app/NativeEnginePlugin.kt
 *
 * 运行时由 @capacitor/core 的 registerPlugin 生成代理：
 * - App 内：调用 Kotlin 插件 -> JNI -> libpikafish.so
 * - 浏览器内：调用 Web 实现（本文件下方）-> WASM / Mock
 */
export interface NativeEnginePlugin {
  init(options: EngineConfig): Promise<{ ok: boolean; version?: string }>
  isReady(): Promise<{ ready: boolean }>
  setPosition(options: { fen: string; moves?: string[] }): Promise<void>
  go(options: SearchLimit): Promise<void>
  stop(): Promise<void>
  quit(): Promise<void>
  addListener(eventName: 'info' | 'bestmove' | 'error', listenerFunc: (data: any) => void): Promise<{ remove: () => void }>
}

const NativeEngineProxy = registerPlugin<NativeEnginePlugin>('NativeEngine', {
  web: () => import('./NativeEngine.web').then((m) => new m.NativeEngineWeb())
})

export default NativeEngineProxy

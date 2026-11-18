import NativeEngine from '../plugins/NativeEngine'
import type {
  IEngine, EngineBackend, EngineConfig, SearchLimit, InfoFrame,
  SearchResult, EngineListener, EngineEventMap
} from './types'

/**
 * 引擎桥 —— 统一引擎接入层。
 *
 * 设计目标（对应架构文档的核心决策）：
 *   1. UI 层永远只依赖 IEngine，不知道底下是 JNI 还是 WASM 还是 Mock
 *   2. 平台差异被压进这一层，换引擎/换后端不动 UI
 *   3. info 流在这里做「只保留最后一帧」节流，避免高频消息冲垮主线程
 *
 * 后端选择策略：
 *   - App 内（Capacitor.isNativePlatform()）-> native（Kotlin 插件 -> JNI -> .so）
 *   - 浏览器 -> mock（开发）或 wasm（接入 WebAssembly 引擎后切换）
 */
export class EngineBridge implements IEngine {
  readonly backend: EngineBackend
  private plugin: IEngine
  private listeners: { [K in keyof EngineEventMap]: Set<EngineListener[K]> } = {
    ready: new Set(), info: new Set(), bestmove: new Set(), error: new Set()
  }
  private lastInfo: InfoFrame = {}
  private lastInfos: InfoFrame[] = []
  private subscriptions: Array<{ remove(): void }> = []

  constructor(backend?: EngineBackend) {
    this.backend = backend ?? 'native'
    // 目前 native 插件的 Web 实现就是 mock；接入 WASM 时在此分支替换
    const adapter = new NativeEngineAdapter()
    this.plugin = adapter
    adapter.bind(this)
  }

  async init(config?: EngineConfig) {
    await this.plugin.init(config ?? {
      enginePath: 'engine/pikafish',
      nnuePath: 'engine/pikafish.nnue',
      hash: 256,
      threads: 2
    })
    this.listeners.ready.forEach((cb) => (cb as (v: void) => void)(undefined))
  }

  async isReady() { return this.plugin.isReady() }
  async setPosition(fen: string, moves?: string[]) { return this.plugin.setPosition(fen, moves) }
  async go(limit: SearchLimit) {
    this.lastInfo = {}
    this.lastInfos = []
    return this.plugin.go(limit)
  }
  async stop() { return this.plugin.stop() }
  async quit() { return this.plugin.quit() }

  on<K extends keyof EngineEventMap>(event: K, cb: EngineListener[K]) {
    this.listeners[event].add(cb)
    return () => this.listeners[event].delete(cb)
  }

  /** 供插件反向调用：桥接层节流后分发 */
  _dispatch(event: 'info' | 'bestmove' | 'error', data: any) {
    if (event === 'info') {
      const frame = data as InfoFrame
      this.lastInfo = { ...this.lastInfo, ...frame }
      if (frame.multipv !== undefined) {
        this.lastInfos[frame.multipv - 1] = frame
      }
      this.listeners.info.forEach((cb) => (cb as (v: InfoFrame) => void)(this.lastInfo))
    } else if (event === 'bestmove') {
      const r = data as SearchResult
      const enriched: SearchResult = {
        ...r,
        info: r.info ?? this.lastInfo,
        infos: r.infos ?? this.lastInfos.filter(Boolean)
      }
      this.listeners.bestmove.forEach((cb) => (cb as (v: SearchResult) => void)(enriched))
    } else {
      this.listeners.error.forEach((cb) => (cb as (v: any) => void)(data))
    }
  }

  getLastInfo() { return this.lastInfo }
}

/** 把 Capacitor 插件适配成 IEngine（事件订阅 -> 统一回调） */
class NativeEngineAdapter implements IEngine {
  readonly backend: EngineBackend = 'native'
  private offs: Array<{ remove(): void }> = []
  private bridge: EngineBridge | null = null

  /** 由 EngineBridge 构造后注入，打通插件事件 -> bridge._dispatch */
  bind(bridge: EngineBridge) {
    this.bridge = bridge
    NativeEngine.addListener('info', (d) => bridge._dispatch('info', d)).then((h) => this.offs.push(h))
    NativeEngine.addListener('bestmove', (d) => bridge._dispatch('bestmove', d)).then((h) => this.offs.push(h))
    NativeEngine.addListener('error', (d) => bridge._dispatch('error', d)).then((h) => this.offs.push(h))
  }

  async init(config?: EngineConfig) {
    await NativeEngine.init(config ?? {})
  }
  async isReady() { return (await NativeEngine.isReady()).ready }
  async setPosition(fen: string, moves?: string[]) { return NativeEngine.setPosition({ fen, moves }) }
  async go(limit: SearchLimit) { return NativeEngine.go(limit) }
  async stop() { return NativeEngine.stop() }
  async quit() {
    this.offs.forEach((h) => h.remove())
    this.offs = []
    return NativeEngine.quit()
  }
  on<K extends keyof EngineEventMap>(_event: K, _cb: EngineListener[K]) {
    // 事件统一走 bind() 注入的 bridge，这里返回空清理函数
    return () => {}
  }
}

/** 工厂函数：创建并绑定好事件管道的引擎实例 */
export function createEngine(backend?: EngineBackend): EngineBridge {
  return new EngineBridge(backend)
}

export const engine = createEngine()

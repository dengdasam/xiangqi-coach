import NativeEngine from '../plugins/NativeEngine'
import { LocalEngine } from './LocalEngine'
import type {
  IEngine, EngineBackend, EngineConfig, SearchLimit, InfoFrame,
  SearchResult, EngineListener, EngineEventMap
} from './types'
import type { SearchOutput } from './search'

/**
 * 引擎桥 —— 统一引擎接入层，四后端可插拔：
 *   native : App 内，Kotlin 插件 -> JNI -> libpikafish.so（强棋力）
 *   wasm   : 网页体验版 Pikafish（预留）
 *   local  : 内置纯 JS 搜索（默认，零依赖，浏览器可跑）
 *   mock   : 极简占位（联调用）
 *
 * UI 只依赖本层导出的 engine 单例，永远不知道底下是哪一种。
 */
export class EngineBridge implements IEngine {
  readonly backend: EngineBackend
  private plugin: IEngine
  private local: LocalEngine | null = null
  private listeners: { [K in keyof EngineEventMap]: Set<EngineListener[K]> } = {
    ready: new Set(), info: new Set(), bestmove: new Set(), error: new Set()
  }
  private lastInfo: InfoFrame = {}

  constructor(backend?: EngineBackend) {
    // 默认策略：浏览器用 local（真能下棋），App 内用 native
    this.backend = backend ?? (typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.()
      ? 'native' : 'local')
    if (this.backend === 'local') {
      this.local = new LocalEngine()
      this.plugin = this.local
      this.bindEvents(this.local)
    } else {
      const adapter = new NativeEngineAdapter()
      this.plugin = adapter
      adapter.bind(this)
    }
  }

  private bindEvents(src: IEngine) {
    src.on('info', (f) => {
      this.lastInfo = { ...this.lastInfo, ...(f as InfoFrame) }
      this.listeners.info.forEach((cb) => (cb as (v: InfoFrame) => void)(this.lastInfo))
    })
    src.on('bestmove', (r) => {
      const result = r as SearchResult
      this.listeners.bestmove.forEach((cb) => (cb as (v: SearchResult) => void)(result))
    })
    src.on('error', (e) => {
      this.listeners.error.forEach((cb) => (cb as (v: any) => void)(e))
    })
  }

  async init(config?: EngineConfig) {
    await this.plugin.init(config ?? { hash: 256, threads: 2 })
    this.listeners.ready.forEach((cb) => (cb as (v: void) => void)(undefined))
  }
  async isReady() { return this.plugin.isReady() }
  async setPosition(fen: string, moves?: string[]) {
    this.lastInfo = {}
    return this.plugin.setPosition(fen, moves)
  }
  async go(limit: SearchLimit) { return this.plugin.go(limit) }
  async stop() { return this.plugin.stop() }
  async quit() { return this.plugin.quit() }

  /** 训练内核用：即时评估当前局面 */
  async analyse(depth = 3): Promise<SearchOutput | null> {
    return this.local?.analyse(depth) ?? null
  }
  /** 训练内核用：多候选（难度采样、解说） */
  async multiPv(depth = 3, count = 5): Promise<SearchOutput[]> {
    return this.local?.multiPv(depth, count) ?? []
  }

  on<K extends keyof EngineEventMap>(event: K, cb: EngineListener[K]) {
    this.listeners[event].add(cb)
    return () => this.listeners[event].delete(cb)
  }
  getLastInfo() { return this.lastInfo }

  /** 仅 NativeEngineAdapter 调用：把插件事件转进统一管道 */
  _dispatch(event: 'info' | 'bestmove' | 'error', data: any) {
    if (event === 'info') {
      this.lastInfo = { ...this.lastInfo, ...data }
      this.listeners.info.forEach((cb) => (cb as (v: InfoFrame) => void)(this.lastInfo))
    } else if (event === 'bestmove') {
      this.listeners.bestmove.forEach((cb) => (cb as (v: SearchResult) => void)(data))
    } else {
      this.listeners.error.forEach((cb) => (cb as (v: any) => void)(data))
    }
  }
}

/** Capacitor 插件适配成 IEngine */
class NativeEngineAdapter implements IEngine {
  readonly backend: EngineBackend = 'native'
  private offs: Array<{ remove(): void }> = []
  private bridge: EngineBridge | null = null

  bind(bridge: EngineBridge) {
    this.bridge = bridge
    NativeEngine.addListener('info', (d) => bridge._dispatch('info', d)).then((h) => this.offs.push(h))
    NativeEngine.addListener('bestmove', (d) => bridge._dispatch('bestmove', d)).then((h) => this.offs.push(h))
    NativeEngine.addListener('error', (d) => bridge._dispatch('error', d)).then((h) => this.offs.push(h))
  }
  async init(config?: EngineConfig) { await NativeEngine.init(config ?? {}) }
  async isReady() { return (await NativeEngine.isReady()).ready }
  async setPosition(fen: string, moves?: string[]) { return NativeEngine.setPosition({ fen, moves }) }
  async go(limit: SearchLimit) { return NativeEngine.go(limit) }
  async stop() { return NativeEngine.stop() }
  async quit() { this.offs.forEach((h) => h.remove()); this.offs = []; return NativeEngine.quit() }
  on<K extends keyof EngineEventMap>(_event: K, _cb: EngineListener[K]) { return () => {} }
}

export function createEngine(backend?: EngineBackend): EngineBridge {
  return new EngineBridge(backend)
}

/** 全局单例 */
export const engine = createEngine()

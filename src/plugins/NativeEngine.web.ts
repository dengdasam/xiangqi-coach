import type { NativeEnginePlugin } from './NativeEngine'
import type { EngineConfig, SearchLimit } from '../engine/types'

type Listener = (data: any) => void

/**
 * Web 端引擎插件实现（浏览器开发 / WASM 体验版入口）
 * 当前是占位：模拟 UCI 事件流，让 UI 能脱离原生完整跑通。
 * 接入 WASM 引擎时，把 go() 内部替换为 worker 调用即可，对外契约不变。
 */
export class NativeEngineWeb implements NativeEnginePlugin {
  private listeners: Record<string, Listener[]> = {}
  private timer: number | null = null
  private ready = false

  async init(_options: EngineConfig) {
    this.ready = true
    return { ok: true, version: 'web-mock-0.1' }
  }

  async isReady() {
    return { ready: this.ready }
  }

  async setPosition(_options: { fen: string; moves?: string[] }) {
    // WASM 版在此调用 worker.postMessage({ cmd: 'position', ... })
  }

  async go(options: SearchLimit) {
    this.emit('info', { depth: 1, scoreCp: 12, pv: ['h2e2', 'h9e8'], nps: 100000 })
    const depth = options.depth ?? 12
    this.timer = window.setTimeout(() => {
      this.emit('info', { depth, scoreCp: 35, pv: ['h2e2', 'h9e8', 'e2e6'], nps: 320000 })
      this.emit('bestmove', { bestmove: 'h2e2', ponder: 'h9e8', info: { depth, scoreCp: 35, pv: ['h2e2', 'h9e8', 'e2e6'] } })
      this.timer = null
    }, 400)
  }

  async stop() {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  async quit() {
    await this.stop()
    this.ready = false
  }

  async addListener(eventName: 'info' | 'bestmove' | 'error', cb: Listener) {
    ;(this.listeners[eventName] ||= []).push(cb)
    return { remove: () => { this.listeners[eventName] = (this.listeners[eventName] || []).filter((f) => f !== cb) } }
  }

  private emit(eventName: string, data: any) {
    ;(this.listeners[eventName] || []).forEach((cb) => cb(data))
  }
}

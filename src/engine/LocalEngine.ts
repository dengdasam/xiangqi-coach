/**
 * 内置搜索引擎适配器 —— 把纯 JS 搜索包装成 IEngine，跑在 Web Worker 里。
 * 浏览器端零依赖、零下载即可真正对弈与评估，不阻塞主线程。
 */
import type { IEngine, EngineBackend, EngineConfig, SearchLimit, InfoFrame, SearchResult, EngineListener, EngineEventMap } from './types'
import type { SearchOutput } from './search'

export class LocalEngine implements IEngine {
  readonly backend: EngineBackend = 'local'
  private worker: Worker | null = null
  private listeners: { [K in keyof EngineEventMap]: Set<EngineListener[K]> } = {
    ready: new Set(), info: new Set(), bestmove: new Set(), error: new Set()
  }
  private pendingAnalyse = new Map<number, (r: SearchOutput) => void>()
  private pendingMulti = new Map<number, (r: SearchOutput[]) => void>()
  private seq = 0
  private fen = ''
  private moves: string[] = []
  private lastLimit: SearchLimit = { depth: 4 }

  async init(_config?: EngineConfig) {
    if (this.worker) return
    this.worker = new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' })
    this.worker.onmessage = (e: MessageEvent<any>) => {
      const { type, data, id } = e.data
      if (type === 'result') {
        const out = data as SearchOutput
        const info: InfoFrame = { depth: out.depth, scoreCp: out.scoreCp, pv: out.pv, nps: out.nps }
        this.listeners.info.forEach((cb) => (cb as (v: InfoFrame) => void)(info))
        const result: SearchResult = { bestmove: out.bestmove, info, infos: [info] }
        this.listeners.bestmove.forEach((cb) => (cb as (v: SearchResult) => void)(result))
        const resolve = this.pendingAnalyse.get(id)
        if (resolve) { resolve(out); this.pendingAnalyse.delete(id) }
      } else if (type === 'multipv') {
        const resolve = this.pendingMulti.get(id)
        if (resolve) { resolve(data as SearchOutput[]); this.pendingMulti.delete(id) }
      }
    }
    this.worker.onerror = (e) => {
      this.listeners.error.forEach((cb) => (cb as (v: any) => void)({ message: String(e.message) }))
    }
    this.listeners.ready.forEach((cb) => (cb as (v: void) => void)(undefined))
  }

  async isReady() { return this.worker !== null }
  async setPosition(fen: string, moves?: string[]) {
    this.fen = fen; this.moves = moves ?? []
    this.worker?.postMessage({ type: 'position', fen, moves: this.moves })
  }

  async go(limit: SearchLimit) {
    this.lastLimit = limit
    this.worker?.postMessage({ type: 'search', limit, id: ++this.seq })
  }

  /** 即时评分（供逐手 cp loss 分析用） */
  analyse(depth = 3): Promise<SearchOutput> {
    return new Promise((resolve, reject) => {
      if (!this.worker) return reject(new Error('engine not ready'))
      const id = ++this.seq
      this.pendingAnalyse.set(id, resolve)
      this.worker.postMessage({ type: 'analyse', fen: this.fen, moves: this.moves, depth, id })
    })
  }

  /** 多候选（供难度采样与解说） */
  multiPv(depth = 3, count = 5): Promise<SearchOutput[]> {
    return new Promise((resolve, reject) => {
      if (!this.worker) return reject(new Error('engine not ready'))
      const id = ++this.seq
      this.pendingMulti.set(id, resolve)
      this.worker.postMessage({ type: 'multipv', fen: this.fen, moves: this.moves, depth, count, id })
    })
  }

  async stop() { /* 搜索短，预留中断位 */ }
  async quit() { this.worker?.terminate(); this.worker = null }

  on<K extends keyof EngineEventMap>(event: K, cb: EngineListener[K]) {
    this.listeners[event].add(cb)
    return () => this.listeners[event].delete(cb)
  }
}

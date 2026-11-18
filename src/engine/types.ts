/**
 * 引擎协议类型
 * 与 Pikafish UCI 对齐：uci / isready / position / go / stop / info / bestmove
 * Web 与 Native 两端共用同一套类型，桥接层负责序列化差异。
 */

export type EngineBackend = 'native' | 'wasm' | 'local' | 'mock'

export interface EngineConfig {
  /** 引擎可执行文件/资源路径 */
  enginePath?: string
  /** NNUE 权重路径 */
  nnuePath?: string
  /** 哈希内存 MB */
  hash?: number
  /** 线程数 */
  threads?: number
}

export interface SearchLimit {
  depth?: number
  movetime?: number
  nodes?: number
  /** MultiPV：一次返回多条候选，用于档位强度调节与解说 */
  multipv?: number
}

/** info 流的一帧（引擎每秒可能推几十帧，UI 只取最后一帧） */
export interface InfoFrame {
  depth?: number
  scoreCp?: number
  scoreMate?: number
  pv?: string[]
  nodes?: number
  nps?: number
  multipv?: number
}

export interface SearchResult {
  bestmove: string
  ponder?: string
  /** 最后一帧评估信息 */
  info?: InfoFrame
  /** 全部候选（multipv > 1 时） */
  infos?: InfoFrame[]
}

export type EngineEventMap = {
  ready: void
  info: InfoFrame
  bestmove: SearchResult
  error: { message: string }
}

/** 引擎事件回调（替代 UCI 的 stdout 文本流） */
export type EngineListener = {
  [K in keyof EngineEventMap]: (payload: EngineEventMap[K]) => void
}

export interface IEngine {
  readonly backend: EngineBackend
  init(config?: EngineConfig): Promise<void>
  isReady(): Promise<boolean>
  /** FEN 字符串 + 后续着法（UCI 格式，如 "h2e2"） */
  setPosition(fen: string, moves?: string[]): Promise<void>
  go(limit: SearchLimit): Promise<void>
  stop(): Promise<void>
  on<K extends keyof EngineEventMap>(event: K, cb: EngineListener[K]): () => void
  quit(): Promise<void>
}

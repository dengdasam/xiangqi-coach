/// <reference lib="webworker" />
/**
 * 搜索 Worker：把 CPU 密集的搜索移出主线程。
 * 接收 position（fen+moves）与 limit，返回 SearchOutput。
 */
import { search, searchMultiPv, type SearchOutput } from './search'

let fen = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1'
let moves: string[] = []

self.onmessage = (e: MessageEvent<any>) => {
  const msg = e.data
  if (msg.type === 'position') {
    fen = msg.fen
    moves = msg.moves ?? []
  } else if (msg.type === 'search' || msg.type === 'analyse') {
    const limit = msg.limit ?? { depth: msg.depth ?? 4, movetime: 800 }
    const out: SearchOutput = search(fen, moves, limit)
    ;(self as unknown as Worker).postMessage({ type: 'result', data: out, id: msg.id })
  } else if (msg.type === 'multipv') {
    const outs = searchMultiPv(fen, moves, msg.depth ?? 3, msg.count ?? 5)
    ;(self as unknown as Worker).postMessage({ type: 'multipv', data: outs, id: msg.id })
  }
}

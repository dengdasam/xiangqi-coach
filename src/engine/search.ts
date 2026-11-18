/**
 * 内置象棋搜索引擎 —— 纯 JS，无外部依赖，浏览器 Worker 内运行。
 * 这是"引擎落地"的核心：让框架不接任何外部引擎也能真正下棋、给出评分与 PV。
 *
 * 算法：negamax + alpha-beta 剪枝 + 迭代加深 + 置换表 + MVV-LVA 着法排序 + 静态搜索。
 * 棋力有限（约业余入门），定位是"能跑通全链路 + 可离线演示"；
 * 需要强棋力时，通过 EngineBridge 切换到 Pikafish（WASM/原生）。
 */
import {
  type Board, INITIAL_FEN, parseFen, applyMove, generateLegalMoves,
  inCheck, idx, rowOf, colOf
} from '../chess/rules'
import { evaluate, PIECE_VALUE } from '../chess/evaluation'

export interface SearchOptions {
  depth?: number
  movetime?: number
  multipv?: number
}

export interface SearchOutput {
  bestmove: string
  scoreCp: number
  depth: number
  pv: string[]
  multipv?: number
  nodes: number
  nps: number
}

const MATE = 100000

// ---- 坐标 <-> UCI ----
export function squareName(i: number): string {
  return 'abcdefghi'[colOf(i)] + (9 - rowOf(i))
}
function squareIndex(s: string): number {
  const col = 'abcdefghi'.indexOf(s[0])
  return (9 - Number(s[1])) * 9 + col
}
export function moveToUci(from: number, to: number) {
  return squareName(from) + squareName(to)
}

// ---- 置换表 ----
interface TTEntry { depth: number; score: number; flag: 'exact' | 'lower' | 'upper'; move: number }
const tt = new Map<string, TTEntry>()
let nodes = 0
let stopped = false

function keyOf(board: Board, red: boolean) {
  return (red ? 'w' : 'b') + board.join('')
}

/** MVV-LVA：吃子着法优先搜索，被吃子价值高、吃子方价值低的排前面 */
function orderMoves(board: Board, moves: Array<{ from: number; to: number }>, ttMove: number): number[] {
  return moves.map((m, i) => {
    let s = 0
    if (m.to === ttMove) s += 1_000_000
    const victim = board[m.to]
    const attacker = board[m.from]
    if (victim !== '.') s += 10_000 + PIECE_VALUE[victim] * 10 - PIECE_VALUE[attacker]
    return { i, s }
  }).sort((a, b) => b.s - a.s).map((x) => x.i)
}

/** 静态搜索：只搜吃子，缓解地平线效应 */
function qsearch(board: Board, red: boolean, alpha: number, beta: number, qdepth: number): number {
  nodes++
  if ((nodes & 2047) === 0 && Date.now() > deadline) { stopped = true; return 0 }
  const stand = red ? evaluate(board) : -evaluate(board)
  if (qdepth <= 0) return stand
  if (stand >= beta) return beta
  if (stand > alpha) alpha = stand
  const moves = generateLegalMoves(board, red)
  const captures = moves.filter((m) => board[m.to] !== '.')
  const order = orderMoves(board, captures, -1)
  for (const mi of order) {
    const m = captures[mi]
    const score = -qsearch(applyMove(board, m.from, m.to), !red, -beta, -alpha, qdepth - 1)
    if (stopped) return 0
    if (score >= beta) return beta
    if (score > alpha) alpha = score
  }
  return alpha
}

let deadline = 0

/** negamax 主搜索，返回当前方视角分数 */
function negamax(board: Board, red: boolean, depth: number, alpha: number, beta: number, ply: number): number {
  nodes++
  if ((nodes & 2047) === 0 && Date.now() > deadline) { stopped = true; return 0 }
  if (depth <= 0) return qsearch(board, red, alpha, beta, 4)

  const key = keyOf(board, red)
  const entry = tt.get(key)
  let ttMove = -1
  if (entry && entry.depth >= depth) {
    ttMove = entry.move
    if (entry.flag === 'exact') return entry.score
    if (entry.flag === 'lower' && entry.score >= beta) return entry.score
    if (entry.flag === 'upper' && entry.score <= alpha) return entry.score
  }

  const moves = generateLegalMoves(board, red)
  if (moves.length === 0) {
    return inCheck(board, red) ? -MATE + ply : 0 // 将死 / 困毙
  }
  const order = orderMoves(board, moves, ttMove)
  let best = -Infinity, bestMove = -1
  const origAlpha = alpha

  for (const mi of order) {
    const m = moves[mi]
    const score = -negamax(applyMove(board, m.from, m.to), !red, depth - 1, -beta, -alpha, ply + 1)
    if (stopped) return 0
    if (score > best) { best = score; bestMove = m.to }
    if (score > alpha) alpha = score
    if (alpha >= beta) break
  }
  tt.set(key, {
    depth,
    score: best,
    flag: best <= origAlpha ? 'upper' : best >= beta ? 'lower' : 'exact',
    move: bestMove
  })
  return best
}

/** 抽取主变例（沿置换表走） */
function extractPv(board: Board, red: boolean, maxLen: number): string[] {
  const pv: string[] = []
  let b = board, side = red
  for (let i = 0; i < maxLen; i++) {
    const e = tt.get(keyOf(b, side))
    if (!e || e.move < 0) break
    // 找到 from：通过上一层记录的 move(to) 反查不现实，改为在合法着法中找 to 相等者
    const moves = generateLegalMoves(b, side)
    const m = moves.find((x) => x.to === e.move)
    if (!m) break
    pv.push(moveToUci(m.from, m.to))
    b = applyMove(b, m.from, m.to)
    side = !side
  }
  return pv
}

/** 执行一次完整搜索（迭代加深） */
export function search(fen: string, movesUci: string[], options: SearchOptions): SearchOutput {
  const parsed = parseFen(fen)
  let board = parsed.board
  let red = parsed.redToMove
  // 重放已走着法
  for (const u of movesUci) {
    const from = squareIndex(u.slice(0, 2)), to = squareIndex(u.slice(2, 4))
    board = applyMove(board, from, to)
    red = !red
  }

  nodes = 0
  stopped = false
  tt.clear()
  const maxDepth = Math.max(1, Math.min(options.depth ?? 6, 8))
  const started = Date.now()
  deadline = started + (options.movetime ?? 1000)

  let best = { move: '', score: 0, depth: 0, pv: [] as string[] }
  for (let d = 1; d <= maxDepth; d++) {
    const score = negamax(board, red, d, -Infinity, Infinity, 0)
    if (stopped) break
    const pv = extractPv(board, red, d)
    if (pv.length) best = { move: pv[0], score, depth: d, pv }
  }

  // 兜底：若置换表没抽出着法，取第一个合法着法
  if (!best.move) {
    const legal = generateLegalMoves(board, red)
    if (legal.length) best = { move: moveToUci(legal[0].from, legal[0].to), score: evaluate(board), depth: 1, pv: [] }
  }

  // 分数是"当前方视角"，转成红方视角
  const scoreRed = red ? best.score : -best.score
  const elapsed = Math.max(1, Date.now() - started)
  return {
    bestmove: best.move,
    scoreCp: scoreRed,
    depth: best.depth,
    pv: best.pv,
    nodes,
    nps: Math.round(nodes / (elapsed / 1000)),
    multipv: options.multipv ?? 1
  }
}

/**
 * 多候选搜索：用于对练难度（温度采样）与解说。
 * 在根层对每个合法着法单独评估，返回按分数排序的候选列表。
 */
export function searchMultiPv(fen: string, movesUci: string[], depth: number, count: number): SearchOutput[] {
  const parsed = parseFen(fen)
  let board = parsed.board
  let red = parsed.redToMove
  for (const u of movesUci) {
    board = applyMove(board, squareIndex(u.slice(0, 2)), squareIndex(u.slice(2, 4)))
    red = !red
  }
  const legal = generateLegalMoves(board, red)
  const scored = legal.map((m) => {
    const next = applyMove(board, m.from, m.to)
    // 对手视角搜索，取负得到当前方视角
    const s = -negamax(next, !red, Math.max(1, depth - 1), -Infinity, Infinity, 1)
    return { uci: moveToUci(m.from, m.to), score: s }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, count).map((x) => ({
    bestmove: x.uci,
    scoreCp: red ? x.score : -x.score,
    depth,
    pv: [x.uci],
    nodes,
    nps: 0,
    multipv: count
  }))
}

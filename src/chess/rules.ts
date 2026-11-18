/**
 * 中国象棋规则引擎（前端自研，纯 TS，无依赖）
 * 对应设计文档决策：自研规则 + perft 回归验证，不用国际象棋库。
 *
 * 棋盘表示：90 长度一维数组，索引 = row * 9 + col
 *   row 0 在黑方底线，row 9 在红方底线；col 0 在黑方右侧（红方视角的左边）
 * 棋子用单字符：红大写 KARBNCP，黑小写 karnbcp
 *   K 帅/将 A 仕/士 B 相/象 N 马 R 车 C 炮 P 兵/卒
 *   '.' 表示空格
 */

export type Piece = string
export type Board = Piece[]

export const COLS = 9
export const ROWS = 10

export const INITIAL_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1'

export function idx(row: number, col: number) { return row * COLS + col }
export function rowOf(i: number) { return Math.floor(i / COLS) }
export function colOf(i: number) { return i % COLS }
export function isRed(p: Piece) { return p >= 'A' && p <= 'Z' }
export function isBlack(p: Piece) { return p >= 'a' && p <= 'z' }
export function sameSide(a: Piece, b: Piece) {
  return a !== '.' && b !== '.' && isRed(a) === isRed(b)
}
export function inBoard(r: number, c: number) { return r >= 0 && r < ROWS && c >= 0 && c < COLS }

/** FEN -> Board + 轮走方 */
export function parseFen(fen: string): { board: Board; redToMove: boolean } {
  const board: Board = new Array(90).fill('.')
  const [placement, side] = fen.split(' ')
  const rows = placement.split('/')
  rows.forEach((rowStr, r) => {
    let c = 0
    for (const ch of rowStr) {
      if (ch >= '1' && ch <= '9') { c += Number(ch) }
      else { board[idx(r, c)] = ch; c++ }
    }
  })
  return { board, redToMove: side !== 'b' }
}

/** Board -> FEN 的摆放部分 */
export function toFen(board: Board, redToMove = true): string {
  const rows: string[] = []
  for (let r = 0; r < ROWS; r++) {
    let s = '', empty = 0
    for (let c = 0; c < COLS; c++) {
      const p = board[idx(r, c)]
      if (p === '.') { empty++ }
      else { if (empty) { s += empty; empty = 0 } s += p }
    }
    if (empty) s += empty
    rows.push(s)
  }
  return rows.join('/') + (redToMove ? ' w' : ' b') + ' - - 0 1'
}

/** 将/帅的位置 */
function findKing(board: Board, red: boolean): number {
  const target = red ? 'K' : 'k'
  return board.indexOf(target)
}

/** 某格是否被指定方攻击（用于自杀着法判定） */
function isAttacked(board: Board, pos: number, byRed: boolean): boolean {
  const r = rowOf(pos), c = colOf(pos)
  const mine = (p: Piece) => p !== '.' && (byRed ? isRed(p) : isBlack(p))

  // 车 / 炮：沿四方向。车无遮挡命中；炮隔恰好一子命中。
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    let rr = r + dr, cc = c + dc, screen = 0
    while (inBoard(rr, cc)) {
      const p = board[idx(rr, cc)]
      if (p !== '.') {
        const t = p.toLowerCase()
        if (screen === 0) {
          if (mine(p) && t === 'r') return true      // 车：第一个子即是
          screen = 1                                  // 否则作为炮架
        } else {
          if (mine(p) && t === 'c') return true      // 炮：隔一子后的第一个子
          break
        }
      }
      rr += dr; cc += dc
    }
  }
  // 马：判断马是否能吃到此格，需检查马腿
  for (const [dr, dc, br, bc] of [[-2,-1,-1,0],[-2,1,-1,0],[-1,-2,0,-1],[-1,2,0,1],[1,-2,0,-1],[1,2,0,1],[2,-1,1,0],[2,1,1,0]]) {
    const rr = r + dr, cc = c + dc
    if (!inBoard(rr, cc)) continue
    const p = board[idx(rr, cc)]
    if (mine(p) && p.toLowerCase() === 'n' && board[idx(r + br, c + bc)] === '.') return true
  }
  // 兵卒：只能向前 + 过河后可横走。红兵向 row 减小方向前进。
  const fwd = byRed ? -1 : 1
  const crossed = byRed ? r <= 4 : r >= 5   // 该格在对方半场，则过河兵可在此横吃
  const pawnCells = [
    { r: r + fwd, c, valid: true },
    { r, c: c - 1, valid: crossed },
    { r, c: c + 1, valid: crossed }
  ]
  for (const cell of pawnCells) {
    if (!cell.valid || !inBoard(cell.r, cell.c)) continue
    const p = board[idx(cell.r, cell.c)]
    if (mine(p) && p.toLowerCase() === 'p') return true
  }
  // 将（帅）照面：同一列且中间无子（走法层面会产生，必须判）
  const oppKing = findKing(board, byRed)
  if (oppKing >= 0 && colOf(oppKing) === c) {
    const step = rowOf(oppKing) > r ? 1 : -1
    let rr = r + step, clear = true
    while (rr !== rowOf(oppKing)) {
      if (board[idx(rr, c)] !== '.') { clear = false; break }
      rr += step
    }
    if (clear) return true
  }
  return false
}

/** 将帅是否照面 */
function kingsFacing(board: Board): boolean {
  const kr = findKing(board, true), kb = findKing(board, false)
  if (kr < 0 || kb < 0) return false
  if (colOf(kr) !== colOf(kb)) return false
  const step = rowOf(kr) > rowOf(kb) ? 1 : -1
  let rr = rowOf(kb) + step
  while (rr !== rowOf(kr)) {
    if (board[idx(rr, colOf(kr))] !== '.') return false
    rr += step
  }
  return true
}

/** 生成某格棋子的伪合法着法（未过滤自杀） */
function pseudoMoves(board: Board, from: number): number[] {
  const p = board[from]
  if (p === '.') return []
  const red = isRed(p), t = p.toLowerCase()
  const r = rowOf(from), c = colOf(from)
  const out: number[] = []
  const push = (rr: number, cc: number) => {
    if (!inBoard(rr, cc)) return false
    const to = idx(rr, cc)
    if (sameSide(p, board[to])) return false
    out.push(to)
    return board[to] === '.'
  }
  const slide = (steps: [number, number][]) => {
    for (const [dr, dc] of steps) {
      let rr = r + dr, cc = c + dc
      while (inBoard(rr, cc)) {
        if (!push(rr, cc)) break
        rr += dr; cc += dc
      }
    }
  }

  if (t === 'r') {
    slide([[-1,0],[1,0],[0,-1],[0,1]])
  } else if (t === 'c') {
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      let rr = r + dr, cc = c + dc, hasScreen = false
      while (inBoard(rr, cc)) {
        const to = idx(rr, cc)
        if (!hasScreen) {
          if (board[to] === '.') { out.push(to) }
          else { hasScreen = true }
        } else {
          if (board[to] !== '.') {
            if (!sameSide(p, board[to])) out.push(to)
            break
          }
        }
        rr += dr; cc += dc
      }
    }
  } else if (t === 'n') {
    // 马腿 = 直走一格的位置：纵走两格 -> (dr/2, 0)；横走两格 -> (0, dc/2)
    for (const [dr, dc, br, bc] of [[-2,-1,-1,0],[-2,1,-1,0],[-1,-2,0,-1],[-1,2,0,1],[1,-2,0,-1],[1,2,0,1],[2,-1,1,0],[2,1,1,0]]) {
      if (board[idx(r + br, c + bc)] !== '.') continue
      push(r + dr, c + dc)
    }
  } else if (t === 'p') {
    const forward = red ? -1 : 1
    push(r + forward, c)
    const crossed = red ? r <= 4 : r >= 5
    if (crossed) { push(r, c - 1); push(r, c + 1) }
  } else if (t === 'k' || t === 'a') {
    const steps = t === 'a' ? [[-1,-1],[-1,1],[1,-1],[1,1]] : [[-1,0],[1,0],[0,-1],[0,1]]
    for (const [dr, dc] of steps) {
      const rr = r + dr, cc = c + dc
      if (!inBoard(rr, cc)) continue
      // 九宫限制：col 3..5，红 row 7..9，黑 row 0..2
      if (cc < 3 || cc > 5) continue
      if (red ? (rr < 7 || rr > 9) : (rr < 0 || rr > 2)) continue
      push(rr, cc)
    }
  } else if (t === 'b') {
    for (const [dr, dc] of [[-2,-2],[-2,2],[2,-2],[2,2]]) {
      const rr = r + dr, cc = c + dc
      if (!inBoard(rr, cc)) continue
      if (red ? rr < 5 : rr > 4) continue // 象不过河
      if (board[idx(r + dr / 2, c + dc / 2)] !== '.') continue // 塞象眼
      push(rr, cc)
    }
  }
  return out
}

/** 应用一步着法，返回新棋盘（不改原棋盘） */
export function applyMove(board: Board, from: number, to: number): Board {
  const next = board.slice()
  next[to] = next[from]
  next[from] = '.'
  return next
}

/** 判断某方是否正在被将军 */
export function inCheck(board: Board, red: boolean): boolean {
  const king = findKing(board, red)
  if (king < 0) return false
  return isAttacked(board, king, !red)
}

/** 将/帅格位（供评估与 UI 使用） */
export function kingSquare(board: Board, red: boolean): number {
  return findKing(board, red)
}

/** 生成全部合法着法（过滤送将、将帅照面） */
export function generateLegalMoves(board: Board, redToMove: boolean): Array<{ from: number; to: number }> {
  const moves: Array<{ from: number; to: number }> = []
  for (let i = 0; i < 90; i++) {
    const p = board[i]
    if (p === '.') continue
    if (redToMove ? !isRed(p) : !isBlack(p)) continue
    for (const to of pseudoMoves(board, i)) {
      const next = applyMove(board, i, to)
      if (kingsFacing(next)) continue
      if (inCheck(next, redToMove)) continue
      moves.push({ from: i, to })
    }
  }
  return moves
}

/** 某格的合法落点（UI 点选用） */
export function legalTargets(board: Board, from: number): number[] {
  const p = board[from]
  if (p === '.') return []
  const red = isRed(p)
  return generateLegalMoves(board, red).filter((m) => m.from === from).map((m) => m.to)
}

/** perft 递归计数 —— 规则回归测试的基准 */
export function perft(board: Board, redToMove: boolean, depth: number): number {
  if (depth === 0) return 1
  const moves = generateLegalMoves(board, redToMove)
  if (depth === 1) return moves.length
  let nodes = 0
  for (const m of moves) {
    nodes += perft(applyMove(board, m.from, m.to), !redToMove, depth - 1)
  }
  return nodes
}

/** perft 自检：开局层数基准（象棋公认值） */
export const PERFT_BASELINE: Record<number, number> = {
  1: 44, 2: 1920, 3: 79666, 4: 3290240
}

export function runPerftSelfTest(): Array<{ depth: number; got: number; expected: number; ok: boolean }> {
  const { board } = parseFen(INITIAL_FEN)
  return [1, 2, 3].map((depth) => {
    const got = perft(board, true, depth)
    return { depth, got, expected: PERFT_BASELINE[depth], ok: got === PERFT_BASELINE[depth] }
  })
}

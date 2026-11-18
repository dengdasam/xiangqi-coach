/**
 * 局面评估函数（纯 JS，供内置搜索与训练内核共用）
 * 返回红方视角分数（正=红优），单位 cp。子力基准参考 Xiangqi 常见值。
 */
import { type Board, isRed, rowOf, colOf, idx } from './rules'

export const PIECE_VALUE: Record<string, number> = {
  K: 10000, R: 600, C: 300, N: 270, A: 120, B: 120, P: 30,
  k: 10000, r: 600, c: 300, n: 270, a: 120, b: 120, p: 30
}

/** 兵/卒位置加成：越靠近对方底线越高，过河后开始计 */
function pawnBonus(p: string, row: number): number {
  if (p === 'P') { // 红兵向 row 减小方向前进，过河后 row<=4
    if (row > 4) return 0
    return (5 - row) * 12
  }
  if (p === 'p') { // 黑卒向 row 增大方向前进，过河后 row>=5
    if (row < 5) return 0
    return (row - 4) * 12
  }
  return 0
}

/** 马/炮的中心倾向：靠近中线加分 */
function centerBonus(p: string, col: number): number {
  const t = p.toLowerCase()
  if (t === 'n' || t === 'c') return (4 - Math.abs(4 - col)) * 4
  return 0
}

/** 评估局面，红方视角 cp */
export function evaluate(board: Board): number {
  let score = 0
  for (let i = 0; i < 90; i++) {
    const p = board[i]
    if (p === '.') continue
    const row = rowOf(i), col = colOf(i)
    const val = PIECE_VALUE[p] + pawnBonus(p, row) + centerBonus(p, col)
    score += isRed(p) ? val : -val
  }
  return score
}

/** 某方是否被将死/困毙（无合法着法） */
export function isTerminal(board: Board, redToMove: boolean, legalCount: number, inCheckNow: boolean) {
  if (legalCount > 0) return null
  return inCheckNow ? (redToMove ? 'black_win' : 'red_win') : 'draw'
}

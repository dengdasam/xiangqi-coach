/**
 * 逐手评分器 —— cp loss 口径。
 * 失分 = 引擎首选分 − 实际走法分（都换算到走子方视角）。
 * 分档沿用国际象棋社区口径：优秀/良好/不精确/失误/严重失误。
 */
import type { SearchOutput } from '../engine/search'

export type Grade = 'brilliant' | 'good' | 'inaccuracy' | 'mistake' | 'blunder'

export interface MoveGrade {
  grade: Grade
  label: string
  cpLoss: number
  best: string
  played: string
  scoreBefore: number   // 走子方视角，走前
  scoreAfter: number    // 走子方视角，走后
}

const THRESHOLDS: Array<{ max: number; grade: Grade; label: string }> = [
  { max: 20, grade: 'good', label: '优秀' },
  { max: 50, grade: 'good', label: '良好' },
  { max: 100, grade: 'inaccuracy', label: '不精确' },
  { max: 250, grade: 'mistake', label: '失误' },
  { max: Infinity, grade: 'blunder', label: '严重失误' }
]

export function gradeMove(
  played: string,
  best: SearchOutput | null,
  playedScoreForMover: number,
  moverIsRed: boolean
): MoveGrade {
  if (!best) {
    return { grade: 'good', label: '未知', cpLoss: 0, best: '', played, scoreBefore: 0, scoreAfter: playedScoreForMover }
  }
  // best.scoreCp 是红方视角；转成走子方视角
  const bestForMover = moverIsRed ? best.scoreCp : -best.scoreCp
  const cpLoss = Math.max(0, bestForMover - playedScoreForMover)
  const bucket = THRESHOLDS.find((t) => cpLoss < t.max) ?? THRESHOLDS[THRESHOLDS.length - 1]
  return {
    grade: bucket.grade,
    label: bucket.label,
    cpLoss: Math.round(cpLoss),
    best: best.bestmove,
    played,
    scoreBefore: bestForMover,
    scoreAfter: playedScoreForMover
  }
}

/** cp -> 胜率（sigmoid，系数仅演示，产品方案注明需实战校准） */
export function cpToWinRate(cp: number, k = 0.0025): number {
  return 1 / (1 + Math.exp(-k * cp))
}

/** 一批着法的统计摘要（供能力画像） */
export function summarizeGrades(grades: MoveGrade[]) {
  const counts: Record<Grade, number> = { brilliant: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 }
  let totalLoss = 0
  for (const g of grades) { counts[g.grade]++; totalLoss += g.cpLoss }
  const n = grades.length || 1
  return {
    counts,
    avgLoss: Math.round(totalLoss / n),
    accuracy: Math.round((1 - totalLoss / (n * 300)) * 1000) / 10, // 粗略准确率百分比
    blunderRate: counts.blunder / n
  }
}

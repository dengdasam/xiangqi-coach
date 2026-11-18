/**
 * 能力画像 —— 五个可计算维度，归一到 0~100。
 * 来自产品方案 v0.2：战术嗅觉 / 残局功力 / 防守能力 / 开局掌握 / 时间管理。
 * "防守能力"是差异化项：局面评分低于 -100 时的平均 cp loss。
 */
import type { MoveGrade } from './grader'

export interface ProfileSample {
  grade: MoveGrade
  /** 走子方视角的局面分（走之前） */
  scoreForMover: number
  ply: number
  /** 该步思考秒数 */
  thinkSeconds: number
  pieceCount: number
}

export interface CapabilityProfile {
  tactics: number
  endgame: number
  defense: number
  opening: number
  timeMgmt: number
  overall: number
  weakest: keyof Omit<CapabilityProfile, 'overall' | 'weakest'>
}

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)))

/** 由平均失分换算维度分：失分越小分越高 */
function lossToScore(avgLoss: number, scale = 2.2): number {
  return clamp(100 - avgLoss * scale)
}

export function buildProfile(samples: ProfileSample[]): CapabilityProfile {
  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0

  // 战术嗅觉：只看明显失分（>100cp）的频率与幅度
  const tactical = samples.filter((s) => s.grade.cpLoss > 100)
  const tactics = samples.length ? clamp(100 - (tactical.length / samples.length) * 220 - avg(tactical.map((s) => s.grade.cpLoss)) * 0.25) : 50

  // 残局功力：子力 <= 14 时的平均失分
  const endgameSamples = samples.filter((s) => s.pieceCount <= 14)
  const endgame = lossToScore(avg(endgameSamples.map((s) => s.grade.cpLoss)) || 40)

  // 防守能力（差异化）：局面分 < -100 时的平均失分
  const defending = samples.filter((s) => s.scoreForMover < -100)
  const defense = lossToScore(avg(defending.map((s) => s.grade.cpLoss)) || 50, 1.8)

  // 开局掌握：前 24 手（ply<=24）的平均失分
  const openingSamples = samples.filter((s) => s.ply <= 24)
  const opening = lossToScore(avg(openingSamples.map((s) => s.grade.cpLoss)) || 30)

  // 时间管理：思考时间的稳定性（波动过大或过短都扣分），以中位数为基准
  const times = samples.map((s) => s.thinkSeconds).filter((t) => t > 0)
  const timesAvg = avg(times) || 1
  const variance = avg(times.map((t) => (t - timesAvg) ** 2))
  const cv = Math.sqrt(variance) / timesAvg // 变异系数
  const timeMgmt = clamp(100 - cv * 60 - (timesAvg < 1 ? 20 : 0))

  const dims = { tactics, endgame, defense, opening, timeMgmt }
  const overall = clamp((tactics + endgame + defense + opening + timeMgmt) / 5)
  const weakest = (Object.keys(dims) as Array<keyof typeof dims>)
    .reduce((a, b) => dims[a] <= dims[b] ? a : b)

  return { ...dims, overall, weakest }
}

export const DIMENSION_LABELS: Record<keyof Omit<CapabilityProfile, 'overall' | 'weakest'>, string> = {
  tactics: '战术嗅觉',
  endgame: '残局功力',
  defense: '防守能力',
  opening: '开局掌握',
  timeMgmt: '时间管理'
}

/** 针对最弱维度给出训练建议 */
export function suggestTraining(profile: CapabilityProfile): string {
  const tips: Record<string, string> = {
    tactics: '你的战术嗅觉偏弱——建议多做"猜引擎"练习：每步先猜最佳着法再揭晓。',
    endgame: '残局功力偏弱——建议从"少子残局"专项练起，重点练车兵与马兵的配合。',
    defense: '防守能力偏弱（这是多数业余棋手的短板）——建议集中复盘你输掉的局，专攻劣势下的守和着法。',
    opening: '开局掌握偏弱——建议固定一两个开局体系，把前 12 手的计划练熟。',
    timeMgmt: '时间分配不均——建议给每步设一个基准思考时间，避免在平淡局面耗时过多。'
  }
  return tips[profile.weakest] ?? ''
}

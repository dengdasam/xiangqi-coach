/**
 * 难度档位与对手着法选择。
 *
 * 核心决策（来自产品方案）：弱对手不靠限深度（会产生非人怪招），
 * 而是 MultiPV + 温度采样：p_i ∝ exp(-(cp_i - cp_best)/T)，
 * 选出的都是引擎认为合理的着法，所以"弱得像人"。
 */
import type { SearchOutput } from '../engine/search'

export interface LevelPreset {
  id: string
  name: string
  depth: number
  multipv: number
  /** 温度：越大越常选次优着法；0 = 总选最优 */
  temperature: number
  /** 失误注入概率：从候选池外挑明显次优着法，模拟人类失误 */
  blunderRate: number
}

export const LEVELS: LevelPreset[] = [
  { id: 'beginner', name: '入门', depth: 2, multipv: 8, temperature: 400, blunderRate: 0.15 },
  { id: 'novice', name: '初级', depth: 3, multipv: 6, temperature: 250, blunderRate: 0.08 },
  { id: 'club', name: '中级', depth: 4, multipv: 5, temperature: 150, blunderRate: 0.04 },
  { id: 'advanced', name: '进阶', depth: 5, multipv: 4, temperature: 80, blunderRate: 0.015 },
  { id: 'strong', name: '强手', depth: 6, multipv: 2, temperature: 30, blunderRate: 0 },
  { id: 'master', name: '满血', depth: 7, multipv: 1, temperature: 0, blunderRate: 0 }
]

/** 从多候选中按温度采样一手 */
export function pickMove(candidates: SearchOutput[], preset: LevelPreset): string {
  if (!candidates.length) return ''
  if (preset.temperature <= 0 || candidates.length === 1) return candidates[0].bestmove

  // 失误注入：以小概率选靠后的候选（模拟人类偶发低级失误）
  if (preset.blunderRate > 0 && Math.random() < preset.blunderRate && candidates.length > 2) {
    const tail = candidates.slice(Math.max(1, candidates.length - 2))
    return tail[Math.floor(Math.random() * tail.length)].bestmove
  }

  const best = candidates[0].scoreCp
  const weights = candidates.map((c) => Math.exp(-(best - c.scoreCp) / preset.temperature))
  const sum = weights.reduce((a, b) => a + b, 0)
  let r = Math.random() * sum
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i]
    if (r <= 0) return candidates[i].bestmove
  }
  return candidates[0].bestmove
}

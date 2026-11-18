/**
 * L1 模板解说器 —— 从走法事件 + 评分生成自然语言解说。
 * 强制规则：每条解说必须带"后果从句"（这段之后会怎样），否则只是裁决不是教练。
 *
 * 升级路径：L2 加战术要素（牵制/被威胁子/打开的线），L3 接 LLM。
 * 本层输出结构上兼容 L2/L3：Commentary 对象可直接被上层替换生成方式。
 */
import type { MoveGrade } from './grader'

export interface MoveEvent {
  uci: string
  isCapture: boolean
  capturedPiece?: string
  givesCheck: boolean
  isCastleLike?: boolean
}

export interface Commentary {
  grade: string
  headline: string      // 主句：这步是什么性质
  consequence: string   // 后果从句：之后会怎样（强制非空）
  alternative: string   // 更好的走法（若有）
  tip: string           // 这类局面的通用原则
}

const PIECE_NAMES: Record<string, string> = {
  K: '帅', A: '仕', B: '相', N: '马', R: '车', C: '炮', P: '兵',
  k: '将', a: '士', b: '象', n: '马', r: '车', c: '炮', p: '卒'
}

function pieceName(p?: string) { return p ? (PIECE_NAMES[p] ?? '子') : '子' }

export function commentate(
  event: MoveEvent,
  grade: MoveGrade,
  bestPv: string[],
  moverIsRed: boolean
): Commentary {
  const side = moverIsRed ? '红' : '黑'
  const parts: string[] = []

  // 主句
  if (event.isCapture) {
    parts.push(`${side}方这步吃掉了${pieceName(event.capturedPiece)}`)
  } else if (event.givesCheck) {
    parts.push(`${side}方这步将军`)
  } else {
    parts.push(`${side}方这步${grade.label}`)
  }
  const headline = parts.join('，') + '。'

  // 后果从句（强制）
  let consequence: string
  if (grade.cpLoss >= 250) {
    consequence = `但这是严重失误：局面从${(grade.scoreBefore / 100).toFixed(1)}跌到${(grade.scoreAfter / 100).toFixed(1)}，对方接下来能取得明显优势。`
  } else if (grade.cpLoss >= 100) {
    consequence = `代价是丢了约${(grade.cpLoss / 100).toFixed(1)}分，主动权交给了对方。`
  } else if (grade.cpLoss >= 50) {
    consequence = `略有损失（约${grade.cpLoss}分），优势被削弱但尚可挽回。`
  } else if (event.givesCheck) {
    consequence = '将军能迫使对方应对，但要注意后续子力是否能跟上，否则只是虚张声势。'
  } else {
    consequence = '局面基本维持，可以按照原计划继续展开子力。'
  }

  // 更好的走法
  const alternative = grade.best && grade.best !== grade.played
    ? `更好的选择是 ${grade.best}${bestPv.length > 1 ? `，后续 ${bestPv.slice(1, 3).join(' → ')}` : ''}。`
    : '这步就是当前局面的最佳选择。'

  // 通用原则
  const tip = tipFor(grade, event)

  return { grade: grade.label, headline, consequence, alternative, tip }
}

function tipFor(grade: MoveGrade, event: MoveEvent): string {
  if (grade.grade === 'blunder') return '原则：走子前先看对方最简单的反击手段，尤其是吃子和将军。'
  if (grade.grade === 'mistake') return '原则：弃子前要算清楚能换回什么，不能只看到进攻机会。'
  if (event.givesCheck) return '原则：将军要有后续，单纯把对方将赶一下往往得不偿失。'
  if (event.isCapture) return '原则：吃子前先数双方攻击该格的子力，避免吃了之后被吃回。'
  return '原则：开局阶段优先出子、争中心，不要过早重复移动同一个子。'
}

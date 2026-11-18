/**
 * useCoach —— 训练内核编排：走子后评分、生成解说、累积能力画像、错题入库。
 * 这是"教练"区别于"陪练"的核心逻辑层。
 */
import { ref, computed } from 'vue'
import { engine } from '../engine/EngineBridge'
import { type MoveNode } from '../data/model'
import { store } from '../data/db'
import { gradeMove, type MoveGrade, summarizeGrades } from '../training/grader'
import { commentate, type Commentary } from '../training/commentator'
import { buildProfile, suggestTraining, type CapabilityProfile, type ProfileSample } from '../training/profile'
import { inCheck, parseFen, type Board } from '../chess/rules'

export function useCoach(gameId: string) {
  const commentary = ref<Commentary | null>(null)
  const grades = ref<MoveGrade[]>([])
  const profile = ref<CapabilityProfile | null>(null)
  const suggestion = ref('')
  const analyzing = ref(false)

  const summary = computed(() => summarizeGrades(grades.value))

  /** 玩家走子后调用：分析局面、评分、生成解说。异步，不阻塞走子。 */
  async function onPlayerMove(node: MoveNode, boardAfter: Board, moverIsRed: boolean, thinkSeconds: number) {
    analyzing.value = true
    try {
      // 在"走子前"局面用 MultiPV 找最佳分，以及实际走法的分。
      // 这样 cp loss = 最佳分 − 实际分，而不是不同搜索深度的差。
      const fenBefore = node.fenBefore ?? boardToFen(boardAfter, moverIsRed ? 'b' : 'w')
      await engine.setPosition(fenBefore, [])
      const cands = await engine.multiPv(3, 8)
      const best = cands[0] ?? null

      // 实际走法若在候选中直接用其分；否则在走后局面浅搜近似
      const playedCandidate = cands.find((c) => c.bestmove === node.uci)
      let playedScoreForMover: number
      if (playedCandidate) {
        playedScoreForMover = moverIsRed ? playedCandidate.scoreCp : -playedCandidate.scoreCp
      } else {
        const afterFen = boardToFen(boardAfter, moverIsRed ? 'b' : 'w')
        await engine.setPosition(afterFen, [])
        const after = await engine.analyse(2)
        // analyse 返回红方视角；走后轮到对手，红方视角分即"实际走法对红方造成的局面"
        // 走子方视角 = 红方走则取该值，黑方走则取反
        playedScoreForMover = moverIsRed ? (after?.scoreCp ?? 0) : -(after?.scoreCp ?? 0)
      }

      const grade = gradeMove(node.uci, best, playedScoreForMover, moverIsRed)
      grades.value.push(grade)
      node.grade = { label: grade.label, cpLoss: grade.cpLoss, best: grade.best }
      if (grade.grade === 'blunder' || grade.grade === 'mistake') {
        node.isMistake = true
        await store.addDrill({
          id: `${node.id}-drill`, fen: node.fen, played: node.uci, best: grade.best,
          note: `${grade.label}：${grade.cpLoss}cp`, createdAt: Date.now()
        })
      }

      const givesCheck = inCheck(boardAfter, !moverIsRed)
      const captured = (node as any).captured as string | undefined
      const event = {
        uci: node.uci,
        isCapture: !!captured,
        capturedPiece: captured,
        givesCheck
      }
      commentary.value = commentate(event, grade, best?.pv ?? [], moverIsRed)
      await store.saveMove(node)
    } finally {
      analyzing.value = false
    }
  }

  /** 重算能力画像（一局结束或随时调用） */
  function refreshProfile(nodes: MoveNode[]) {
    const samples: ProfileSample[] = nodes.map((n) => ({
      grade: n.grade ? {
        grade: (n.grade.label === '优秀' || n.grade.label === '良好' ? 'good' :
          n.grade.label === '不精确' ? 'inaccuracy' :
          n.grade.label === '失误' ? 'mistake' : 'blunder') as any,
        label: n.grade.label, cpLoss: n.grade.cpLoss,
        best: n.grade.best, played: n.uci, scoreBefore: 0, scoreAfter: 0
      } : {
        grade: 'good' as any, label: '未知', cpLoss: 0, best: '', played: n.uci,
        scoreBefore: 0, scoreAfter: 0
      },
      scoreForMover: 0,
      ply: n.ply,
      thinkSeconds: n.thinkSeconds ?? 0,
      pieceCount: countPieces(n.fen)
    }))
    profile.value = buildProfile(samples)
    suggestion.value = suggestTraining(profile.value)
    return profile.value
  }

  function reset() {
    commentary.value = null
    grades.value = []
    profile.value = null
    suggestion.value = ''
  }

  return { commentary, grades, profile, suggestion, analyzing, summary, onPlayerMove, refreshProfile, reset }
}

/** 极简 FEN 生成（只用于把走后局面送回引擎） */
function boardToFen(board: Board, side: 'w' | 'b'): string {
  const rows: string[] = []
  for (let r = 0; r < 10; r++) {
    let s = '', e = 0
    for (let c = 0; c < 9; c++) {
      const p = board[r * 9 + c]
      if (p === '.') e++
      else { if (e) { s += e; e = 0 } s += p }
    }
    if (e) s += e
    rows.push(s)
  }
  return rows.join('/') + ` ${side} - - 0 1`
}

function countPieces(fen: string): number {
  const placement = fen.split(' ')[0]
  let n = 0
  for (const ch of placement) if (/[a-zA-Z]/.test(ch)) n++
  return n
}

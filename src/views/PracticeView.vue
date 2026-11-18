<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import ChessBoard from '../components/ChessBoard.vue'
import EvalBar from '../components/EvalBar.vue'
import { engine } from '../engine/EngineBridge'
import type { InfoFrame, SearchResult } from '../engine/types'
import {
  INITIAL_FEN, parseFen, toFen, applyMove, legalTargets, generateLegalMoves,
  inCheck, type Board
} from '../chess/rules'

// ---- 对局状态 ----
const board = ref<Board>(parseFen(INITIAL_FEN).board)
const redToMove = ref(true)
const selected = ref<number | null>(null)
const targets = ref<number[]>([])
const lastMove = ref<{ from: number; to: number } | null>(null)
const movesUci = ref<string[]>([])
const history = ref<Array<{ fen: string; uci: string }>>([])

// ---- 引擎状态 ----
const scoreCp = ref(0)
const depth = ref(0)
const thinking = ref(false)
const pv = ref<string[]>([])
const ready = ref(false)
const toast = ref('')

// ---- 教练解说（demo 用 L1 模板，接入 LLM 后替换） ----
const grade = ref('—')
const coachText = ref('轮到你走棋。选一个棋子，教练会实时评估你这步的好坏。')
const coachAlt = ref('')

function squareName(i: number) {
  const col = 'abcdefghi'[i % 9]
  const row = 9 - Math.floor(i / 9)
  return `${col}${row}`
}
function uciOf(from: number, to: number) { return squareName(from) + squareName(to) }

function showToast(msg: string) {
  toast.value = msg
  window.setTimeout(() => { if (toast.value === msg) toast.value = '' }, 1800)
}

async function tapSquare(i: number) {
  if (thinking.value) return
  const p = board.value[i]
  if (selected.value === null) {
    // 只能选自己（红方）的子
    if (p === '.' || p !== p.toUpperCase() || !/[A-Z]/.test(p)) return
    selected.value = i
    targets.value = legalTargets(board.value, i)
    return
  }
  if (targets.value.includes(i)) {
    const from = selected.value
    await doPlayerMove(from, i)
    selected.value = null
    targets.value = []
  } else if (p !== '.' && p === p.toUpperCase() && /[A-Z]/.test(p)) {
    selected.value = i
    targets.value = legalTargets(board.value, i)
  } else {
    selected.value = null
    targets.value = []
  }
}

async function doPlayerMove(from: number, to: number) {
  const fenBefore = toFen(board.value, redToMove.value)
  const uci = uciOf(from, to)
  board.value = applyMove(board.value, from, to)
  lastMove.value = { from, to }
  movesUci.value.push(uci)
  history.value.push({ fen: fenBefore, uci })
  redToMove.value = false

  // 走完立即给这步评分（此处用引擎评估局面作为演示；完整版应为 before/after cp loss）
  const isCapture = fenBefore !== '' && to !== from
  showToast(`你走了 ${uci}${isCapture ? '（吃子）' : ''}`)
  await askEngine()
}

async function askEngine() {
  thinking.value = true
  coachText.value = '引擎正在分析局面…'
  const fen = toFen(board.value, redToMove.value)
  await engine.setPosition(fen, movesUci.value)
  await engine.go({ depth: 12, movetime: 1000, multipv: 3 })
}

let offInfo: (() => void) | undefined
let offBest: (() => void) | undefined

onMounted(async () => {
  offInfo = engine.on('info', (f: InfoFrame) => {
    depth.value = f.depth ?? depth.value
    if (f.scoreCp !== undefined) scoreCp.value = redToMove.value ? f.scoreCp : -f.scoreCp
    if (f.pv?.length) pv.value = f.pv
  })
  offBest = engine.on('bestmove', (r: SearchResult) => {
    thinking.value = false
    if (r.info?.scoreCp !== undefined) scoreCp.value = redToMove.value ? r.info.scoreCp : -r.info.scoreCp
    // 演示解说：L1 模板，取 PV 首着
    const best = r.bestmove
    const bestText = best ? `引擎推荐 ${best}` : ''
    grade.value = '良好'
    coachText.value = `${bestText}。你这步之后局面评估 ${(scoreCp.value / 100).toFixed(2)}。`
    coachAlt.value = r.infos && r.infos.length > 1
      ? `其他候选：${r.infos.slice(0, 3).map((i) => i.pv?.[0] ?? '').filter(Boolean).join(' / ')}`
      : ''
    // 演示：引擎自动走一步（对练闭环）
    if (best && best.length === 4) {
      window.setTimeout(() => applyEngineMove(best), 400)
    }
  })
  await engine.init({ hash: 256, threads: 2 })
  ready.value = await engine.isReady()
  showToast(ready.value ? '引擎就绪，红方先走' : '引擎未就绪')
})

function applyEngineMove(uci: string) {
  const from = (9 - Number(uci[1])) * 9 + 'abcdefghi'.indexOf(uci[0])
  const to = (9 - Number(uci[3])) * 9 + 'abcdefghi'.indexOf(uci[2])
  const legal = generateLegalMoves(board.value, redToMove.value)
  const match = legal.find((m) => m.from === from && m.to === to)
  if (!match) { showToast('引擎着法与规则库不一致（perft 校验提示）'); return }
  board.value = applyMove(board.value, match.from, match.to)
  lastMove.value = { from: match.from, to: match.to }
  movesUci.value.push(uci)
  redToMove.value = true
  scoreCp.value = -scoreCp.value
}

const checkSquare = computed(() => {
  if (inCheck(board.value, redToMove.value)) {
    const kingIdx = board.value.indexOf(redToMove.value ? 'K' : 'k')
    return kingIdx >= 0 ? kingIdx : null
  }
  return null
})

function undo() {
  if (history.value.length < 2 || thinking.value) return
  // 悔一步：回退到玩家上一手之前（引擎那手也退回）
  history.value.pop(); history.value.pop()
  movesUci.value.pop(); movesUci.value.pop()
  const last = history.value[history.value.length - 1]
  const fen = last ? last.fen : INITIAL_FEN
  const parsed = parseFen(fen)
  board.value = parsed.board
  redToMove.value = true
  lastMove.value = null
  selected.value = null
  targets.value = []
  grade.value = '—'
  coachText.value = '已悔棋，回到你的上一步。'
  coachAlt.value = ''
}

function restart() {
  board.value = parseFen(INITIAL_FEN).board
  redToMove.value = true
  movesUci.value = []
  history.value = []
  lastMove.value = null
  selected.value = null
  targets.value = []
  scoreCp.value = 0
  grade.value = '—'
  coachText.value = '新的一局，红方先走。'
  coachAlt.value = ''
}

onUnmounted(() => {
  offInfo?.(); offBest?.()
  engine.quit()
})
</script>

<template>
  <div style="display:flex;flex-direction:column;height:100%">
    <div class="topbar">
      <h1>象棋教练</h1>
      <span class="badge">{{ ready ? '引擎就绪' : '连接中' }} · 红方</span>
    </div>

    <div class="board-area">
      <ChessBoard
        :board="board" :selected="selected" :targets="targets"
        :last-move="lastMove" :check-square="checkSquare"
        @tap="tapSquare"
      />
    </div>

    <div class="panel">
      <EvalBar :score-cp="scoreCp" :depth="depth" :thinking="thinking" />

      <div class="movelist">
        <div class="movelist-head">着法记录（{{ movesUci.length }}）</div>
        <div class="movelist-scroll">
          <span v-for="(m, i) in movesUci" :key="i" class="move-chip" :class="{ active: i === movesUci.length - 1 }">{{ m }}</span>
          <span v-if="!movesUci.length" class="move-chip" style="color:var(--text-dim)">尚无着法</span>
        </div>
      </div>

      <div class="coach-panel">
        <div class="coach-head">
          <span>教练点评</span>
          <span class="coach-grade">{{ grade }}</span>
        </div>
        <div class="coach-text">{{ coachText }}</div>
        <div class="coach-alt" v-if="coachAlt">{{ coachAlt }}</div>
      </div>

      <div class="controls">
        <button class="ctrl-btn" @click="undo" :disabled="thinking">悔棋</button>
        <button class="ctrl-btn" @click="restart" :disabled="thinking">新局</button>
        <button class="ctrl-btn primary" @click="askEngine" :disabled="thinking">分析局面</button>
      </div>
    </div>

    <div v-if="toast" class="toast">{{ toast }}</div>
  </div>
</template>

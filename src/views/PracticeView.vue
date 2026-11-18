<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import ChessBoard from '../components/ChessBoard.vue'
import EvalBar from '../components/EvalBar.vue'
import EvalCurve from '../components/EvalCurve.vue'
import { engine } from '../engine/EngineBridge'
import type { InfoFrame, SearchResult } from '../engine/types'
import { INITIAL_FEN, parseFen } from '../chess/rules'
import { useGame, uciToIndices } from '../composables/useGame'
import { useCoach } from '../composables/useCoach'
import { useTheme } from '../composables/useTheme'
import { LEVELS, pickMove } from '../training/difficulty'
import { newId } from '../data/model'
import { store } from '../data/db'
import { DIMENSION_LABELS } from '../training/profile'

// ---- 组合式逻辑（已从巨型组件拆出）----
const gameId = ref(newId())
const game = useGame(gameId.value)
const coach = useCoach(gameId.value)
const { theme, toggle: toggleTheme } = useTheme()

// ---- UI 状态 ----
const scoreCp = ref(0)
const depth = ref(0)
const thinking = ref(false)
const ready = ref(false)
const toast = ref('')
const levelId = ref('club')
const showProfile = ref(false)
const evalHistory = ref<number[]>([0])
const justMoved = ref<number | null>(null)
const capturedAt = ref<{ pos: number; piece: string } | null>(null)
const turnStarted = ref(Date.now())

const level = computed(() => LEVELS.find((l) => l.id === levelId.value) ?? LEVELS[2])
const gradeClass = computed(() => {
  const g = coach.commentary.value?.grade ?? ''
  if (g === '严重失误' || g === '失误') return 'blunder'
  if (g === '优秀' || g === '良好') return 'good'
  return ''
})

function showToast(msg: string) {
  toast.value = msg
  window.setTimeout(() => { if (toast.value === msg) toast.value = '' }, 1800)
}

async function tapSquare(i: number) {
  if (thinking.value || !ready.value) return
  if (game.selected.value === null) {
    game.select(i)
    return
  }
  if (game.targets.value.includes(i)) {
    await doPlayerMove(game.selected.value, i)
  } else if (!game.select(i)) {
    game.selected.value = null
    game.targets.value = []
  }
}

async function doPlayerMove(from: number, to: number) {
  const capturedPiece = game.board.value[to] !== '.' ? game.board.value[to] : null
  const thinkSeconds = Math.max(0.2, (Date.now() - turnStarted.value) / 1000)
  const node = game.playMove(from, to, thinkSeconds)
  if (!node) return

  // 动画状态
  justMoved.value = to
  if (capturedPiece) capturedAt.value = { pos: to, piece: capturedPiece }
  window.setTimeout(() => { justMoved.value = null; capturedAt.value = null }, 280)

  showToast(`你走了 ${node.uci}${capturedPiece ? '（吃子）' : ''}`)
  await coach.onPlayerMove(node, game.board.value, node.side === 'r', thinkSeconds)
  await store.saveGame({
    id: gameId.value, levelId: levelId.value, playerSide: 'r', result: 'ongoing',
    startFen: INITIAL_FEN, currentNodeId: game.currentNodeId.value,
    createdAt: Date.now(), updatedAt: Date.now()
  })

  // 引擎对手走子（用 MultiPV 采样调节难度）
  await engineMove()
  turnStarted.value = Date.now()
}

async function engineMove() {
  thinking.value = true
  // fen 已是走后当前局面；再传历史会让引擎重复重放，必须传空
  await engine.setPosition(game.fen.value, [])
  const cands = await engine.multiPv(level.value.depth, level.value.multipv)
  const chosen = pickMove(cands, level.value)
  thinking.value = false
  if (!chosen) { showToast('引擎未返回着法'); return }

  const { from, to } = uciToIndices(chosen)
  const capturedPiece = game.board.value[to] !== '.' ? game.board.value[to] : null
  // 引擎走子也进树，保持分支结构一致
  game.playMove(from, to, 0)
  justMoved.value = to
  if (capturedPiece) capturedAt.value = { pos: to, piece: capturedPiece }
  window.setTimeout(() => { justMoved.value = null; capturedAt.value = null }, 280)

  const best = cands[0]
  if (best) { scoreCp.value = game.redToMove.value ? -best.scoreCp : best.scoreCp; depth.value = best.depth }
  evalHistory.value.push(scoreCp.value)
  if (evalHistory.value.length > 40) evalHistory.value.shift()
}

function jumpTo(uci: string, index: number) {
  if (thinking.value) return
  // 按 uci 序列定位节点
  const target = game.nodes.value[index]
  if (target) {
    game.jumpTo(target.id)
    evalHistory.value = evalHistory.value.slice(0, index + 1)
    showToast(`回到第 ${index + 1} 手`)
  }
}

function undo() {
  if (thinking.value) return
  // 悔棋：退两手（引擎+玩家）
  game.undo(); game.undo()
  coach.reset()
  evalHistory.value = [0]
  showToast('已悔棋')
}

function restart() {
  game.reset(); coach.reset()
  scoreCp.value = 0; depth.value = 0
  evalHistory.value = [0]
  justMoved.value = null; capturedAt.value = null
  gameId.value = newId()
  turnStarted.value = Date.now()
  showToast('新的一局')
}

function analyzeProfile() {
  coach.refreshProfile(game.nodes.value)
  showProfile.value = true
}

let offInfo: (() => void) | undefined
let offBest: (() => void) | undefined

onMounted(async () => {
  offInfo = engine.on('info', (f: InfoFrame) => {
    depth.value = f.depth ?? depth.value
    if (f.scoreCp !== undefined) scoreCp.value = game.redToMove.value ? f.scoreCp : -f.scoreCp
  })
  offBest = engine.on('bestmove', (r: SearchResult) => {
    if (r.info?.scoreCp !== undefined) scoreCp.value = game.redToMove.value ? r.info.scoreCp : -r.info.scoreCp
  })
  await engine.init()
  ready.value = await engine.isReady()
  showToast(`引擎就绪（${engine.backend === 'local' ? '内置搜索' : '原生'}）`)
})

onUnmounted(() => {
  offInfo?.(); offBest?.()
  engine.quit()
})
</script>

<template>
  <div style="display:flex;flex-direction:column;height:100%">
    <div class="topbar">
      <h1>象棋教练</h1>
      <div class="row">
        <select v-model="levelId" class="icon-btn" :disabled="thinking" style="font-size:11px">
          <option v-for="l in LEVELS" :key="l.id" :value="l.id">{{ l.name }}</option>
        </select>
        <button class="icon-btn" @click="toggleTheme" :title="theme === 'dark' ? '切换浅色' : '切换深色'">{{ theme === 'dark' ? '☀' : '☾' }}</button>
        <span class="badge">{{ ready ? '就绪' : '连接中' }}</span>
      </div>
    </div>

    <div class="board-area">
      <ChessBoard
        :board="game.board.value" :selected="game.selected.value" :targets="game.targets.value"
        :last-move="game.lastMove.value" :check-square="game.checkSquare.value"
        :just-moved="justMoved" :captured-at="capturedAt"
        @tap="tapSquare"
      />
    </div>

    <div class="panel">
      <EvalBar :score-cp="scoreCp" :depth="depth" :thinking="thinking" />
      <EvalCurve :scores="evalHistory" />

      <div class="movelist">
        <div class="movelist-head">
          <span>着法（{{ game.uciHistory.value.length }}）</span>
          <span v-if="coach.summary.value.accuracy">{{ coach.summary.value.accuracy }}% 准确率</span>
        </div>
        <div class="movelist-scroll">
          <span v-for="(m, i) in game.uciHistory.value" :key="i"
            :class="['move-chip', i === game.uciHistory.value.length - 1 ? 'active' : '', game.nodes.value[i]?.grade?.label === '严重失误' ? 'blunder' : '']"
            @click="jumpTo(m, i)">{{ m }}</span>
          <span v-if="!game.uciHistory.value.length" class="move-chip" style="color:var(--text-dim)">尚无着法</span>
        </div>
      </div>

      <div class="coach-panel" v-if="coach.commentary.value">
        <div class="coach-head">
          <span>教练点评</span>
          <span class="coach-grade" :class="gradeClass">{{ coach.commentary.value.grade }}</span>
        </div>
        <div class="coach-text">
          {{ coach.commentary.value.headline }}
          <span class="consequence">{{ coach.commentary.value.consequence }}</span>
        </div>
        <div class="coach-alt">{{ coach.commentary.value.alternative }}</div>
        <div class="coach-tip">{{ coach.commentary.value.tip }}</div>
      </div>

      <div class="profile-grid" v-if="showProfile && coach.profile.value">
        <div v-for="(label, key) in DIMENSION_LABELS" :key="key"
          :class="['profile-cell', coach.profile.value.weakest === key ? 'weak' : '']">
          {{ label }} {{ (coach.profile.value as any)[key] }}
          <div class="profile-bar"><div :style="{ width: (coach.profile.value as any)[key] + '%' }" /></div>
        </div>
      </div>
      <div v-if="showProfile && coach.suggestion.value" class="coach-tip" style="padding:0 14px 8px">{{ coach.suggestion.value }}</div>

      <div class="controls">
        <button class="ctrl-btn" @click="undo" :disabled="thinking">悔棋</button>
        <button class="ctrl-btn" @click="restart" :disabled="thinking">新局</button>
        <button class="ctrl-btn" @click="analyzeProfile" :disabled="thinking">能力画像</button>
      </div>
    </div>

    <div v-if="toast" class="toast">{{ toast }}</div>
  </div>
</template>

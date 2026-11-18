/**
 * useGame —— 对局核心状态与走子逻辑（从 PracticeView 抽离）。
 * 管理棋盘、轮走方、选中态、着法树节点、引擎联动。
 */
import { ref, computed } from 'vue'
import {
  INITIAL_FEN, type Board, parseFen, toFen, applyMove, legalTargets,
  generateLegalMoves, inCheck
} from '../chess/rules'
import { squareName } from '../engine/search'
import { type MoveNode, newId } from '../data/model'

export function squareIndexUci(from: number, to: number) {
  return squareName(from) + squareName(to)
}
export function uciToIndices(uci: string) {
  const from = (9 - Number(uci[1])) * 9 + 'abcdefghi'.indexOf(uci[0])
  const to = (9 - Number(uci[3])) * 9 + 'abcdefghi'.indexOf(uci[2])
  return { from, to }
}
const uciToIndices2 = uciToIndices

export function useGame(gameId: string) {
  const board = ref<Board>(parseFen(INITIAL_FEN).board)
  const redToMove = ref(true)
  const selected = ref<number | null>(null)
  const targets = ref<number[]>([])
  const lastMove = ref<{ from: number; to: number } | null>(null)
  const nodes = ref<MoveNode[]>([])
  const currentNodeId = ref<string | null>(null)
  const thinking = ref(false)

  const checkSquare = computed(() => {
    if (!inCheck(board.value, redToMove.value)) return null
    const target = redToMove.value ? 'K' : 'k'
    const i = board.value.indexOf(target)
    return i >= 0 ? i : null
  })

  const uciHistory = computed(() => {
    const byId = new Map(nodes.value.map((n) => [n.id, n]))
    const path: MoveNode[] = []
    let cur = currentNodeId.value ? byId.get(currentNodeId.value) : undefined
    while (cur) { path.unshift(cur); cur = cur.parentId ? byId.get(cur.parentId) : undefined }
    return path.map((n) => n.uci)
  })

  function select(i: number) {
    const p = board.value[i]
    const mine = redToMove.value ? p === p.toUpperCase() : p === p.toLowerCase()
    if (p === '.' || !mine) return false
    selected.value = i
    targets.value = legalTargets(board.value, i)
    return true
  }

  /** 执行玩家着法，返回着法节点 */
  function playMove(from: number, to: number, thinkSeconds = 0): MoveNode | null {
    const uci = squareIndexUci(from, to)
    const legal = generateLegalMoves(board.value, redToMove.value)
    if (!legal.some((m) => m.from === from && m.to === to)) return null

    const fenBefore = toFen(board.value, redToMove.value)
    const captured = board.value[to]
    board.value = applyMove(board.value, from, to)
    lastMove.value = { from, to }
    const fenAfter = toFen(board.value, !redToMove.value)

    const node: MoveNode = {
      id: newId(), gameId, parentId: currentNodeId.value,
      uci, ply: nodes.value.length + 1,
      side: redToMove.value ? 'r' : 'b',
      fen: fenAfter, fenBefore, thinkSeconds,
      createdAt: Date.now()
    }
    ;(node as any).captured = captured !== '.' ? captured : undefined
    nodes.value.push(node)
    currentNodeId.value = node.id
    redToMove.value = !redToMove.value
    selected.value = null
    targets.value = []
    return node
  }

  /** 跳到某节点（复盘/分支切换） */
  function jumpTo(nodeId: string | null) {
    const byId = new Map(nodes.value.map((n) => [n.id, n]))
    const node = nodeId ? byId.get(nodeId) : null
    if (node) {
      board.value = parseFen(node.fen).board
      // node.side 是走子方；走完后轮到相反方
      redToMove.value = node.side !== 'r'
      lastMove.value = uciToIndices2(node.uci)
      currentNodeId.value = node.id
    } else {
      board.value = parseFen(INITIAL_FEN).board
      redToMove.value = true
      lastMove.value = null
      currentNodeId.value = null
    }
    selected.value = null
    targets.value = []
  }

  function reset() {
    board.value = parseFen(INITIAL_FEN).board
    redToMove.value = true
    selected.value = null
    targets.value = []
    lastMove.value = null
    nodes.value = []
    currentNodeId.value = null
  }

  /** 撤销最后一手（回到父节点） */
  function undo() {
    const byId = new Map(nodes.value.map((n) => [n.id, n]))
    const cur = currentNodeId.value ? byId.get(currentNodeId.value) : null
    if (!cur) return
    jumpTo(cur.parentId)
    nodes.value = nodes.value.filter((n) => n.id !== cur.id && n.parentId !== cur.id)
  }

  return {
    board, redToMove, selected, targets, lastMove, nodes, currentNodeId, thinking,
    checkSquare, uciHistory, select, playMove, jumpTo, reset, undo,
    fen: computed(() => toFen(board.value, redToMove.value))
  }
}

export type UseGameReturn = ReturnType<typeof useGame>

/**
 * 数据模型 —— 自引用着法节点树（parent_id），修复 v0.1 线性着法表无法支持分支的缺陷。
 * 主变例只是 parent_id 链的一个特例；悔棋、分支探索、复盘跳步都建立在这一结构上。
 */
export interface MoveNode {
  id: string
  gameId: string
  parentId: string | null   // null = 根节点（初始局面）
  uci: string
  ply: number
  /** 走子方 'r' | 'b' */
  side: 'r' | 'b'
  /** 走后局面 FEN */
  fen: string
  /** 走前局面 FEN（逐手评分必需：在其上找最佳着法与实际着法的分差） */
  fenBefore?: string
  /** 评分数据（若已分析） */
  grade?: {
    label: string
    cpLoss: number
    best: string
  }
  /** 这条分支是否被标记为"错题" */
  isMistake?: boolean
  thinkSeconds?: number
  createdAt: number
}

export interface Game {
  id: string
  levelId: string
  playerSide: 'r' | 'b'
  result: 'win' | 'loss' | 'draw' | 'ongoing'
  startFen: string
  createdAt: number
  updatedAt: number
  /** 当前所在节点（用于续局/分支切换） */
  currentNodeId: string | null
}

/** 从根节点沿 parent_id 回溯到某节点的路径 */
export function pathToNode(nodes: MoveNode[], nodeId: string): MoveNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const path: MoveNode[] = []
  let cur = byId.get(nodeId)
  while (cur) { path.unshift(cur); cur = cur.parentId ? byId.get(cur.parentId) : undefined }
  return path
}

/** 取某节点的所有子分支 */
export function childrenOf(nodes: MoveNode[], parentId: string | null): MoveNode[] {
  return nodes.filter((n) => n.parentId === parentId)
}

/** 主变例：从根开始每节点取第一个子节点，直到叶子 */
export function mainLine(nodes: MoveNode[]): MoveNode[] {
  const line: MoveNode[] = []
  let parent: string | null = null
  while (true) {
    const kids: MoveNode[] = childrenOf(nodes, parent)
      .sort((a: MoveNode, b: MoveNode) => a.createdAt - b.createdAt)
    const child: MoveNode | undefined = kids[0]
    if (!child) break
    line.push(child)
    parent = child.id
  }
  return line
}

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

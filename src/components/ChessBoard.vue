<script setup lang="ts">
import { computed } from 'vue'
import type { Board } from '../chess/rules'
import { isRed } from '../chess/rules'

const props = defineProps<{
  board: Board
  selected: number | null
  targets: number[]
  lastMove: { from: number; to: number } | null
  checkSquare: number | null
}>()
const emit = defineEmits<{ (e: 'tap', index: number): void }>()

// 棋盘几何：9 列 10 行，格子间距 40，边距 28
const GAP = 40, PAD = 28
const W = PAD * 2 + GAP * 8
const H = PAD * 2 + GAP * 9

const px = (col: number) => PAD + col * GAP
const py = (row: number) => PAD + row * GAP

const horizontalLines = Array.from({ length: 10 }, (_, r) => py(r))
const verticalLines = [
  { c: 0, top: py(0), bottom: py(9) },
  { c: 8, top: py(0), bottom: py(9) }
]
// 中间 7 条竖线在楚河汉界处断开
const innerVerticals = Array.from({ length: 7 }, (_, i) => i + 1)

const pieceGlyph: Record<string, string> = {
  K: '帥', A: '仕', B: '相', N: '馬', R: '車', C: '炮', P: '兵',
  k: '將', a: '士', b: '象', n: '馬', r: '車', c: '砲', p: '卒'
}

const cells = computed(() => {
  const out: Array<{ i: number; x: number; y: number; p: string }> = []
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const i = r * 9 + c
      const p = props.board[i]
      if (p !== '.') out.push({ i, x: px(c), y: py(r), p })
    }
  }
  return out
})
</script>

<template>
  <svg class="board-svg" :viewBox="`0 0 ${W} ${H}`" xmlns="http://www.w3.org/2000/svg">
    <rect :x="0" :y="0" :width="W" :height="H" fill="#e8c896" />
    <!-- 外框 -->
    <rect class="board-frame" :x="PAD - 6" :y="PAD - 6" :width="GAP * 8 + 12" :height="GAP * 9 + 12" />
    <!-- 横线 -->
    <line v-for="(y, r) in horizontalLines" :key="`h${r}`" class="board-line" :x1="px(0)" :y1="y" :x2="px(8)" :y2="y" />
    <!-- 左右竖线 -->
    <line v-for="v in verticalLines" :key="`v${v.c}`" class="board-line" :x1="px(v.c)" :y1="v.top" :x2="px(v.c)" :y2="v.bottom" />
    <!-- 中间竖线（楚河汉界断开） -->
    <template v-for="c in innerVerticals" :key="`iv${c}`">
      <line class="board-line" :x1="px(c)" :y1="py(0)" :x2="px(c)" :y2="py(4)" />
      <line class="board-line" :x1="px(c)" :y1="py(5)" :x2="px(c)" :y2="py(9)" />
    </template>
    <!-- 九宫斜线 -->
    <line class="palace-line" :x1="px(3)" :y1="py(0)" :x2="px(5)" :y2="py(2)" />
    <line class="palace-line" :x1="px(5)" :y1="py(0)" :x2="px(3)" :y2="py(2)" />
    <line class="palace-line" :x1="px(3)" :y1="py(7)" :x2="px(5)" :y2="py(9)" />
    <line class="palace-line" :x1="px(5)" :y1="py(7)" :x2="px(3)" :y2="py(9)" />
    <!-- 楚河汉界 -->
    <text :x="px(2)" :y="py(4) + 7" font-size="15" fill="#8a7150" text-anchor="middle">楚 河</text>
    <text :x="px(6)" :y="py(4) + 7" font-size="15" fill="#8a7150" text-anchor="middle">漢 界</text>

    <!-- 上一步走法标记 -->
    <rect v-if="lastMove" class="last-move-mark" :x="px(lastMove.from % 9) - 17" :y="py(Math.floor(lastMove.from / 9)) - 17" :width="34" :height="34" rx="3" />
    <rect v-if="lastMove" class="last-move-mark" :x="px(lastMove.to % 9) - 17" :y="py(Math.floor(lastMove.to / 9)) - 17" :width="34" :height="34" rx="3" />

    <!-- 可走点提示 -->
    <circle v-for="t in targets" :key="`t${t}`" class="dot-hint" :cx="px(t % 9)" :cy="py(Math.floor(t / 9))" r="6" />

    <!-- 将军标记 -->
    <circle v-if="checkSquare !== null" class="check-mark" :cx="px(checkSquare % 9)" :cy="py(Math.floor(checkSquare / 9))" r="19" />

    <!-- 棋子（点击热区半径 19） -->
    <g v-for="cell in cells" :key="cell.i" @click="emit('tap', cell.i)" style="cursor:pointer">
      <circle
        :class="['piece-circle', isRed(cell.p) ? 'piece-red' : 'piece-black', selected === cell.i ? 'piece-selected' : '']"
        :cx="cell.x" :cy="cell.y" r="17"
      />
      <text
        :class="isRed(cell.p) ? 'piece-text-red' : 'piece-text-black'"
        :x="cell.x" :y="cell.y + 6" font-size="19" font-weight="700" text-anchor="middle"
        style="pointer-events:none"
      >{{ pieceGlyph[cell.p] }}</text>
    </g>
  </svg>
</template>

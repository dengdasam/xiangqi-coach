<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ scoreCp: number; depth: number; thinking: boolean }>()
// cp -> 胜率，用演示系数 k（设计文档注明需实战校准）
const k = 0.0025
const winRate = computed(() => 1 / (1 + Math.exp(-k * props.scoreCp)))
const redPct = computed(() => Math.round(winRate.value * 100))
const scoreText = computed(() => {
  if (props.scoreCp >= 0) return `+${(props.scoreCp / 100).toFixed(2)}`
  return (props.scoreCp / 100).toFixed(2)
})
</script>

<template>
  <div class="evalbar-wrap">
    <div class="evalbar-head">
      <span>红方 {{ scoreText }}</span>
      <span>{{ thinking ? `思考中 d${depth}` : `深度 ${depth}` }}</span>
    </div>
    <div class="evalbar-track">
      <div class="evalbar-fill" :style="{ width: redPct + '%' }" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ scores: number[] }>()
// 把 cp 序列画成折线：中线=50%，红优在上
const W = 300, H = 44
const pathD = computed(() => {
  if (props.scores.length < 2) return ''
  const max = Math.max(...props.scores.map((s) => Math.abs(s)), 100)
  return props.scores.map((s, i) => {
    const x = (i / (props.scores.length - 1)) * W
    const y = H / 2 - (s / max) * (H / 2 - 3)
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')
})
</script>

<template>
  <svg v-if="pathD" class="eval-curve" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none">
    <path class="mid" :d="`M 0 ${H/2} L ${W} ${H/2}`" />
    <path :d="pathD" />
  </svg>
</template>

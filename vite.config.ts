import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: './', // Capacitor 用 file:// 加载，必须相对路径
  build: {
    outDir: 'dist',
    target: 'es2020'
  },
  server: {
    host: '0.0.0.0',
    port: 5173
  }
})

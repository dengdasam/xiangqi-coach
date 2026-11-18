import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.xiangqicoach.app',
  appName: '象棋教练',
  webDir: 'dist',
  // 自定义原生引擎插件（对应皮卡鱼的 native-engine）
  includePlugins: ['NativeEngine'],
  plugins: {
    NativeEngine: {
      // 引擎可执行文件在 App 内的相对路径（占位，接入真引擎后填）
      enginePath: 'engine/pikafish',
      nnuePath: 'engine/pikafish.nnue'
    }
  },
  android: {
    allowMixedContent: false,
    captureInput: true
  },
  server: {
    androidScheme: 'https'
  }
}

export default config

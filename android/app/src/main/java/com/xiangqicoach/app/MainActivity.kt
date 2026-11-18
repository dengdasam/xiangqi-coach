package com.xiangqicoach.app

import com.getcapacitor.BridgeActivity

/**
 * Capacitor 宿主 Activity。
 * UI 全部由 WebView 里的 Vue 前端渲染；本类只负责装载 Bridge 与原生插件。
 * 对应皮卡鱼 APK 的 com.xiangqiai.app.MainActivity。
 */
class MainActivity : BridgeActivity()

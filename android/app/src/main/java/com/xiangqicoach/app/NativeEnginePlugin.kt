package com.xiangqicoach.app

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * 原生引擎插件 —— 象棋教练的引擎桥在 Android 端的落地。
 *
 * 对应皮卡鱼 APK 里的 `native-engine` 插件：
 *   Vue 前端 -> Capacitor 桥 -> 本插件 -> JNI -> libpikafish.so
 *
 * 当前 JNI 层为占位实现（返回模拟 info/bestmove），
 * 接入真引擎时只需替换 native-engine.cpp 里的函数体，本文件无需改动。
 */
@CapacitorPlugin(name = "NativeEngine")
class NativeEnginePlugin : Plugin() {

    companion object {
        init {
            // 加载 C++ 引擎桥动态库；真引擎 .so 由 CMake 一并打包
            System.loadLibrary("native-engine")
        }
    }

    private var initialized = false

    /** 初始化引擎：config 来自 capacitor.config.ts 的 plugins.NativeEngine */
    @PluginMethod
    fun init(call: PluginCall) {
        val enginePath = call.getString("enginePath") ?: "engine/pikafish"
        val nnuePath = call.getString("nnuePath") ?: "engine/pikafish.nnue"
        val hash = call.getInt("hash") ?: 256
        val threads = call.getInt("threads") ?: 2
        // 真引擎：nativeInit(context.filesDir.absolutePath, enginePath, nnuePath, hash, threads)
        val ok = nativeInit(enginePath, nnuePath, hash, threads)
        initialized = ok
        val ret = JSObject().put("ok", ok).put("version", nativeVersion())
        call.resolve(ret)
    }

    @PluginMethod
    fun isReady(call: PluginCall) {
        call.resolve(JSObject().put("ready", initialized && nativeIsReady()))
    }

    /** 设置局面：FEN + 后续 UCI 着法 */
    @PluginMethod
    fun setPosition(call: PluginCall) {
        val fen = call.getString("fen") ?: return call.reject("fen required")
        val moves = call.getArray("moves")?.toList<String>() ?: emptyList()
        nativeSetPosition(fen, moves.joinToString(" "))
        call.resolve()
    }

    /** 开始思考；info 与 bestmove 通过 notifyListeners 流式推给前端 */
    @PluginMethod
    fun go(call: PluginCall) {
        val depth = call.getInt("depth") ?: 12
        val movetime = call.getInt("movetime") ?: 1000
        val multipv = call.getInt("multipv") ?: 1
        // 真引擎放线程池执行，避免阻塞 Bridge 线程；此处占位同步返回
        nativeGo(depth, movetime, multipv)
        call.resolve()
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        nativeStop()
        call.resolve()
    }

    @PluginMethod
    fun quit(call: PluginCall) {
        nativeQuit()
        initialized = false
        call.resolve()
    }

    // ---- JNI 声明。函数体在 cpp/native-engine.cpp ----
    private external fun nativeInit(enginePath: String, nnuePath: String, hash: Int, threads: Int): Boolean
    private external fun nativeVersion(): String
    private external fun nativeIsReady(): Boolean
    private external fun nativeSetPosition(fen: String, moves: String)
    private external fun nativeGo(depth: Int, movetime: Int, multipv: Int)
    private external fun nativeStop()
    private external fun nativeQuit()

    /**
     * 由 C++ 侧回调本方法，把引擎 info/bestmove 事件推给 Vue 前端。
     * 真引擎接入时：JNI 线程 -> 切回主线程 -> notifyListeners。
     */
    fun emitFromNative(event: String, json: String) {
        activity.runOnUiThread {
            notifyListeners(event, JSObject(json))
        }
    }
}

#include <jni.h>
#include <string>
#include <thread>
#include <chrono>

/**
 * 原生引擎桥（占位实现）
 * ------------------------------------------------------------------
 * 这一层是 Vue 前端与 Pikafish 引擎之间的唯一边界。
 *
 * 当前状态：返回模拟的引擎事件，让整条链路（Vue -> Capacitor -> JNI）
 * 可以跑通并验证。接真引擎时，只需把各函数体替换为：
 *   1. nativeInit: 启动 pikafish 子进程或加载 .so，通过 UCI 握手
 *   2. nativeSetPosition: 写入 "position fen ... moves ...\n"
 *   3. nativeGo: 异步线程写 "go depth N ..."，读 info/bestmove 行
 *   4. 解析行 -> 构造 JSON -> 回调 Java 的 emitFromNative(event, json)
 *
 * Java 侧契约见 NativeEnginePlugin.kt，前端契约见 src/engine/types.ts。
 */

static JavaVM* g_jvm = nullptr;
static jobject g_plugin = nullptr;  // NativeEnginePlugin 实例（全局引用）

/** 从 JNI 回调 Java 的 emitFromNative，把引擎事件推给前端 */
static void emitEvent(JNIEnv* env, const char* event, const std::string& json) {
    if (!g_plugin) return;
    jclass cls = env->GetObjectClass(g_plugin);
    jmethodID m = env->GetMethodID(cls, "emitFromNative", "(Ljava/lang/String;Ljava/lang/String;)V");
    jstring je = env->NewStringUTF(event);
    jstring jj = env->NewStringUTF(json.c_str());
    env->CallVoidMethod(g_plugin, m, je, jj);
    env->DeleteLocalRef(je);
    env->DeleteLocalRef(jj);
    env->DeleteLocalRef(cls);
}

extern "C" {

JNIEXPORT jboolean JNICALL
Java_com_xiangqicoach_app_NativeEnginePlugin_nativeInit(
        JNIEnv* env, jobject thiz, jstring enginePath, jstring nnuePath, jint hash, jint threads) {
    env->GetJavaVM(&g_jvm);
    if (g_plugin) env->DeleteGlobalRef(g_plugin);
    g_plugin = env->NewGlobalRef(thiz);
    // 真引擎：加载 libpikafish.so / 启动子进程，校验 NNUE 文件存在
    (void)enginePath; (void)nnuePath; (void)hash; (void)threads;
    return JNI_TRUE;
}

JNIEXPORT jstring JNICALL
Java_com_xiangqicoach_app_NativeEnginePlugin_nativeVersion(JNIEnv* env, jobject) {
    return env->NewStringUTF("pikafish-bridge-placeholder-0.1");
}

JNIEXPORT jboolean JNICALL
Java_com_xiangqicoach_app_NativeEnginePlugin_nativeIsReady(JNIEnv*, jobject) {
    return JNI_TRUE;
}

JNIEXPORT void JNICALL
Java_com_xiangqicoach_app_NativeEnginePlugin_nativeSetPosition(
        JNIEnv* env, jobject, jstring fen, jstring moves) {
    // 真引擎：写入 UCI "position fen <fen> moves <moves>"
    (void)env; (void)fen; (void)moves;
}

JNIEXPORT void JNICALL
Java_com_xiangqicoach_app_NativeEnginePlugin_nativeGo(
        JNIEnv*, jobject, jint depth, jint movetime, jint multipv) {
    // 占位：起一个后台线程模拟引擎流式输出，走完整的 JNI -> Java -> JS 事件链
    std::thread([depth]() {
        std::this_thread::sleep_for(std::chrono::milliseconds(120));
        JNIEnv* env = nullptr;
        if (g_jvm->AttachCurrentThread(&env, nullptr) != JNI_OK) return;
        emitEvent(env, "info", "{\"depth\":" + std::to_string(depth) +
                               ",\"scoreCp\":35,\"pv\":[\"h2e2\",\"h9e8\"],\"nps\":320000}");
        emitEvent(env, "bestmove",
                  "{\"bestmove\":\"h2e2\",\"ponder\":\"h9e8\",\"info\":{\"depth\":" +
                  std::to_string(depth) + ",\"scoreCp\":35,\"pv\":[\"h2e2\",\"h9e8\"]}}");
        g_jvm->DetachCurrentThread();
    }).detach();
}

JNIEXPORT void JNICALL
Java_com_xiangqicoach_app_NativeEnginePlugin_nativeStop(JNIEnv*, jobject) {
    // 真引擎：写 "stop\n"
}

JNIEXPORT void JNICALL
Java_com_xiangqicoach_app_NativeEnginePlugin_nativeQuit(JNIEnv*, jobject) {
    // 真引擎：写 "quit\n"，关闭子进程，释放全局引用
}

} // extern "C"

#include <jni.h>
#include <string>
#include <thread>
#include <atomic>
#include <sstream>
#include <unistd.h>
#include <sys/wait.h>
#include <cstdio>
#include <cstdlib>

/**
 * 原生引擎桥 —— 完整 UCI 进程版。
 *
 * 链路：Vue -> Capacitor -> NativeEnginePlugin(Kotlin) -> 本文件 -> pikafish 子进程(stdin/stdout)
 *
 * 本版真正启动 UCI 引擎进程、握手、写 position/go、解析 info/bestmove，并回调 Kotlin。
 * 接入真引擎：把 pikafish 可执行文件与 NNUE 放进 App filesDir/engine/，
 * 由 Kotlin 传入绝对路径即可；引擎缺失时 nativeInit 返回 false，前端自动降级到内置 JS 引擎。
 */
static JavaVM* g_jvm = nullptr;
static jobject g_plugin = nullptr;
static std::atomic<int> g_pid{-1};
static FILE* g_in = nullptr;
static FILE* g_out = nullptr;

static void emitEvent(const char* event, const std::string& json) {
    if (!g_plugin || !g_jvm) return;
    JNIEnv* env = nullptr;
    bool attached = false;
    if (g_jvm->GetEnv(reinterpret_cast<void**>(&env), JNI_VERSION_1_6) != JNI_OK) {
        if (g_jvm->AttachCurrentThread(&env, nullptr) != JNI_OK) return;
        attached = true;
    }
    jclass cls = env->GetObjectClass(g_plugin);
    jmethodID m = env->GetMethodID(cls, "emitFromNative", "(Ljava/lang/String;Ljava/lang/String;)V");
    jstring je = env->NewStringUTF(event);
    jstring jj = env->NewStringUTF(json.c_str());
    env->CallVoidMethod(g_plugin, m, je, jj);
    env->DeleteLocalRef(je); env->DeleteLocalRef(jj); env->DeleteLocalRef(cls);
    if (attached) g_jvm->DetachCurrentThread();
}

static void readerLoop() {
    char line[8192];
    while (g_pid.load() > 0 && g_out && fgets(line, sizeof(line), g_out)) {
        std::string s(line);
        while (!s.empty() && (s.back() == '\n' || s.back() == '\r')) s.pop_back();
        if (s.rfind("info ", 0) == 0 && s.find("score") != std::string::npos) {
            // 透传 UCI info 行，前端按字段解析
            emitEvent("info", std::string("{\"uci\":\"") + s + "\"}");
        } else if (s.rfind("bestmove ", 0) == 0) {
            std::istringstream iss(s);
            std::string tag, best, tok, ponder;
            iss >> tag >> best;
            while (iss >> tok) if (tok == "ponder") { iss >> ponder; break; }
            std::string json = "{\"bestmove\":\"" + best + "\"";
            if (!ponder.empty()) json += ",\"ponder\":\"" + ponder + "\"";
            json += "}";
            emitEvent("bestmove", json);
        }
    }
}

extern "C" {

JNIEXPORT jboolean JNICALL
Java_com_xiangqicoach_app_NativeEnginePlugin_nativeInit(
        JNIEnv* env, jobject thiz, jstring enginePath, jstring nnuePath, jint, jint) {
    env->GetJavaVM(&g_jvm);
    if (g_plugin) env->DeleteGlobalRef(g_plugin);
    g_plugin = env->NewGlobalRef(thiz);

    const char* path = env->GetStringUTFChars(enginePath, nullptr);
    const char* net = env->GetStringUTFChars(nnuePath, nullptr);
    if (access(path, X_OK) != 0) { // 引擎缺失，交给前端降级
        env->ReleaseStringUTFChars(enginePath, path);
        env->ReleaseStringUTFChars(nnuePath, net);
        return JNI_FALSE;
    }

    int in_pipe[2], out_pipe[2];
    if (pipe(in_pipe) != 0 || pipe(out_pipe) != 0) {
        env->ReleaseStringUTFChars(enginePath, path);
        env->ReleaseStringUTFChars(nnuePath, net);
        return JNI_FALSE;
    }
    pid_t pid = fork();
    if (pid == 0) {
        dup2(in_pipe[0], STDIN_FILENO);
        dup2(out_pipe[1], STDOUT_FILENO);
        close(in_pipe[1]); close(out_pipe[0]);
        setenv("NNUE_FILE", net, 1);
        execl(path, path, (char*)nullptr);
        _exit(127);
    }
    close(in_pipe[0]); close(out_pipe[1]);
    g_in = fdopen(in_pipe[1], "w");
    g_out = fdopen(out_pipe[0], "r");
    setvbuf(g_in, nullptr, _IOLBF, 0);
    g_pid.store(pid);
    env->ReleaseStringUTFChars(enginePath, path);
    env->ReleaseStringUTFChars(nnuePath, net);

    // UCI 握手
    char line[8192];
    fprintf(g_in, "uci\n"); fflush(g_in);
    while (fgets(line, sizeof(line), g_out)) if (std::string(line).rfind("uciok", 0) == 0) break;
    fprintf(g_in, "isready\n"); fflush(g_in);
    while (fgets(line, sizeof(line), g_out)) if (std::string(line).rfind("readyok", 0) == 0) break;

    std::thread(readerLoop).detach();
    return JNI_TRUE;
}

JNIEXPORT jstring JNICALL
Java_com_xiangqicoach_app_NativeEnginePlugin_nativeVersion(JNIEnv* env, jobject) {
    return env->NewStringUTF("pikafish-uci-bridge-0.2");
}

JNIEXPORT jboolean JNICALL
Java_com_xiangqicoach_app_NativeEnginePlugin_nativeIsReady(JNIEnv*, jobject) {
    return g_pid.load() > 0 ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT void JNICALL
Java_com_xiangqicoach_app_NativeEnginePlugin_nativeSetPosition(
        JNIEnv* env, jobject, jstring fen, jstring moves) {
    if (!g_in || g_pid.load() <= 0) return;
    const char* f = env->GetStringUTFChars(fen, nullptr);
    const char* m = env->GetStringUTFChars(moves, nullptr);
    if (m && m[0]) fprintf(g_in, "position fen %s moves %s\n", f, m);
    else fprintf(g_in, "position fen %s\n", f);
    fflush(g_in);
    env->ReleaseStringUTFChars(fen, f);
    env->ReleaseStringUTFChars(moves, m);
}

JNIEXPORT void JNICALL
Java_com_xiangqicoach_app_NativeEnginePlugin_nativeGo(
        JNIEnv*, jobject, jint depth, jint movetime, jint multipv) {
    if (!g_in || g_pid.load() <= 0) return;
    if (multipv > 1) fprintf(g_in, "setoption name MultiPV value %d\n", multipv);
    if (movetime > 0) fprintf(g_in, "go movetime %d\n", movetime);
    else fprintf(g_in, "go depth %d\n", depth);
    fflush(g_in);
}

JNIEXPORT void JNICALL
Java_com_xiangqicoach_app_NativeEnginePlugin_nativeStop(JNIEnv*, jobject) {
    if (g_in) { fprintf(g_in, "stop\n"); fflush(g_in); }
}

JNIEXPORT void JNICALL
Java_com_xiangqicoach_app_NativeEnginePlugin_nativeQuit(JNIEnv*, jobject) {
    if (g_in) { fprintf(g_in, "quit\n"); fflush(g_in); fclose(g_in); g_in = nullptr; }
    if (g_out) { fclose(g_out); g_out = nullptr; }
    pid_t pid = g_pid.exchange(-1);
    if (pid > 0) waitpid(pid, nullptr, WNOHANG);
}

} // extern "C"

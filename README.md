# 象棋教练（Xiangqi Coach）

带实时评分与解说的**人机对练**应用。对手是引擎、信息全部本地可见，因此不存在公平性/封号问题——这是它相对"真人平台辅助工具"的根本区别。

> **当前状态：应用框架骨架（v0.1.0）**
> 这是一套可运行的分层骨架：Web 前端可构建、规则引擎带 perft 自检、引擎桥三端统一、Android 原生层与 JNI 占位已就位。
> 引擎当前为 mock 实现，接入真实 Pikafish 指南见 [接入真引擎](#接入真实-pikafish-引擎)。

## 架构（参考皮卡鱼安卓版实测）

皮卡鱼 APK 的真实架构是 **Capacitor 容器 + Vue3/Vite 前端 + Kotlin 原生层 + JNI 调 `.so`**。本项目沿用同一分层：

```
┌─────────────────────────────────────────────┐
│  Vue 3 + Vite 前端（src/）                    │
│  棋盘渲染 / 点选走子 / 评估条 / 教练面板        │  ← UI 层
├─────────────────────────────────────────────┤
│  EngineBridge（src/engine/）                  │
│  统一 IEngine 接口 + info 流节流               │  ← 桥接层
├──────────────────┬──────────────────────────┤
│ Web 端            │ App 端                    │
│ NativeEngine.web  │ NativeEnginePlugin.kt     │  ← 平台适配
│ (mock / 未来WASM) │  ↓ JNI                    │
│                   │ native-engine.cpp         │
│                   │  ↓ 替换后                  │
│                   │ libpikafish.so + NNUE     │  ← 引擎
└──────────────────┴──────────────────────────┘
```

**核心决策：一套 UI，引擎后端可插拔。** UI 只依赖 `IEngine`，平台差异被压进 EngineBridge 一层，换引擎不动 UI。

## 目录结构

```
xiangqi-coach/
├── src/
│   ├── main.ts / App.vue / style.css       前端入口与主题
│   ├── engine/
│   │   ├── types.ts                        引擎协议类型（UCI 对齐）
│   │   └── EngineBridge.ts                 统一桥接 + info 节流
│   ├── plugins/
│   │   ├── NativeEngine.ts                 Capacitor 插件 TS 契约
│   │   └── NativeEngine.web.ts             Web 端实现（mock）
│   ├── chess/rules.ts                      自研规则引擎 + perft 自检
│   ├── components/                         棋盘 / 评估条
│   └── views/PracticeView.vue              对练页（主编排）
├── android/
│   └── app/src/main/
│       ├── java/.../MainActivity.kt        Capacitor 宿主
│       ├── java/.../NativeEnginePlugin.kt  引擎插件（Kotlin）
│       └── cpp/native-engine.cpp           JNI 桥（占位实现）
├── capacitor.config.ts
├── docs/architecture.md                    架构决策文档
└── package.json
```

## 本地运行

```bash
npm install
npm run dev        # 浏览器打开 http://localhost:5173，用 mock 引擎跑通全部 UI
npm run build      # 类型检查 + 生产构建，输出到 dist/
```

浏览器里可以直接走棋、看评估条、看着法记录、点"分析局面"——引擎是 mock，但整条事件链是真实的。

## 打包 Android

```bash
npm run build
npx cap add android     # 首次；已内置 android/ 目录时可跳过
npx cap sync android    # 把 dist/ 与插件配置同步到原生工程
# 用 Android Studio 打开 android/ 编译（需要 Android SDK + NDK，用于 C++ 引擎桥）
```

> 当前仓库的 `android/` 目录为**手工骨架**，用于展示分层与接口。首次真实构建前建议用 `npx cap add android` 生成标准工程后，再把 `NativeEnginePlugin.kt`、`cpp/`、`capacitor.config.ts` 中的插件配置合并进去。

## 接入真实 Pikafish 引擎

需要改的只有 **一个文件**：`android/app/src/main/cpp/native-engine.cpp`。Kotlin 插件与前端契约不用动。

1. 下载 Pikafish（UCI 引擎）与其 NNUE 权重，放入 `android/app/src/main/assets/engine/`
2. 在 `nativeInit` 里启动引擎进程或加载 `.so`，完成 UCI 握手（`uci` / `isready`）
3. 在 `nativeGo` 里用后台线程写 `go depth N multipv M`，逐行读 stdout
4. 解析 `info` 与 `bestmove` 行成 JSON，调用 `emitEvent(env, "info"/"bestmove", json)` 推给前端
5. CMakeLists 里 `target_link_libraries` 追加 Pikafish 库

前端侧的 `scoreCp`、`pv`、着法高亮会自动工作。

## 规则引擎

自研规则（`src/chess/rules.ts`），覆盖：各兵种走法、九宫限制、塞象眼、马腿、将帅照面、自杀着法过滤、将/帅将军判定。带 `perft()` 递归计数与 `runPerftSelfTest()`。

**用 perft 做回归**：开局基准 `perft(1)=44`、`perft(2)=1920`、`perft(3)=79666`。规则改动后跑一遍，数值不符即引入 bug。

> 不使用 `python-chess`——它只支持国际象棋。

## 合规说明

- **引擎 Pikafish 为 GPLv3**：个人自用无影响；一旦分发（哪怕免费），整个程序须开源。
- 本项目只做**本地人机对练与复盘**，不连接任何真人棋牌平台，不涉及账号辅助。
- 对手强度调节建议用 MultiPV + 温度采样（见产品设计方案 v0.2），而非单纯限深度。

## 路线图

- [x] Capacitor + Vue3 + Vite + Vant 分层骨架
- [x] 引擎桥统一接口（native/wasm/mock）
- [x] 自研规则 + perft 自检
- [x] 棋盘点选走子 + 评估条 + 教练面板（demo）
- [ ] 接入真实 Pikafish（JNI）
- [ ] cp loss 逐手评分（before/after）
- [ ] L1 模板解说 → L2 战术要素 → L3 LLM
- [ ] 能力画像 / 错题本 / 分支树

详见 [产品设计方案 v0.2](../../象棋教练产品设计方案_v0.2.md)。

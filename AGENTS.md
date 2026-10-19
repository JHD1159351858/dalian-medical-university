# 项目上下文

## 项目来源与重建依据

本项目由用户上传的 `hospital-agent-platform-source-20261019.zip` 源码包导入重建。源项目为 React + Vite + Express 全栈应用，本平台重建采用 Next.js 16 App Router 模板，前端与 API 均走 Next.js，Express 后端迁移为 Next.js Route Handlers。

源项目业务定位：面向临床问诊训练的 3D 医院情境模拟。学生以接诊医生身份在三维场景中移动，靠近患者后开展文字问诊；系统不提供评分、诊断结论、处方或治疗方案。

## 核心功能模块

| 模块 | 路径/文件 | 说明 |
|------|-----------|------|
| 小镇首页 | `src/app/page.tsx` / `src/home/*` | 3D 医院小镇背景，点击「开始实训」进入医院场景 |
| 3D 医院场景 | `src/scene/*` | Three.js / React Three Fiber 医院、患者、医生角色与交互 |
| 问诊流程 | `src/app/training/page.tsx` / `src/diagnosis/*` | 患者主诉、医生提问、AI 回复、语音朗读 |
| 体格检查 | `src/exam/*` | 腹部触诊等体格检查流程 |
| 临床模块 | `src/clinical/*` | 中医四诊、辅助检查、临床诊断、处置方案 |
| 后端 API | `src/app/api/*` | `/api/health`、SSE `/api/chat`、TTS `/api/tts`、WebSocket `/api/speech-stream` |

## 状态机（src/app/training/flow.ts）

主要阶段：`loading -> ready -> walking -> waiting -> patientSpeech -> doctorDialog -> diagnosis -> physicalExam -> fourDiagnosis -> auxiliaryExam -> clinicalDiagnosis -> treatment -> exiting -> completed`

关键事件：`WORLD_READY`、`START`、`ARRIVED`、`INTERACT`、`PATIENT_SPEECH_DONE`、`BEGIN_DIAGNOSIS`、`BEGIN_EXAM`、`BEGIN_FOUR_DIAGNOSIS`、`BEGIN_AUXILIARY_EXAM`、`BEGIN_CLINICAL_DIAGNOSIS`、`BEGIN_TREATMENT`、`COMPLETE_CASE`、`BACK`、`FINISH`、`DEPARTED`、`RESET`。

## 环境变量

| 变量 | 来源 | 用途 |
|------|------|------|
| `DEPLOY_RUN_PORT` | 平台注入 | 服务监听端口 |
| `CODER_PROJECTS_DOMAIN` | 平台注入 | 对外域名 |
| `CODER_PROJECTS_ENV` | 平台注入 | 环境标识 |
| `OPENAPI_BASE_URL` | 平台/业务配置 | Coze API 基地址 |
| `OPENAPI_TOKEN` | 平台/业务配置 | Coze API 鉴权 |
| `PATIENT_BOT_ID` | 平台/业务配置 | 患者智能体 ID |
| `PATIENT_VOICE_ID` | 平台/业务配置 | 患者语音音色 ID |

**注意**：禁止将密钥写进前端代码或 public，服务端 API 负责所有上游调用。

### 版本技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4
- **3D**: three, @react-three/fiber, @react-three/drei

## 目录结构

```
├── public/                 # 静态资源
├── scripts/                # 构建与启动脚本
│   ├── build.sh            # 构建脚本
│   ├── dev.sh              # 开发环境启动脚本
│   ├── prepare.sh          # 预处理脚本
│   └── start.sh            # 生产环境启动脚本
├── src/
│   ├── app/                # 页面路由与布局
│   ├── components/ui/      # Shadcn UI 组件库
│   ├── hooks/              # 自定义 Hooks
│   ├── lib/                # 工具库
│   │   └── utils.ts        # 通用工具函数 (cn)
│   └── server.ts           # 自定义服务端入口
├── next.config.ts          # Next.js 配置
├── package.json            # 项目依赖管理
└── tsconfig.json           # TypeScript 配置
```

- 项目文件（如 app 目录、pages 目录、components 等）默认初始化到 `src/` 目录下。

## 包管理规范

**仅允许使用 pnpm** 作为包管理器，**严禁使用 npm 或 yarn**。
**常用命令**：
- 安装依赖：`pnpm add <package>`
- 安装开发依赖：`pnpm add -D <package>`
- 安装所有依赖：`pnpm install`
- 移除依赖：`pnpm remove <package>`

## 开发规范

### 编码规范

- 默认按 TypeScript `strict` 心智写代码；优先复用当前作用域已声明的变量、函数、类型和导入，禁止引用未声明标识符或拼错变量名。
- 禁止隐式 `any` 和 `as any`；函数参数、返回值、解构项、事件对象、`catch` 错误在使用前应有明确类型或先完成类型收窄，并清理未使用的变量和导入。

### next.config 配置规范

- 配置的路径不要写死绝对路径，必须使用 path.resolve(__dirname, ...)、import.meta.dirname 或 process.cwd() 动态拼接。

### 渲染策略规范（性能）

> 资源受限的容器环境下，渲染策略直接决定内存与 CPU 占用。以下规范已落成 eslint 规则（见 `eslint.config.mjs` 的 `perfRules`），违反会被 `pnpm validate` 拦截。

- **优先级 SSG > ISR > SSR**：默认优先静态化，能用 `generateStaticParams` 预渲染的不走运行时 SSR。
- **禁止无脑 `cache: 'no-store'`**：它让每个请求都走 SSR，在资源受限容器上是内存与 CPU 双重浪费。确需实时数据请在页面级声明 `export const dynamic = 'force-dynamic'` 并注释原因。
- **`revalidate` 建议 >= 300 秒**：过短会频繁触发后台重建；数据变更后改用 `revalidatePath()` / `revalidateTag()` 精准失效。
- **禁止请求路径上的同步 I/O**（`fs.*Sync`）：会阻塞事件循环线程，改用 `fs/promises` 并加缓存。

### 服务端性能约束（资源受限容器）

> 目标运行环境为**资源受限的容器**（CPU/内存配额由平台注入，规格可能变化）；以下约束防止内存配置回退。

- **严禁设置超过容器内存配额的堆值**（如把 `--max-old-space-size` 写死成大于配额的值）。堆上限一旦超过 cgroup 红线，V8 会迟迟不触发 GC，进程 RSS 越线后被内核直接 SIGKILL（无 JS 报错、无堆栈、日志戛然而止）。
- **堆上限必须按容器可用内存动态探测**，统一走 `scripts/lib/heap.sh`（cgroup 优先）；严禁用 `/proc/meminfo` 直接探测——容器内它不被 namespace 隔离，读到的是宿主机内存，会算出远超 limit 的危险值。
- **非法/超限值一律 clamp，不得 `exit 1`**：避免小内存配额下平台注入的合理值反被拒绝、构建/启动直接失败且无兜底。
- `--max-old-space-size` 只约束 V8 老生代，**管不住 Turbopack 的 Rust/NAPI 原生内存**（实测占 dev 进程约 78%）；调堆不等于解决 OOM，原生内存需靠降低常驻（直调 tsx 去 pnpm 包装层、dev 关图片优化、生产关页面预加载）来削。

### Hydration 问题防范

1. 严禁在 JSX 渲染逻辑中直接使用 typeof window、Date.now()、Math.random() 等动态数据。**必须使用 'use client' 并配合 useEffect + useState 确保动态内容仅在客户端挂载后渲染**；同时严禁非法 HTML 嵌套（如 <p> 嵌套 <div>）。
2. **禁止使用 head 标签**，优先使用 metadata，详见文档：https://nextjs.org/docs/app/api-reference/functions/generate-metadata
   1. 三方 CSS、字体等资源可在 `globals.css` 中顶部通过 `@import` 引入或使用 next/font
   2. preload, preconnect, dns-prefetch 通过 ReactDOM 的 preload、preconnect、dns-prefetch 方法引入
   3. json-ld 可阅读 https://nextjs.org/docs/app/guides/json-ld

## UI 设计与组件规范 (UI & Styling Standards)

- 模板默认预装核心组件库 `shadcn/ui`，位于`src/components/ui/`目录下
- Next.js 项目**必须默认**采用 shadcn/ui 组件、风格和规范，**除非用户指定用其他的组件和规范。**

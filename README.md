# 大连医科大学临床问诊实训

基于 Next.js 16、React 19 和 Three.js 的医院情境教学项目。合并保留平台版的路由、嵌入 SDK 和 Linux 容器启动脚本，整合本地版的小镇、人物移动与门禁、六个临床实训模块及教学素材。

## 环境与启动

需要 Node.js >=22.12.0、pnpm >=9。复制 `.env.example` 为 `.env`，填写自己的 Coze 配置。真实密钥不在仓库中。

Linux / 内部平台：

```bash
pnpm install --frozen-lockfile
pnpm dev
```

开发默认端口为 5000，平台可通过 `DEPLOY_RUN_PORT` 指定端口。生产构建和启动：

```bash
pnpm build
pnpm start
```

平台入口为 Next.js 自定义服务 `src/server.ts`，同时支持页面、HTTP API 和 `/api/speech-stream` WebSocket。使用上述启动入口以保留双向流式语音能力。

Windows 本地开发也可使用保留的 Vite + Express 入口：

```bash
pnpm dev:local
```

本机未配置超星登录时，运行 `pnpm preview:clinic` 并打开 <http://127.0.0.1:5177/>，可直接查看诊室、抽取患者并体验病例问诊。此预览仅监听本机，使用本地病例数据，接诊记录不写入云端。配置项目的扣子语音凭据后，本机预览也会使用各患者的专属音色，问诊支持双向流式播放。

此入口的 API 默认为 3001，页面端口以 Vite 输出为准；`pnpm build:local` 可构建本地前端至 `dist/local`，平台部署仍使用 `pnpm build`。

## 功能与病例

- 首页三维医院小镇、车辆避让、医生与患者移动、接诊和门禁。
- 问诊、体格检查、中医四诊、辅助检查、诊断记录、处置方案六个模块。
- 舌诊动画及固定病例教学配图、成人三指布指练习、患者语声观察。
- 问诊文本 SSE 连续显示，语音独立采用扣子双向流式合成；静音或停止朗读不影响文字输出。
- 六位患者各有与主诉对应的开场白。王旭用固定男声说“大夫，我肚子左上边这块儿疼。”学生追问后，他再说明病程和饮食关系。
- 处置方案根据病例参考评价，结果供教师复核。

`server/case.json` 是统一病例来源；未确认的呼吸困难等信息不作为当前症状回答。Next API 和本地 Express API 共享病例及服务逻辑。音色配置在 `src/diagnosis/voiceProfiles.ts`，病例与评价资料不放入 `public/`。

## 配置

| 环境变量 | 用途 |
| --- | --- |
| `OPENAPI_BASE_URL` | Coze API 基地址 |
| `OPENAPI_TOKEN` | 服务端令牌，语音需有 `createSpeech` 权限 |
| `PATIENT_BOT_ID` | 外部患者问答智能体 |
| `PATIENT_VOICE_ID` | 默认患者音色，示例已配置王旭男声 |
| `EVALUATION_BOT_ID` | 可选的处置方案补充评价智能体 |
| `DEPLOY_RUN_PORT` | 平台服务端口，默认 5000 |
| `PORT` | 本地 API 端口，默认 3001 |

已知病例问题可由本地规则回答；外部问答、语音和补充评价需要相应服务配置。仓库保留平台嵌入能力，尚未实现超星 SSO / Supabase 会话桥接。

## 验证与资源

```bash
pnpm test:unit
pnpm validate
pnpm exec playwright test -c playwright.next.config.ts
```

`tests/` 包含病例、四诊、语音和 API 测试。`public/models/`、本地 Draco 解码器及教学图片已随仓库提供。模型来源和再导出说明见 [ASSETS.md](ASSETS.md)，编辑源文件位于 `authoring/`。

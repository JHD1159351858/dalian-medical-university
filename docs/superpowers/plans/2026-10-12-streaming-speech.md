# 双向流式语音合成实施计划

**Goal:** 问诊文字连续显示，同时将增量文字经后端送至扣子 WebSocket，播放返回的增量音频。

**Architecture:** 保留聊天 SSE 和固定主诉的 REST 语音。问诊新增 `/api/speech-stream` WebSocket，服务端保管令牌并转发扣子协议，浏览器用同一个 AudioContext 顺序播放 PCM。文字显示不受语音准备或播放进度限制。

**Tech Stack:** React、TypeScript、Express、ws、Web Audio、Vitest、Playwright。

## 约束与协议

- 不修改病例、场景或体格检查；密钥仅在 `.env`，不进入前端和日志。
- 客户端发送 `start {voiceId,speed,emotion}`，收到 `ready {sampleRate}` 后发送 `append {text}` 和 `finish`；接收 `audio {data}`、`done`、`error {error}`。
- PCM 单声道、16 位小端、24000 Hz；`done` 后仍等待本地音频队列播放完。
- 保守按单连接 1024 UTF-8 字节接续长回复，保留字符和音频顺序。这是兼容策略，官方未明确累计限制。
- 停止朗读、静音或切换场景时关闭连接、停止已排程音频；语音失败不阻塞文字。

## 实施与验证

- [x] 后端：`server/speechStream.mjs`、`server/index.mjs`，添加 `ws`。先编写真实本地 WebSocket 测试，验证握手、增量音频、鉴权、取消、错误和长度限制，再实现转发。
- [x] 前端：`src/diagnosis/speech.ts`，替换问诊分句 REST 队列。先测试文字缓冲、PCM 顺序播放、停止和长回复接续，再实现 WebSocket 和 AudioContext。
- [x] 显示：`src/App.tsx` 每个 SSE delta 直接更新记录，语音回调只更新播放状态；`vite.config.ts` 开启 WebSocket 代理。
- [x] 浏览器：更新 `tests/e2e.spec.ts`，挂起音频时文字仍连续出现；停止/静音后文字继续，返回场景关闭连接。
- [x] 最终：运行相关单元测试、TypeScript 检查和选定问诊 E2E；用真实配置验证扣子连接和非空音频，检查本地开发服务。

验证结果：17 个相关单元测试、2 个问诊浏览器测试和 TypeScript 检查通过。真实语音代理返回 62 个音频片段，文字提交完成前已收到音频；真实聊天返回 23 个文字增量并正常完成。

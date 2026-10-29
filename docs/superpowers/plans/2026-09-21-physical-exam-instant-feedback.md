# 体格检查即时语音反馈 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让腹部触诊在松开鼠标后立即完成本地反馈，并使用当前患者音色的预缓存短语播放语音。

**Architecture:** 保留现有 `resolvePalpationResponse` 本地判定。客户端在进入体格检查时并行预加载三种固定反馈，使用内存缓存按患者和音色区分；松开时只更新 React 状态并播放缓存音频。服务端扩展 `/api/tts` 接收可选 `voiceId`，并对相同音色、文本、情绪和语速做进程内缓存。

**Tech Stack:** React 19, TypeScript, Express 5, Vitest, Playwright, Coze speech API.

## Global Constraints

- 触诊判定继续使用 `resolvePalpationResponse` 的区域和按压时长规则。
- 触诊反馈不调用聊天模型。
- 语音服务失败不得阻塞文字、表情和记录更新。
- 不回退到浏览器系统语音播放触诊反馈。
- 患者音色通过 `voiceId` 配置，缓存键必须包含患者和音色信息。

---

### Task 1: 扩展患者音色和触诊反馈接口

**Files:**
- Create: `src/diagnosis/voiceProfiles.ts`
- Modify: `src/diagnosis/speech.ts`
- Modify: `src/exam/palpation.ts`
- Test: `tests/palpation.test.ts`

**Interfaces:**
- `PATIENT_VOICE_PROFILE` 提供当前病例的 `patientId`、`voiceId`、`speed`。
- `preloadSpeech(text, options)` 返回 `Promise<boolean>`。
- `playCachedSpeech(text, options)` 返回 `boolean`。
- `palpationSpeech(response)` 返回 `{ text: string; emotion: SpeechEmotion }`。

- [x] **Step 1: 添加当前患者音色配置和反馈短语映射测试。**
- [x] **Step 2: 运行 `npx vitest run tests/palpation.test.ts`，确认新接口测试失败。**
- [x] **Step 3: 实现音色配置、缓存键、预加载和缓存播放；保留现有 `speakChinese` 给问诊使用。**
- [x] **Step 4: 运行 `npx vitest run tests/palpation.test.ts`，确认通过。**

### Task 2: 让 TTS 服务支持按音色请求和缓存

**Files:**
- Modify: `server/index.mjs`
- Modify: `tests/api.test.ts`

**Interfaces:**
- `/api/tts` 接收 `voiceId`、`emotion`、`speed`。
- 未传 `voiceId` 时继续使用 `COZE_VOICE_ID`，保持现有调用兼容。
- 相同缓存键命中时直接返回 `audio/mpeg`，不重复请求 Coze。

- [x] **Step 1: 增加测试，验证 voiceId 被转发，重复请求只调用一次上游。**
- [x] **Step 2: 运行 `npx vitest run tests/api.test.ts`，确认缓存测试失败。**
- [x] **Step 3: 添加请求参数校验、进程内 TTS 缓存和命中返回。**
- [x] **Step 4: 运行 `npx vitest run tests/api.test.ts`，确认通过。**

### Task 3: 接入体格检查的即时反馈和预加载

**Files:**
- Modify: `src/exam/PhysicalExamPage.tsx`
- Modify: `src/exam/ExamScene.tsx`（仅在需要时调整按压状态显示）
- Test: `tests/palpation.test.ts`

**Interfaces:**
- 页面挂载时并行调用三种固定反馈的 `preloadSpeech`。
- `finishPress` 先执行 `setPressing(false)`、`setLastResponse`、`setHistory`，再调用 `playCachedSpeech`。

- [x] **Step 1: 添加测试覆盖三种反馈文本和情绪映射。**
- [x] **Step 2: 将 `PhysicalExamPage` 的 `announce` 改为缓存播放；预加载失败只记录状态，不改变本地反馈。**
- [x] **Step 3: 运行 `npx vitest run tests/palpation.test.ts tests/api.test.ts`。**
- [x] **Step 4: 运行 `npm run build`，确认 TypeScript 和生产构建通过。**

### Task 4: 端到端验证

**Files:**
- Modify: `tests/e2e.spec.ts`（仅添加必要的触诊页面验证）

- [x] **Step 1: 验证按压松开后反馈文字立即更新，且触诊反馈请求只发生在预加载阶段。**
- [x] **Step 2: 运行 `npm test`。**
- [x] **Step 3: 运行 `npx playwright test tests/e2e.spec.ts --grep "physical|palpation" --reporter=line`；若当前 E2E 没有触诊入口，则使用已有流程进入体格检查并补充最小测试。**
- [x] **Step 4: 运行 `npm run build` 并记录最终结果。**


# 首页视觉整改 Implementation Plan

> **For agentic workers:** Execute the checked tasks in this session. Each task ends with focused verification.

**Goal:** 保留 3D 小镇首页交互，同时以设计背景图为全屏底图，并补齐设计图中的品牌、文案、卖点、入口和页脚视觉层。

**Architecture:** `TownHome` 继续负责首页状态和进入训练；`TownBackground` 保持 3D 小镇渲染。将背景图片复制到 `public/home-background.png`，通过 `.town-home` 背景层展示；新增的语义化 HTML 只负责设计图内容和无障碍标签，现有按钮与预加载逻辑不变。

**Tech Stack:** React 19, TypeScript, CSS, Vite, Playwright.

## Global Constraints

- 保留 `startTraining`、3D 小镇资源加载、加载失败和进入医院过渡行为。
- 背景图使用 `verification/设计图/首页/首页空白背景图.png`。
- 设计层必须在桌面端与小屏幕端可读，开始按钮保持可点击。

---

### Task 1: Add homepage visual regression assertions

**Files:**
- Modify: `tests/e2e.spec.ts`

- [x] Add assertions to the existing town homepage test for `.town-home`, background image URL, brand text, hero title, three feature labels, simulation label, and start CTA.
- [x] Run `npx playwright test --grep "town homepage animates" --reporter=line` and confirm the new assertions fail before implementation because the elements/background are absent.

### Task 2: Add the supplied background asset

**Files:**
- Create: `public/home-background.png`

- [x] Copy `verification/设计图/首页/首页空白背景图.png` to `public/home-background.png`.
- [x] Confirm the copied file is readable and retains 1742×903 dimensions.

### Task 3: Implement the homepage design layer

**Files:**
- Modify: `src/home/TownHome.tsx`
- Modify: `src/home/TownBackground.tsx`
- Modify: `src/styles.css`

- [x] Keep town animation, `startTraining`, and the transition overlay; enable transparent rendering, hide the outer `HX_ground` mesh, and fit the town to narrow viewports.
- [x] Add semantic header branding, right simulation badge, left hero title, feature list, and footer copy matching the approved design.
- [x] Keep the existing `开始实训` button and `实训入口` section; style its central card to match the reference.
- [x] Use `home-background.png` on `.town-home`; keep 3D canvas above the background and soften it with a transparent blend layer.
- [x] Add responsive rules that reduce title/feature density while keeping the CTA visible.

### Task 4: Verify the complete homepage flow

**Files:**
- No additional files.

- [x] Run `npm run build`.
- [x] Run `npx playwright test --grep "town homepage animates|starting training performs an aerial dive" --reporter=line`.
- [x] Inspect a fresh screenshot to confirm the background, 3D town, text layer, and CTA coexist.

## Verification results

- Production build passed.
- Both homepage E2E cases passed: animated town / hospital handoff and aerial dive.
- Inspected desktop (1742×903) and mobile (390×844) screenshots; narrow screens retain the full town and start button without text overlapping the model.
- Screenshots: `verification/homepage-redesign.png`, `verification/homepage-redesign-mobile.png`.

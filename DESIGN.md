# 临床问诊训练台 · DESIGN

## 1. Visual Theme & Atmosphere

方向：临床工作台（Clinical Desk）。页面应该像一个安静、可靠的教学终端，而不是传统后台或堆叠卡片。核心体验是让学生快速看清患者身份、当前主诉和下一步提问。

关键词：雾白工作面、深青操作色、柔和边界、身份优先、稳定节奏。

问诊页使用三段式工作区：左侧患者身份与三维形象，中间对话记录，右侧医生身份与主诉摘要。顶部只保留导航和接诊控制，避免把重要内容挤到角落。

交互档位：L1 精致静态。允许淡入、状态点呼吸和按钮反馈；不引入滚动驱动、光标跟随或额外 WebGL 场景。

## 2. Color Palette & Roles

```css
:root {
  --desk-bg: #e9f1f2;
  --desk-surface: #f8fbfb;
  --desk-surface-soft: #eef6f6;
  --desk-ink: #173d49;
  --desk-muted: #70878f;
  --desk-line: #d4e4e6;
  --desk-accent: #19758a;
  --desk-accent-dark: #0d4d66;
  --desk-accent-soft: #dceff1;
  --desk-success: #3b9079;
  --desk-danger: #a64747;
  --desk-shadow: 31 71 81;
}
```

背景使用 `--desk-bg`，工作区使用 `--desk-surface`，次级信息面使用 `--desk-surface-soft`。深青色只用于主要操作、发送按钮和当前状态，红色只用于重置和错误。

## 3. Typography Rules

中文正文：`"Noto Sans SC", "Microsoft YaHei", sans-serif`；标题：`"Noto Serif SC", "Songti SC", SimSun, serif`；英文标签：`Arial, sans-serif`。

标题字距 0.04em，英文小标签字距 0.14–0.2em。正文最小 13px，移动端正文不低于 13px，行高 1.65–1.75。禁止使用全大写中文或过度加粗正文。

层级：页面标题 19px，患者姓名 18px，主诉 20–27px，正文 13px，说明 11px，英文标签 8–10px。

## 4. Component Stylings

卡片：背景使用 `--desk-surface`，1px `--desk-line` 边界，圆角 10px，阴影 `0 12px 30px rgba(var(--desk-shadow), .08)`。身份卡允许三维头像铺满，但文字层必须在上方。

按钮：主要按钮使用 `--desk-accent-dark`，高度至少 35px，圆角 5px；hover 提亮到 `--desk-accent`；active 向下 1px；focus-visible 使用 3px 半透明青色外描边；disabled 降低至 45% 不透明度并取消指针。

标签：浅青背景、细边界、3px 圆角，作为事实信息使用，禁止用标签装饰无关内容。

对话气泡：患者消息使用浅青工作面，医生消息使用深青背景白字；患者和医生的姓名放在气泡上方，消息宽度不超过 78%。

## 5. Layout Principles

桌面内容最大宽度 1480px，页面内边距 18–26px，区块间距 14px。网格为 `患者 27% / 对话 1fr / 医生与摘要 25%`。对话区纵向占满主要高度，输入框固定在对话底部。

宽度小于 1040px 时收缩为患者与对话双栏；宽度小于 680px 时使用头像双卡、摘要和对话纵向布局。所有触摸操作目标至少 44px。

## 6. Depth & Elevation

只使用三层深度：页面背景、工作卡片、操作按钮。卡片阴影保持低透明度，不使用黑色硬阴影。三维头像区域使用透明渐变承接卡片底部，避免额外边框。

## 7. Animation & Interaction

采用 L1：问诊页出现时工作区淡入 280ms；状态点在 `thinking` 和 `talking` 时使用 1.2s 呼吸；按钮 hover 只改变背景和轻微位移；消息列表新增消息平滑滚动到底部。

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    transition-duration: .01ms !important;
    scroll-behavior: auto !important;
  }
}
```

## 8. Do's and Don'ts

- Do 保持对话区为页面视觉中心。
- Do 把患者身份、主诉和问诊目标放在首屏可见区域。
- Do 用颜色表达状态，用文字表达动作。
- Do 为头像保留足够呼吸空间。
- Do 让错误信息靠近输入区出现。
- Don't 把每个信息都包成独立方框。
- Don't 使用大面积纯白空洞区域。
- Don't 使用高饱和渐变或玻璃模糊覆盖对话文本。
- Don't 用红色表达普通状态。
- Don't 把主要操作藏在小图标里。
- Don't 在移动端让卡片横向溢出。

## 9. Responsive Behavior

桌面（≥1041px）使用三栏工作区。平板（681–1040px）收缩为患者栏和对话栏，右侧摘要合并到患者栏底部。移动端（≤680px）顶部操作保留返回、结束接诊和重置；患者与医生头像并排，主诉摘要位于其后，对话输入区保持固定可见。

移动端页面允许纵向滚动，但不允许横向滚动。头像视图最小高度 120px，发送按钮最小 48px，文本域至少两行。`prefers-reduced-motion` 时取消入场和状态动画。

# 腹部触诊训练页 · DESIGN

> 用“临床工作台 + 触诊地图”把鼠标动作变成可读的体格检查反馈。

## 1. Visual Theme & Atmosphere

**Style**：临床工作台（Clinical Desk）与柔和医学插画的结合。页面重点落在腹部九区和患者反馈，左右信息栏只承担身份与记录。

**Keywords**：雾白、深青、珊瑚提示、柔和圆角、临床可靠、直观反馈、空间呼吸、少量动效。

**Tone**：安静、可信、带一点“教学演示”的清晰度，不做冷冰冰的后台表格。

**Interaction Tier**：L1 精致静态 + 直接操作反馈；不使用滚动驱动动效。

**Design reference**：桌面主视图见 [`physical-exam-concept.svg`](./physical-exam-concept.svg)。

## 2. Color Palette & Roles

```css
:root {
  --exam-bg: #eaf4f3;
  --exam-surface: #f8fcfb;
  --exam-surface-alt: #e8f3f0;
  --exam-border: #cfe3df;
  --exam-ink: #173d49;
  --exam-muted: #6f8586;
  --exam-accent: #2f8178;
  --exam-coral: #e27e6b;
  --exam-coral-strong: #d85b51;
  --exam-success: #46a88d;
  --exam-warning: #e2a05f;
  --exam-danger: #b9564e;
  --exam-bg-rgb: 234, 244, 243;
  --exam-ink-rgb: 23, 61, 73;
  --exam-coral-rgb: 226, 126, 107;
}
```

所有页面颜色通过变量引用。深青只用于导航、主要操作与标题；珊瑚只表达压痛、疼痛或需要注意的触诊结果；绿色表达记录完成。

## 3. Typography Rules

```css
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700&family=Noto+Serif+SC:wght@600;700&display=swap');
```

| Role | Font | Size | Weight | Line Height | Letter Spacing |
|------|------|------|--------|-------------|----------------|
| Page title | Noto Serif SC | 34px | 700 | 1.25 | 0.02em |
| Section title | Noto Sans SC | 28px | 700 | 1.3 | 0.01em |
| Patient name | Noto Sans SC | 26px | 700 | 1.3 | 0 |
| Body | Noto Sans SC | 14–16px | 400–500 | 1.7 | 0.02em |
| Label | Arial, Noto Sans SC | 11–13px | 600 | 1.4 | 0.12em |

正文使用 `Noto Sans SC, Microsoft YaHei, sans-serif`，标题可以使用 `Noto Serif SC, Songti SC, serif`。标题不使用渐变和文字阴影；通过字号与留白建立层级。

## 4. Component Stylings

### Buttons

```css
.exam-button {
  min-height: 44px;
  border: 1px solid transparent;
  border-radius: 22px;
  padding: 0 22px;
  color: var(--exam-surface);
  background: var(--exam-ink);
  transition: background .18s ease, transform .18s ease, box-shadow .18s ease;
}
.exam-button:hover { background: var(--exam-accent); transform: translateY(-1px); }
.exam-button:active { transform: translateY(1px); }
.exam-button:focus-visible { outline: 3px solid rgba(var(--exam-coral-rgb), .35); outline-offset: 3px; }
.exam-button:disabled { opacity: .45; cursor: not-allowed; transform: none; }
.exam-button--coral { background: var(--exam-coral); }
```

### Cards and map

卡片使用 `var(--exam-surface)`、`border: 1px solid var(--exam-border)` 和 28–40px 圆角；地图使用更大圆角与浅青底面，让九区腹部成为视觉中心。当前区域使用珊瑚填充、白色虚线边界和小型疼痛标记。

### Feedback badges

反馈徽章用浅珊瑚底承载“疼痛”，用浅绿色底承载“已记录”，并同时显示文字，不依赖颜色单独传达结果。

## 5. Layout Principles

桌面最大宽度 1488px，页面内边距 56px。主工作区为 `320px / minmax(560px, 1fr) / 348px`，列间距 30px。中间地图卡片保持最少 680px 宽，确保九区标签和手势提示可读。

底部动作条横跨全宽，固定在内容之后而非覆盖地图。移动端顺序改为：患者信息 → 腹部地图 → 患者反馈 → 操作按钮。

## 6. Depth & Elevation

| Level | Treatment | Use |
|-------|-----------|-----|
| Flat | `background: var(--exam-bg)` | 页面底色 |
| Subtle | `0 12px 30px rgba(var(--exam-ink-rgb), .08)` | 三个主卡片 |
| Elevated | `0 16px 36px rgba(var(--exam-ink-rgb), .12)` | 主地图容器与底部动作条 |

禁止黑色硬阴影和大面积玻璃模糊；页面靠色温、圆角和轻阴影区分层级。

## 7. Animation & Interaction

**Motion philosophy**：让“按下、持续、松开”成为唯一需要被感知的动效。

- 页面入场：工作区 `opacity + translateY(8px)`，280ms。
- 区域 hover：边界变深，地图区域轻微 `scale(1.01)`。
- Pointer down：当前区域出现珊瑚光晕，患者头像切换痛苦表情，播报“这里有点疼”。
- 按住 ≥ 1 秒再 release：显示“反跳痛测试”，松开瞬间使用一次 `scale(.98) → scale(1)`，反馈更强；实际病例仍记录“无反跳痛”。
- `pointercancel`、窗口失焦或触摸被系统中断时，立即结束本次按压，不写入反跳结果。

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

### Do

- Do 让九区腹部保持页面最大视觉权重。
- Do 同时标注“患者左/患者右”，避免解剖方向误解。
- Do 让按压反馈出现在患者头像、文字和记录三处。
- Do 把真实病例的“无反跳痛”和教学阳性示例明确分开。
- Do 让触摸目标至少 44×44px。
- Do 用文字说明操作阈值：“按住 ≥ 1 秒后松开”。

### Don't

- ❌ Don't 把腹部地图拆成 9 个等大的后台按钮。
- ❌ Don't 用红色表示普通选中状态。
- ❌ Don't 把患者头像做成无表情的静态装饰。
- ❌ Don't 用弹窗遮挡九区地图。
- ❌ Don't 让教学演示覆盖真实病例结论。
- ❌ Don't 使用高饱和渐变、玻璃模糊或硬阴影。
- ❌ Don't 用图标替代“按压/松开/反跳痛”等关键文字。
- ❌ Don't 在移动端保留三栏横向布局。

## 9. Responsive Behavior

| Name | Width | Key Changes |
|------|-------|-------------|
| Desktop | > 1040px | 三栏工作台，底部动作条横跨全宽 |
| Tablet | 681–1040px | 患者信息缩为顶部横栏，地图与反馈两栏 |
| Mobile | ≤ 680px | 单列；患者卡、地图、反馈依次排列；底部按钮固定为双按钮 |

触摸目标最小 44px；移动端地图用 `aspect-ratio` 保持腹部轮廓完整，九区标签缩小但不隐藏。页面允许纵向滚动，禁止横向溢出。

```css
@media (max-width: 1040px) {
  .exam-layout { grid-template-columns: 1fr 1.15fr; }
  .exam-patient { grid-column: 1 / -1; }
}
@media (max-width: 680px) {
  .exam-layout { display: block; }
  .exam-map, .exam-feedback { margin-top: 16px; }
  .exam-actions { position: sticky; bottom: 12px; }
}
```

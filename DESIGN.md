# 临床问诊训练台 · DESIGN

## 气质与意象

临床工作台：安静、可靠的教学终端。让学生快速看清患者身份、当前主诉和下一步提问。关键词：雾白工作面、深青操作色、柔和边界、身份优先、稳定节奏。

## 配色方案

- `--desk-bg`: #e9f1f2 — 雾白墙面
- `--desk-surface`: #f8fbfb — 工作台面
- `--desk-surface-soft`: #eef6f6 — 次级信息面
- `--desk-ink`: #173d49 — 正文墨色
- `--desk-muted`: #70878f — 辅助文字
- `--desk-line`: #d4e4e6 — 分割线
- `--desk-accent`: #19758a — 深青操作色
- `--desk-accent-dark`: #0d4d66 — 主要按钮
- `--desk-accent-soft`: #dceff1 — 浅青背景
- `--desk-success`: #3b9079 — 成功状态
- `--desk-danger`: #a64747 — 重置/错误

## 字体排版

- 中文正文："Noto Sans SC", "Microsoft YaHei", sans-serif
- 标题："Songti SC", SimSun, serif
- 正文最小 13px，行高 1.65–1.75

## 组件规范

- 卡片：白色背景、1px #d4e4e6 边框、10px 圆角、柔和阴影
- 主要按钮：#0d4d66、高度 ≥35px、5px 圆角、hover 提亮
- 对话气泡：患者浅青 #e2f3fc，医生深青 #08698b 白字

## 布局

桌面三栏：患者 27% / 对话 1fr / 医生与摘要 25%。平板双栏，移动端纵向堆叠。

## 动效

L1 精致静态：工作区淡入 280ms、状态点 1.2s 呼吸、按钮 hover 轻微位移。`prefers-reduced-motion` 时取消动画。

## 禁忌

- 不使用高饱和渐变或玻璃模糊覆盖对话文本
- 不把主要操作藏在小图标里
- 不在移动端让卡片横向溢出

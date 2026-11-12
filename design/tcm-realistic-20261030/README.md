# 写实四诊设计与实装

独立分支：`feature/tcm-course-upgrade`，暂不合并主分支。

- `pulse-workspace-design.png`：脉诊界面设计图。
- `tongue-workspace-design.png`：舌诊界面设计图。
- `DESIGN.md`：从设计图提取的布局、交互、坐标与教学依据。
- `PROMPTS.md`：内置 imagegen 的生成简报与编辑提示词。
- `manifest.json`：9 张最终设计/运行图片的来源、尺寸、透明通道及 SHA-256。

运行素材在 `public/four-exam-images/realistic/`，共 7 张。教师识图照片继续使用原 DOCX 图库，不将生成照片当作病例检查数据。

预览地址：<http://127.0.0.1:4273/>。进入中医四诊后，望诊点击“查看舌苔”，切诊点击“查看脉象”。脉诊可选择一、二、三指图片并拖动，先检查位置，再按中指、食指、无名指依次确认。舌诊可播放或逐步查看，伸舌完成后显示随机老师照片，提交后开放解释和完整图谱。

本次验证：149 项测试、生产构建及 2 条浏览器流程均通过。截图位于本机 `verification/realistic-tongue-observation.png` 与 `verification/realistic-pulse-practice.png`，不纳入提交。

# 中医四诊页面设计提示词

工具：内置 image_gen。

用途：高保真页面设计图，未修改页面代码。

## 原始设计提示词

Use case: ui-mockup.
Create ONE finished high-fidelity desktop interface design image for the existing 大连医科大学 中医四诊 clinical training screen. This is a substantial visual redesign requested by the user, grounded in the three supplied references: the two pale-blue current-page screenshots show the existing functions and full-viewport problem; the more immersive Chinese mockup shows the medical illustration language only. Produce a single redesigned screen, never a collage or multiple options.

Canvas: full-viewport desktop web app, 1627 × 1244 pixels, natural aspect ratio approximately 1.31:1. The application occupies the entire canvas, edge to edge. No browser chrome, no device frame, no surrounding presentation board. Main working regions extend from below the header almost down to a bottom action bar. Eliminate the old huge empty lower half and centered miniature workspace. Use readable Chinese UI typography, body text around 16px, headings 26–32px. Make the layout feasible with CSS grid.

Art direction: refined contemporary medical teaching workstation, white/off-white base, deep ink navy text, restrained teal-blue active states, soft icy aqua in patient visualization, subtle warm skin and natural materials. Excellent alignment and purposeful spacing. Crisp fine dividers, medium radius, minimal shadows. Premium calm clinical feeling, clear contrast. Avoid excessive translucent cards, all-blue low-contrast text, glowing effects, oversized branding, generic analytics dashboard, card-within-card clutter.

Layout:
1. One 72px tall full-width top bar. Left: compact medical icon, exact brand “大连医科大学”, secondary “临床问诊实训”. Right: green status dot with “教学模拟环境”, discrete outline buttons “静音” and “重置训练”. Branding appears only once.
2. A slim 190px wide left navigation rail spans the full remaining height. Title “接诊流程”, small “CASE 01”. Six spacious vertical numbered steps: “01 问诊”, “02 体格检查”, “03 中医四诊”, “04 辅助检查”, “05 诊断”, “06 处置”. First two have subtle completed checkmarks; third is selected with a strong teal indicator and readable label, other steps muted. At bottom a subtle course identifier “临床综合实训”.
3. Remaining area has a compact page heading “中医四诊”, subtitle “望闻问切 · 证候采集”. Inline patient identity “王旭 · 男 · 48 岁 · 门诊初诊” appears once, with small patient presence status “患者在场”. A clear slim case-progress treatment; no invented time, grades or metrics.
4. Across this main area a clean horizontal five-item navigation, exact labels “望诊”, “闻诊”, “问诊”, “切诊”, “四诊总结”. Use appropriate thin medical icons. “望诊” is visibly selected by filled teal-blue label or underline. Above/beside navigation show “0/5 已记录”.
5. Below navigation is a generously sized two-column work surface reaching nearly to bottom action bar. Left about 52% is a dominant patient examination visualization, right about 48% is a legible observation/recording surface. Do not duplicate patient information in an extra sidebar.
Patient visualization: an attractive carefully rendered 3D stylized Chinese adult male patient around age 48, short brown hair with lightly graying temples, mature facial proportions, light-blue patient clothing, seated naturally on a modern examination bed. No white doctor coat or stethoscope on the patient. Calm bright consultation room, white bedding, warm realistic facial lighting, softly desaturated medical aqua environment. Preserve the approachable 3D style of the existing app but make it suitable for an adult medical teaching patient. Full upper body visible, feet/bed composition naturally contained, elegant human scale rather than an oversized baby face. At top of visual area subtle label “标准化病人”. At bottom small restrained tags “男 · 48 岁” and “意识清楚”. Use the illustration to occupy the work area naturally without giant vacant background, no decorative fantasy graphics.
Right record surface: heading “望诊记录”, small helper “观察神色、形态、舌质与舌苔，记录检查所见”. One large elegant single freeform multiline text area with exact placeholder “补充你的检查所见或判断…” and small label “检查记录”. Below it, a grouped summary area “模块记录”, five clean rows for “望诊”“闻诊”“问诊”“切诊”“四诊总结”, all “待记录”, using lightweight separators rather than separate cards. Bottom a short understated instructional hint “完成当前项目后，继续下一模块”. Arrange these at a useful, legible density; don't invent extra form fields, AI analysis, symptoms, diagnosis, tongue photographs, scores, audio waveforms, treatment recommendations, medical outcomes, or save actions absent from the current screen.
6. A full-width main-area action bar anchored at bottom, with quiet left “返回上一步” and one prominent dark teal primary button at far right “进入辅助检查” with a right-pointing arrow. Keep enough space around this primary action.

Text must be accurate, readable simplified Chinese, no gibberish or placeholder English. Use only tiny “CASE 01” as supporting English. The finished image must feel like a practical professional teaching app, not marketing. All five tabs, all six flow steps, and the bottom primary action are visible without cropping. The strong redesign outcomes must be obvious: full-page utilization, a large clinical observation scene, readable record area, one clear navigation system, and simple consistent visual hierarchy.

## 最终修正提示词

Edit this finished Chinese clinical training UI mockup with ONE surgical correction only: in the top-right progress area the label is “0/5 已记录”, so the horizontal progress track beneath it must be entirely pale blue with ZERO dark teal fill, showing zero completion. Remove just the short dark teal filled segment on that progress track. Keep the pale track, its position, the label, every other word, typography, layout, dimensions, colors, all icons, adult male patient, room, sidebar, five tabs, text area, module list, footer and buttons exactly the same. Return the complete full-viewport design. No additions, no other redesign.


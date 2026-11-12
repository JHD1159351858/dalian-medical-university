# 图像生成提示词与来源

使用内置 imagegen，未调用 CLI/API 备用生成方式。两张设计图先生成，再生成独立的运行素材并按图开发；没有裁切设计图作为前端素材。

手部一指最终为中指伸出，便于准确演示中指定关。早期食指单指版本已弃用，不纳入运行素材。三态人物图仅演示动作，识图题继续使用用户 DOCX 原图。

以下记录设计/基础素材的复现简报，以及最终编辑素材的原始编辑提示词。完整源图文件名和资源校验记录见 manifest.json。

## pulse-workspace-design.png

High-fidelity Chinese clinical pulse-palpation UI, landscape 16:10. Teal #087a9b, off-white, dark navy. Header 脉诊操作实训; modes 操作演示/拖动练习. Large photorealistic palm-up adult right wrist, hand left / forearm right on blue pulse cushion. Physician index-left/middle-center/ring-right cutout with 寸/关/尺 hints. Right-side steps middle to guan first, index to cun on wrist side, ring to chi on elbow side. Bottom 一指/二指/三指 photographic selections, 检查位置 and 重置. Clear readable Chinese, no cartoon hands, no fake physical measurement.

## tongue-workspace-design.png

High-fidelity Chinese tongue examination UI, landscape 16:10, matching teal-blue clinical style. Large photorealistic adult East Asian patient's open-mouth and naturally extended tongue on left two-thirds, action playback rail 准备/张口/伸舌 below. Right third shows separate teacher-supplied original tongue photo, observation input, 提交判断 and 换一张, expandable 舌色/舌形/舌苔/润燥 guidance. No diagnostic conclusions or scores. Generated concept branding is not used in the app.

## pulse-arm.png

Standalone photorealistic clinical patient wrist background plate, NEW standalone photo rather than UI crop. Landscape 3:2; adult East Asian man's right forearm enters from right, relaxed palm and five natural fingers at left, palm up and thumb toward upper edge, supported by pale-blue woven pulse pillow. Elevated oblique camera; skin pores, wrist creases, exposed radial/thumb side near center, empty top area for independent physician hand overlay. No doctor, UI, labels, arrows, targets or watermark.

## doctor-hand-3.png

Transparent-background photographic cutout of one adult physician right hand. Nail-side faces camera; white coat cuff enters top-center, connected palm upper half; index/middle/ring naturally curved downward with aligned distal contact points, thumb and little finger tucked. Index on image left, middle center, ring right. Square canvas, soft upper-left clinical lighting, realistic pores/knuckles/short nails, no disconnected cartoon cylinders, labels, background, checkerboard, patient wrist or UI. Genuine alpha.

## doctor-hand-1.png

Use case: precise-object-edit. Edit the supplied THREE-FINGER physician hand into a SINGLE EXTENDED MIDDLE FINGER pose for a traditional Chinese medicine pulse palpation teaching sequence. This is a neutral medical hand demonstration at the wrist, not a gesture toward anyone. Keep exactly the same photorealistic adult hand, nail-side view, skin, lighting, white cuff, size, square transparent canvas and alignment. ONLY THE MIDDLE FINGER (the CENTER and longest of the source's three long fingers) remains extended naturally downward, preserving its original tip pixel location approximately x=50%, y=92% of the full image. The INDEX (source LEFT long finger) and RING (source RIGHT long finger) are flexed inward naturally along with the little finger; thumb remains tucked. Exactly one long extended center finger, with connected palm and realistic bent other fingers. Do not extend the index finger. Do not move/reframe hand. No writing, no labels, no checkerboard, no solid background, no added shadow, no UI, no other body parts. Genuine alpha transparency. This medically specific pose is used for the initial middle-finger localization of the radial pulse.

## doctor-hand-2.png

Use case: precise-object-edit. Edit the supplied isolated three-finger physician hand into the TWO-FINGER selection state for the same interactive medical teaching app. Keep exactly the same person, realistic skin, lighting, camera, white cuff, hand size, square canvas, transparent alpha background, position and scale. Change ONLY finger posture: index and middle fingers remain extended downward with their fingertips in the EXACT same pixel locations as the source; ring finger folds inward alongside already folded little finger; thumb remains tucked. Exactly two extended fingers are visible, the back/nails face camera. Keep the connected palm and cuff, realistic knuckles and nails. Do not add any labels, shadows, checkerboard, background, wrist patient, or UI. Genuine transparency. Do not shift or resize the hand or canvas. Medical adult two-finger distractor selection asset, not a standard completed palpation.

## tongue-ready.png

NEW standalone 4:5 photorealistic clinical portrait, anonymous East Asian man around age 48, short slightly graying hair, pale-blue patient gown, neutral clinic background, straight-on camera and calm gaze. Mouth gently closed. Entire head/neck/shoulders in frame; consistent framing and lighting for subsequent mouth-opening/tongue-extension edits. No UI, labels, pathology, logo or watermark.

## tongue-open.png

Use case: precise-object-edit. Edit ONLY the mouth/lips and small immediately surrounding lower-face region of the supplied clinical portrait to make the SECOND animation frame: the SAME patient now naturally OPENS HIS MOUTH for a tongue examination. Tongue remains INSIDE mouth, does not yet extend. Upper and lower teeth naturally visible, dark mouth interior, realistic restrained jaw drop. Preserve exactly the man's identity, eyes, hair, ears, head position, camera, crop, shoulders, pale blue gown, skin texture, lighting and clinic background. Do NOT move or resize anything. Keep the entire portrait and image pixel dimensions the same. This will be crossfaded with the reference, so align all facial landmarks except the necessary mouth/jaw movement. Photorealistic clinical educational image, nonsexual. No captions, no logos, no watermark, no UI, no added pathology.

## tongue-extended.png

Use case: precise-object-edit. Edit ONLY the mouth/lips and immediately surrounding lower face of the supplied patient portrait to create the THIRD animation frame for a clinical tongue examination: SAME patient naturally opens his mouth and gently extends his tongue straight forward/downward past the lower lip, comfortably exposing the tongue dorsum, moderate natural extension, not exaggerated. Realistic tongue surface and lips, normal clinical examination pose, nonsexual. Preserve exactly the same man's identity, eyes, gaze, ears, hair, head position, camera, crop, shoulders, pale-blue patient gown, background, lighting and realistic skin texture. Do NOT change canvas size or move/reframe face. Facial landmarks outside lower-mouth region must remain aligned for animation crossfade. Tongue should be visible, anatomically correct, not unnaturally long, no extra teeth, no pathology invention, no arrows, no text, no logos, no watermark, no UI.

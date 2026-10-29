# 四诊展开图片生成提示词

使用内置 image_gen 生成，三图统一为医疗蓝白背景的教学示意；均不是王旭病例的真实检查资料，不用于判定舌象、脉象或声音异常。

- tongue-demo.png：舌体与舌苔近距离观察。
- sound-demo.png：语声与呼吸观察的视觉示意，不是录音。
- pulse-demo.png：三指切脉手法示意，不是实测脉象图。

## tongue-demo.png

```text
Use case: scientific-educational
Asset type: expandable image inside a Chinese medicine training application
Primary request: a clear close-up medical teaching illustration showing the visible tongue and tongue coating, suitable for magnification.
Subject: one adult human tongue gently extended from an open mouth, natural pale pink tongue body with a thin modest whitish coating across the upper surface. Include only the lower portion of the face needed for context, soft lips and realistic clean anatomy.
Style/medium: refined semi-realistic medical textbook illustration with soft 3D shading, gentle and non-graphic.
Composition/framing: landscape approximately 4:3, tongue centered and prominent, detailed tongue surface clearly visible, ample margins, uncluttered pale medical blue-white background.
Lighting/mood: even soft clinical light.
Constraints: This is a generic teaching illustration, not a case-specific medical finding. Neutral appearance. No disease lesions, no blood, no sores, no diagrams, no text, no labels, no numbers, no watermark, no interface, no arrows.
```

## sound-demo.png

```text
Use case: scientific-educational
Asset type: expandable image inside a Chinese medicine training application
Primary request: a detailed gentle medical teaching illustration for observing a patient's voice and breathing.
Subject: one adult East Asian male around middle age, normal human proportions, side profile from head through upper chest, wearing a simple light blue patient shirt; calm expression with lips slightly parted as if speaking. Show a small elegant abstract set of sound wave curves beside the mouth, representing voice visually.
Style/medium: refined semi-realistic medical textbook illustration with soft 3D shading, same clean blue-white visual language as a tongue and wrist examination illustration.
Composition/framing: landscape approximately 4:3, man and sound waves centered with clear upper chest visible, uncluttered pale medical blue-white background.
Lighting/mood: soft even clinical light, approachable educational tone.
Constraints: Generic teaching visualization, no actual measured data or diagnosis implied. No words, no text, no labels, no numbers, no watermark, no interface, no disease depiction, no instruments, no ECG, no chart axes.
```

## pulse-demo.png

```text
Use case: scientific-educational
Asset type: expandable image inside a Chinese medicine training application
Primary request: an anatomically plausible close-up medical teaching illustration of traditional Chinese medicine radial pulse palpation.
Subject: an adult patient's forearm and wrist resting horizontally on a small light blue wrist cushion, palm facing upward with relaxed fingers. A doctor's hand uses three adjacent fingertips — index, middle, and ring finger — gently aligned along the patient's radial artery on the thumb side of the wrist. The fingertips contact three nearby sites in a line along the wrist and forearm; distinguish the doctor's hand and patient's hand clearly, natural human hands and correct finger count.
Style/medium: refined semi-realistic medical textbook illustration with soft 3D shading, gentle non-graphic, same clean medical blue-white visual language.
Composition/framing: landscape approximately 4:3, close-up hands centered and large, detailed contact area clearly visible, sufficient margins, uncluttered pale medical blue-white background.
Lighting/mood: soft even clinical light.
Constraints: Generic technique teaching illustration, not measured pulse data, no diagnosis implied. No ECG or waveform, no pulse graph, no medical monitors, no text, no labels, no numbers, no arrows, no watermark, no interface, no blood.
```


# 2026-11-17 当前使用版本：统一卡通患者

用户纠正：整体结构与原项目卡通角色统一。按用户要求，卡通图片直接覆盖原有图片路径，页面引用原有数据路径；带cartoon日期的生成文件保留为来源备份。沿用旧文件名，本次生成日期为2026-11-17。

风格参考：`../tongue-patient-portrait.png`。四图统一为同一卡通患者、正面半身、白色病号服、蓝灰背景、1254×1254方形画幅；图片仅作独立色泽辨认，不代表当前病例体征。内置 `image_gen` 原始产物保留，复制入项目；文件来源与SHA-256见 `manifest.json`。

## 共同提示（巩膜黄染、阳黄、阴黄）

```text
Use the supplied reference image as the character identity and art-direction reference. Make a NEW square 1:1 teaching illustration in exactly this project's cute 3D chibi hospital-character style. SAME reference character: oversized round head, big glossy brown eyes and black pupils, small mouth with a mildly uncomfortable expression, sculpted tousled brown hair with the same silhouette, small stocky body, white short-sleeved wrap hospital gown with a small blue circular medical-cross badge. Soft matte stylized 3D materials, smooth clean surfaces, no realistic skin pores, no wrinkles, no photographic human texture. Match the reference's pale blue-grey flat background and soft even neutral lighting. Every image in this set must use the identical straight-on camera, waist-up composition with both bare forearms and hands visible near the bottom, identical pose, centered character and generous safe margin. Clearly a fictional cartoon teaching character. Keep anatomy clean. No text, no arrows, no panels, no UI, no watermark. Do not apply a whole-image color filter: keep brown hair, white gown and blue-grey background unchanged. Only change the requested specific clinical color demonstration, for independent observation teaching; do not imply a real patient's diagnosis.
```

## scleral-icterus

最终文件：`scleral-icterus-ai-20261116.png`。共同提示后追加：

```text
DEMONSTRATION: scleral icterus only. Keep the base skin tone of the reference normal. Tint only the visible eye whites a clear soft pale yellow; the irises remain brown and pupils black, highlights white. Both eyes stay naturally open so the yellow outer whites can be observed. Keep the same waist-up framing as the other three images, NOT an eye macro crop.
```

## yang-jaundice

最终文件：`yang-jaundice-ai-20261116.png`。共同提示后追加：

```text
DEMONSTRATION: bright yellow skin color for a yang-jaundice teaching color comparison. The exposed face, ears, neck, forearms and hands have a bright clear warm golden-yellow tone, stylized yet readable against the white gown and neutral blue-grey background. Eyes can have subtly pale-yellow whites, brown irises and black pupils. Do not change the expression, character age, hair, pose, camera, costume or lighting.
```

## yin-jaundice

最终文件：`yin-jaundice-ai-20261116.png`。共同提示后追加：

```text
DEMONSTRATION: dull yellow skin color for a yin-jaundice teaching color comparison. Exposed face, ears, neck, forearms and hands are a muted, dull smoky grey-yellow with a desaturated ochre-brown undertone, visibly less bright than the yang version. This is stylized clean skin coloring, never dirt, bruising, weathering or realistic aged skin. Eyes remain big brown with black pupils and subtly pale-yellow whites. Same mild expression, character, hair, pose, camera, costume and neutral lighting.
```

## facial-flushing

最终文件：`facial-flushing-ai-20261116.png`。为统一人物比例，以本轮巩膜黄染卡通图为编辑参考；最终提示：

```text
Edit the supplied square 1:1 chibi patient portrait. Preserve this exact character, silhouette, scale, facial features, sculpted brown hair, expression, pose, hands, white wrap hospital gown, blue medical badge, pale blue-grey background, neutral lighting, camera, framing, and exact square composition. Change ONLY the observation color example from scleral yellowing to facial flushing: restore BOTH eye whites to clean natural white, leave irises brown and pupils black. Add diffuse gentle warm rosy-red flushing over cheeks, forehead, and nose only. Arms, neck, ears stay the normal reference base skin color. No yellowing anywhere. Smooth matte 3D cartoon style throughout. Do not zoom in or out, do not shift the character, do not crop to landscape. The entire same waist-up silhouette and both hands must fit the same square frame with the same margins. This is a fictional cartoon color-observation teaching example, no labels, no text, no arrows, no rash, no wounds, no photorealism.
```

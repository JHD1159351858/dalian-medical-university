# 三维资源说明

运行时资源在 `public/models/`；完整来源、当前导出文件大小与 SHA-256 以 `public/models/asset-manifest.json` 为准。

## 原始资源

| 文件 | 原始路径 | 大小 | 格式 |
| --- | --- | ---: | --- |
| 患者.glb | `C:\Users\Administrator\Desktop\超星\项目\智能体\大连医科大学\患者.glb` | 79,154,800 bytes | glTF 2.0 binary |
| 医生.glb | `C:\Users\Administrator\Desktop\超星\项目\智能体\大连医科大学\医生.glb` | 84,044,356 bytes | glTF 2.0 binary |
| 医院场景_极致还原.blend | `C:\Users\Administrator\Desktop\超星\项目\智能体\大连医科大学\医院场景_极致还原.blend` | 649,895 bytes | Blender 项目，文件版本 5.2.44 |

原始两名角色均无 skin、无 animation，约 150 万三角面，各有 3 张约 4K 的内嵌 PNG 纹理。原文件哈希见清单 `sources` 字段，避免文档与重新导出后的资源不一致。

## 运行时导出

| 资源 | 文件 | 规格 |
| --- | --- | --- |
| 患者 | `patient.glb` | 1.65 m、约 100,000 三角面、1 skin、22 骨骼、`Idle`/`Walk`/`Talk` |
| 医生 | `doctor.glb` | 1.72 m、约 100,000 三角面、1 skin、22 骨骼、`Idle`/`Walk`/`Talk` |
| 医院 | `hospital.glb` | 41 mesh / 41 draw calls、45,486 三角面；材质/PBR 随导出保留 |

运行时坐标为 +Y 向上、+Z 朝前、地面为 0、单位为米；医院源坐标转换为 `(x, y, z) -> (x, z, -y)`。原始步行片段周期为 1.2 秒、步幅 0.56 m，1 倍播放对应 0.4667 m/s。当前医生速度为 1.1 m/s、患者为 0.85 m/s，按实际移动速度同步缩放骨骼动画播放速度（稳定巡行约 2.36 倍／1.82 倍），受阻时停步；root motion 关闭，由场景控制移动。此次调整未改写人物 GLB 或动画源文件。

角色使用原始派生网格的连续解剖区域权重，每顶点最多 4 个影响，不是自动热力绑定；长衣通过附加衣摆骨骼作受限运动，没有布料模拟。`Talk` 为肢体动作，不含面部 blend shape 或口型同步。

角色减面前先以 0.00001 m（0.01 mm）阈值合并重合顶点，连接原始扫描表面的碎片边界，避免减面后开缝、露出内部背面而出现黑色碎点。运行时仍保持每人约 100,000 三角面与 2K 贴图；焊接前后顶点数记录在清单 `characters.*.surfaceCleanup`。运行 `node verification/character-surface.mjs` 可检查固定正面视角是否暴露异常背面，并生成外观截图。

医院模型将静态部分按材质合并，并将入口双开门的 12 个部件保留为独立 mesh，最终为 41 mesh / 41 draw calls。`EntranceDoorLeft` 和 `EntranceDoorRight` 的运行时枢轴分别为 `(-1.11, 1.3, 5.49)` 和 `(1.11, 1.3, 5.49)`；绕 +Y 从 0° 转到 +85° / -85° 时，两扇门向室内（-Z）开启。门框和门头仍属于静态批次。完整部件名、闭合/开启包围盒及角度见清单 `hospital.entranceDoors`。

医院源统计为 1,054 个网格对象、25,018 顶点、27,375 多边形、45,486 三角面；导出审计确认三角面无丢失、无重复。迎宾垫范围为 X `[-1.6, 1.6]`、Z `[6.04, 7.16]`、顶部 Y `0.028`；入口铺装范围为 X `[-2.3, 2.3]`、Z `[6, 7.72]`。角色编辑源文件为 `authoring/characters-rigged.blend`。

## 再生成

在仓库根目录、原始资源仍位于上述相对路径时运行：

```powershell
D:\Blender\blender.exe --background --factory-startup --python hospital-agent/scripts/prepare_assets.py
```

仅重新导出人物（不会改写医院或小镇模型）：

```powershell
D:\Blender\blender.exe --background --factory-startup --python hospital-agent/scripts/prepare_assets.py -- --characters-only
```

仅重新导出医院（不会改写 `patient.glb`、`doctor.glb` 或 `authoring/characters-rigged.blend`）：

```powershell
D:\Blender\blender.exe --background --factory-startup --python hospital-agent/scripts/prepare_assets.py -- --hospital-only
```

该脚本已完成资源优化并重新导出运行时 GLB、写入清单和角色编辑源文件，无需额外的优化脚本。

## 小镇首页（2026-09-20）

首页使用 `医院小镇_new.blend` 单独导出的 `town.glb`（3,842,128 bytes，63 个网格、835,820 三角面）和 `town-car.glb`（25,004 bytes）。`scripts/prepare_town.py` 将应用修改器后的静态几何按材质合并，提取原有 Car0 作为动态车辆，并使用 Draco 压缩；解码器随站点部署在 `public/draco/`，不依赖外部 CDN。导出不保存或覆盖原始 Blender 文件。

四辆汽车沿外环道路循环，十二名低面数行人沿医院南侧人行道移动，均为首页环境动画。静态建筑阴影只计算一次。点击“开始实训”卸载并释放首页几何、材质、阴影与 WebGL 上下文，随后加载旧医院和角色；小镇不进入接诊碰撞或导航逻辑。减少动态效果偏好会暂停环境运动。

重新导出（在 `hospital-agent` 目录）：

```powershell
D:\Blender\blender.exe --background --disable-autoexec --python scripts/prepare_town.py
```

直接替换评估记录：`verification/CANDIDATE-REPORT.md`；首页表现与截图：`verification/town-home-results.json`、`verification/town-home-1440.png`、`verification/town-home-390.png`。帧率为 RTX 4060 Ti 桌面浏览器测试，不代表真机手机。

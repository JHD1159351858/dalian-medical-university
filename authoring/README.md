# Editable character assets

Open `characters-rigged.blend` in Blender 5.2 or newer. Both characters retain the supplied reconstructed surfaces, UVs and packed textures; their source geometry was decimated to 100,000 triangles each. The patient and doctor are positioned side by side for editing. Exported standalone GLBs have their object origin at the ground and face +Z in glTF coordinates.

Before decimation, coincident scan vertices are welded within 0.00001 m (0.01 mm). This keeps fragment boundaries connected during reduction and prevents black backface speckles in close portraits. UV coordinates remain per face corner. Regenerate only the characters with `--characters-only` to preserve the hospital and town exports.

Each character has a 22-bone deforming armature, anatomical vertex groups, and three NLA tracks: `Idle` (2.4 s), `Walk` (1.2 s), and `Talk` (2.4 s). Select an armature and solo the desired NLA track to preview or edit it. Source actions are named `patient_Rig_Idle`, `patient_Rig_Walk`, `patient_Rig_Talk` and the corresponding `doctor_Rig_*` names. Runtime clips use only `Idle`, `Walk`, `Talk`.

The walk is in place. Synchronize scene translation to 0.56 m per complete 1.2-second cycle: 0.4666667 m/s at normal playback. A foot spends 60% of the cycle supporting weight and 40% swinging, with alternating legs, knee flexion, ankle/toe pitch, hip lowering and sway, torso rotation, and arm counter-swing. No root horizontal travel is baked into the clips.

Skin weights are continuous anatomical envelopes on the original-derived visible surface. Scan fragmentation makes standard heat binding unreliable. Four normalized joint influences per vertex are exported. Gown hems and the long coat use additional coat bones with mild motion; there is no cloth simulation. Talk provides body/head/hand gestures, without lip synchronization or facial shape keys. Stylized proportions are preserved. Post-decimation measured heights differ from 1.65 m and 1.72 m by less than 1 mm.

Regenerate all assets from the project root:

```powershell
& 'D:\Blender\blender.exe' -b -t 8 --python hospital-agent/scripts/prepare_assets.py
python hospital-agent/verification/validate_assets.py
```

The pipeline reads but never writes the original character GLBs or hospital blend. `public/models/asset-manifest.json` records their hashes, sizes, runtime statistics, bone names, clip mappings and landmarks. The validator checks the final binary files, packed texture dimensions, all vertex weights, real moving bone channels, dimensions, source hashes, and sampled foot contact. It writes `verification/runtime-validation.json`.

The hospital preserves all source mesh geometry and materials, grouped into 29 static material batches. Blender `(x,y,z)` transforms to glTF `(x,z,-y)`. Entrance: `[0.55,0,5.7]`; welcome mat: `[0,0,6.6]`; reception desk footprint: `x [-6.8,-2.1], z [1.4,3.5]`.

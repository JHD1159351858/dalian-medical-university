"""Import the five supplied GLBs and export the patient models used by the hospital."""
import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parents[1]
MODELS = PROJECT / 'public/models'
MANIFEST = MODELS / 'asset-manifest.json'
sys.path.insert(0, str(HERE))
from scan_surface import prepare_materials, prepare_surface
from scan_rig import rig_scan

# The supplied filenames have no patient names. Each assignment is matched to its case portrait.
SOURCES = {
    'lin-yue': 'b54c5361f18b9e22c11f246900c354ab.glb',
    'chen-yang': '7291a52e6cbe24e037e0d05b99f07c48.glb',
    'zhou-ning': 'fe0a19f0067178cff853f92a10b14151.glb',
    'zhao-hang': '6bd32baf845e69e0a8a00873ebf7bfc3.glb',
    'sun-lan': 'cec91c62760e73d3d8987a86a49c54df.glb',
}


def export_patient(case_id, src, mesh, reference):
    prepare_materials(mesh, reference['textureMaxDimension'])
    mesh.name = case_id + ' • supplied surface'
    rig = rig_scan(case_id, mesh)
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = mesh
    rig.select_set(True)
    idle = rig.animation_data.nla_tracks['Idle']
    idle.mute = False
    bpy.context.scene.frame_set(1)
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == 'VIEW_3D':
                view = area.spaces.active
                view.region_3d.view_rotation = Vector((.30, -1, .12)).to_track_quat('Z','Y')
                view.region_3d.view_location = (0, 0, reference['heightMeters'] / 2)
                view.region_3d.view_distance = 3.25
                view.overlay.show_overlays = False
                view.shading.color_type = 'TEXTURE'
    source_scene = HERE / 'scans' / (case_id + '.blend')
    source_scene.parent.mkdir(exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(source_scene), compress=True)
    idle.mute = True
    bpy.context.scene.frame_set(1)
    output = MODELS / 'patients' / (case_id + '.glb')
    output.parent.mkdir(exist_ok=True)
    temp = output.with_suffix('.pending.glb')
    bpy.ops.export_scene.gltf(filepath=str(temp), export_format='GLB', use_selection=True,
        export_yup=True, export_animations=True, export_animation_mode='ACTIONS',
        export_force_sampling=True, export_rest_position_armature=True, export_skins=True,
        export_influence_nb=4, export_normals=True, export_texcoords=True,
        export_image_format='JPEG', export_jpeg_quality=90, export_cameras=False, export_lights=False)
    raw = temp.read_bytes()
    doc = json.loads(raw[20:20 + int.from_bytes(raw[12:16], 'little')])
    primitives = [p for m in doc['meshes'] for p in m['primitives']]
    triangles = sum(doc['accessors'][p['indices']]['count'] // 3 for p in primitives)
    height = max(doc['accessors'][p['attributes']['POSITION']]['max'][1] for p in primitives)
    clips = [a['name'] for a in doc['animations']]
    if (triangles != reference['triangles'] or abs(height - reference['heightMeters']) > .001
        or set(clips) != {'Walk','Idle','Talk'} or len(doc.get('skins', [])) != 1
        or len(doc.get('images', [])) != 3):
        raise ValueError(f'Unexpected export for {case_id}: {triangles} triangles, {height} m, {clips}')
    temp.replace(output)
    return {
        'file': output.relative_to(MODELS).as_posix(), 'bytes': len(raw),
        'sha256': hashlib.sha256(raw).hexdigest(), 'source': source_scene.relative_to(PROJECT).as_posix(),
        'originalFile': src.name, 'originalSha256': hashlib.sha256(src.read_bytes()).hexdigest(),
        'sourceTriangles': mesh['source_triangles'], 'triangles': triangles,
        'heightMeters': round(height, 6), 'clips': clips,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--case', choices=SOURCES)
    parser.add_argument('--source-dir', type=Path, default=PROJECT.parent)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    reference = manifest['characters']['patient']
    for key in [args.case] if args.case else SOURCES:
        src = args.source_dir / SOURCES[key]
        mesh = prepare_surface(src, reference)
        manifest['casePatientModels'][key] = export_patient(key, src, mesh, reference)
        temp = MANIFEST.with_suffix('.tmp')
        temp.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        temp.replace(MANIFEST)


if __name__ == '__main__':
    main()

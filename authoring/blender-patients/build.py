"""Run with Blender, e.g. blender -b --factory-startup --python-exit-code 1 --python build.py."""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from animation import animate, bind_meshes, create_armature
from bodies import build_body
from faces import build_face
from hair import build_hair
from rig import landmarks, PROFILES

PROJECT = HERE.parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--case', choices=list(PROFILES), action='append')
parser.add_argument('--render-dir', type=Path)
parser.add_argument('--output', type=Path, default=HERE / 'preview')
parser.add_argument('--sources', type=Path, default=HERE / 'scenes')
args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])


def point_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z','Y').to_euler()


def setup_studio():
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 620, 740
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.world = bpy.data.worlds.new('Studio • fill')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.78,.83,.90,1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .33
    camera = bpy.data.cameras.new('Portrait lens')
    scene.camera = bpy.data.objects.new('Studio • portrait camera', camera)
    scene.collection.objects.link(scene.camera)
    scene.camera.location = (1.72,-5.2,1.90)
    point_at(scene.camera,(0,0,.84))
    camera.type = 'ORTHO'
    camera.ortho_scale = 1.98
    for name, pos, power, size, color in [
        ('Softbox',(-2.8,-3.5,4.5),340,3.8,(1,.92,.84)),
        ('Bounce',(2.6,-2.4,2.35),165,3.0,(.82,.91,1)),
        ('Rim',(1.5,1.65,3.2),310,2.2,(1,.94,.87)),
    ]:
        light = bpy.data.lights.new(name,'AREA')
        light.shape = 'DISK'
        light.size, light.energy, light.color = size, power, color
        obj = bpy.data.objects.new('Studio • '+name,light)
        scene.collection.objects.link(obj)
        obj.location = pos
        point_at(obj,(0,0,.90))
    scene.view_settings.view_transform = 'AgX'
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == 'VIEW_3D':
                space = area.spaces.active
                space.region_3d.view_perspective = 'CAMERA'
                space.overlay.show_overlays = False
                space.shading.type = 'MATERIAL'


def build(case_id):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    points = landmarks(case_id)
    chin = points['Head'][2]
    meshes = build_body(case_id, points) + build_face(case_id, chin) + build_hair(case_id, chin)
    bpy.context.view_layer.update()
    rig = create_armature(case_id, points)
    feet = bind_meshes(meshes, rig)
    animate(case_id, rig, points, feet)
    setup_studio()
    # Save the editable objects and packed PBR maps before consolidating the runtime mesh.
    bpy.ops.object.select_all(action='DESELECT')
    rig.animation_data.nla_tracks['Idle'].mute = False
    bpy.context.scene.frame_set(1)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(args.sources / (case_id+'.blend')), compress=True)
    if args.render_dir:
        bpy.context.scene.render.filepath = str(args.render_dir / (case_id+'.png'))
        bpy.ops.render.render(write_still=True)
    rig.animation_data.nla_tracks['Idle'].mute = True
    rig.data.pose_position = 'REST'
    # Convert design modifiers before joining so subdivision and bevels are present on the web as well.
    for obj in meshes:
        # Join merges UV maps by name. Each part has one local layout; all runtime materials sample UV0.
        if len(obj.data.uv_layers) > 1:
            raise ValueError(f'{obj.name}: expected a single material UV layout')
        if obj.data.uv_layers.active:
            obj.data.uv_layers.active.name = 'UVMap'
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        for mod in list(obj.modifiers):
            if mod.type == 'ARMATURE':
                obj.modifiers.remove(mod)
            else:
                bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    model = bpy.context.view_layer.objects.active
    model.name = case_id + ' • surface'
    mod = model.modifiers.new('Character • skin','ARMATURE')
    mod.object = rig
    model.parent = rig
    rig.data.pose_position = 'POSE'
    rig.select_set(True)
    result = args.output / (case_id+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(result),export_format='GLB',use_selection=True,
        export_normals=True,export_texcoords=True,export_yup=True,export_animations=True,
        export_animation_mode='ACTIONS',export_force_sampling=True,export_rest_position_armature=True,
        export_cameras=False,export_lights=False,export_skins=True,export_morph=False,export_extras=False)
    raw = result.read_bytes()
    gltf = json.loads(raw[20:20+int.from_bytes(raw[12:16],'little')])
    clips = {a['name'] for a in gltf.get('animations',[])}
    if clips != {'Idle','Walk','Talk'} or len(gltf.get('skins',[])) != 1 or not gltf.get('images'):
        raise ValueError(f'{case_id}: incomplete animated GLB: {clips}, skins={len(gltf.get("skins",[]))}')
    return {'file':'patients/'+result.name,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),
            'source':'authoring/blender-patients/scenes/'+case_id+'.blend'}


args.sources.mkdir(exist_ok=True,parents=True)
args.output.mkdir(exist_ok=True,parents=True)
if args.render_dir:
    args.render_dir.mkdir(exist_ok=True,parents=True)
entries = {}
for case_id in args.case or PROFILES:
    entries[case_id] = build(case_id)
if args.output.resolve() == (PROJECT/'public/models/patients').resolve():
    manifest_path = args.output.parent / 'asset-manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    manifest.setdefault('casePatientModels',{}).update(entries)
    manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

"""Export the original town as a merged homepage asset; never save the source blend."""
import bpy
import json
import re
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(ROOT.parent / '医院小镇_new.blend'), load_ui=False)
depsgraph = bpy.context.evaluated_depsgraph_get()
groups = {}
survey = []
for obj in list(bpy.context.scene.objects):
    if obj.type not in {'MESH', 'CURVE', 'FONT', 'SURFACE'} or obj.hide_render:
        continue
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    if not mesh:
        continue
    world = obj.matrix_world
    vertices = [tuple(world @ v.co) for v in mesh.vertices]
    if re.search(r'Road|Sidewalk|Car0_|Car1_|Pavement|Ground', obj.name, re.I):
        if vertices:
            survey.append({'name':obj.name,'min':[min(v[i] for v in vertices) for i in range(3)],'max':[max(v[i] for v in vertices) for i in range(3)]})
    moving = bool(re.match(r'CITY5_Car[01]_', obj.name))
    category = 'car' if obj.name.startswith('CITY5_Car0_') else 'static'
    if moving and category == 'static':
        evaluated.to_mesh_clear()
        continue
    for index in {p.material_index for p in mesh.polygons}:
        evaluated_material = mesh.materials[index] if index < len(mesh.materials) else None
        material = bpy.data.materials.get(evaluated_material.name) if evaluated_material else None
        key = (category, material.name if material else 'none')
        batch = groups.setdefault(key, {'vertices':[], 'faces':[], 'smooth':[], 'material':material})
        offset = len(batch['vertices'])
        batch['vertices'].extend(vertices)
        for poly in mesh.polygons:
            if poly.material_index == index:
                batch['faces'].append(tuple(offset+i for i in poly.vertices))
                batch['smooth'].append(poly.use_smooth)
    evaluated.to_mesh_clear()

(ROOT/'verification/town-survey.json').write_text(json.dumps(survey,ensure_ascii=False,indent=2),encoding='utf-8')
export_scene = bpy.data.scenes.new('Homepage export')
bpy.context.window.scene = export_scene

objects = {'static':[], 'car':[]}
for (category, name), batch in groups.items():
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(batch['vertices'], [], batch['faces'])
    mesh.polygons.foreach_set('use_smooth',batch['smooth'])
    mesh.update()
    if batch['material']:
        mesh.materials.append(batch['material'])
    obj = bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(obj)
    objects[category].append(obj)

# Center the original car at ground level; the frontend places copies on roads.
car_vertices = [v.co for obj in objects['car'] for v in obj.data.vertices]
lo = Vector([min(v[i] for v in car_vertices) for i in range(3)])
hi = Vector([max(v[i] for v in car_vertices) for i in range(3)])
origin = (lo+hi)*0.5
origin.z = lo.z
for obj in objects['car']:
    for v in obj.data.vertices:
        v.co -= origin

for category, filename in [('static','town.glb'),('car','town-car.glb')]:
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects[category]:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[category][0]
    bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models'/filename),export_format='GLB',use_selection=True,export_apply=False,export_animations=False,export_lights=False,export_cameras=False,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_draco_position_quantization=16)
    print('TOWN_EXPORT',filename,len(objects[category]),flush=True)

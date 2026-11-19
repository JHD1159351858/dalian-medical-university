"""Prepare the supplied patient scan with the same dimensions and surface budget as Wang Xu."""
import bmesh
import bpy
import numpy as np


def normalize(mesh, height):
    positions = np.empty((len(mesh.data.vertices), 3), np.float32)
    mesh.data.vertices.foreach_get('co', positions.ravel())
    lower, upper = positions.min(axis=0), positions.max(axis=0)
    positions[:, 0] -= (lower[0] + upper[0]) * .5
    positions[:, 2] -= lower[2]
    positions *= height / (upper[2] - lower[2])
    mesh.data.vertices.foreach_set('co', positions.ravel())
    mesh.data.update()


def prepare_surface(path, reference):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    mesh, = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    bpy.context.view_layer.objects.active = mesh
    mesh.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    normalize(mesh, reference['heightMeters'])
    source_triangles = len(mesh.data.polygons)

    # Weld split scan fragments before collapse; UVs stay on the face corners.
    bm = bmesh.new()
    bm.from_mesh(mesh.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=reference['surfaceCleanup']['weldDistanceMeters'])
    bm.to_mesh(mesh.data)
    bm.free()
    mesh.data.update()
    reduce = mesh.modifiers.new('Match reference triangle budget', 'DECIMATE')
    reduce.ratio = reference['triangles'] / len(mesh.data.polygons)
    reduce.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=reduce.name)
    normalize(mesh, reference['heightMeters'])
    mesh['source_triangles'] = source_triangles
    return mesh


def prepare_materials(mesh, maximum_side):
    mesh.data.polygons.foreach_set('use_smooth', np.ones(len(mesh.data.polygons), dtype=bool))
    for image in bpy.data.images:
        if image.source != 'FILE':
            continue
        factor = maximum_side / max(image.size)
        if factor < 1:
            image.scale(*(round(size * factor) for size in image.size))
        image.pack()

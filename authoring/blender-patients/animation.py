"""Blender armature and in-place looping character performances."""
import math

import bpy
from mathutils import Euler, Quaternion, Vector
from gait import WALKS, key_walk
from rig import PARENTS


def create_armature(case_id, points):
    data = bpy.data.armatures.new(case_id + " • skeleton")
    rig = bpy.data.objects.new(case_id + " • armature", data)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    for name, point in points.items():
        bone = data.edit_bones.new(name)
        base, _, side = name.partition(".")
        child = {"Hips":"Chest", "Chest":"Head", "UpperArm":"Forearm", "Forearm":"Hand", "Thigh":"Shin", "Shin":"Foot"}.get(base)
        bone.head = point
        if child:
            bone.tail = points[child + ("." + side if side else "")]
        else:
            tip = {"Root": (0,.10,0), "Head": (0,0,.55), "Hand": (0,-.018,-.07), "Foot": (0,-.13,-.025)}[base]
            bone.tail = Vector(point) + Vector(tip)
    for child, parent in PARENTS.items():
        data.edit_bones[child].parent = data.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    rig.data.display_type = 'STICK'
    rig.show_in_front = False
    return rig


def bind_meshes(meshes, rig):
    names = set(rig.data.bones.keys())
    feet = []
    for obj in meshes:
        bone = obj.get('bone')
        if bone not in names:
            raise ValueError(f"{obj.name} has invalid binding: {bone}")
        root_group = obj.vertex_groups.get(bone) or obj.vertex_groups.new(name=bone)
        existing = {g.index: g.name for g in obj.vertex_groups if g.name in names}
        unweighted = [v.index for v in obj.data.vertices if not any(g.group in existing and g.weight > 0 for g in v.groups)]
        if unweighted:
            root_group.add(unweighted, 1.0, 'REPLACE')
        obj.parent = rig  # The armature is at the world origin.
        modifier = obj.modifiers.new("Character • skin", "ARMATURE")
        modifier.object = rig
        if bone.startswith("Foot."):
            inverse = rig.data.bones[bone].matrix_local.inverted()
            pts = [obj.matrix_world @ v.co for v in obj.data.vertices]
            feet.append((bone, [inverse @ p for p in pts if p.z < .047]))
    return feet


def animate(case_id, rig, points, feet):
    scene = bpy.context.scene
    scene.render.fps = 30
    lean, tilt = {
        "lin-yue":(.035,-.042), "chen-yang":(.025,.012), "zhou-ning":(.04,-.018),
        "zhao-hang":(.051,.018), "sun-lan":(.092,-.018),
    }[case_id]
    basis = {b.name:b.matrix_local.to_quaternion() for b in rig.data.bones}
    local = {b.name:(b.parent.matrix_local.inverted() @ b.matrix_local if b.parent else b.matrix_local.copy()) for b in rig.data.bones}
    pose = rig.pose.bones
    anim = rig.animation_data_create()

    # Bound the sole with a convex hull: exact contact support, without testing every shoe vertex each frame.
    sole_points = {}
    for name, verts in feet:
        sole_points.setdefault(name, []).extend(verts)
    if not all(sole_points.get('Foot.' + s) for s in ('L','R')):
        raise ValueError(case_id + ' has no sole contact geometry')
    for name, verts in sole_points.items():
        # Retain extremal vertices along tilted ground normals at the sampled walking angles.
        support = set()
        for pitch in range(-45, 51, 3):
            for roll in (-8, -4, 0, 4, 8):
                normal = basis[name].inverted() @ (Euler((math.radians(pitch),math.radians(roll),0)).to_matrix() @ Vector((0,0,1)))
                support.add(tuple(min(verts, key=lambda v:v.dot(normal))))
        sole_points[name] = [Vector(v) for v in support]
    for clip, length in [('Idle', 96), ('Walk',WALKS[case_id][0]), ('Talk',84)]:
        action = bpy.data.actions.new(clip)
        anim.action = action
        if clip == 'Walk':
            key_walk(case_id,rig,points,sole_points)
        else:
            key_stationary(clip,length,rig,points,sole_points,basis,local,lean,tilt)
        slot = anim.action_slot
        track = anim.nla_tracks.new()
        track.name = clip
        strip = track.strips.new(clip,1,action)
        strip.action_slot = slot
        track.mute = True
        anim.action = None
    for b in pose:
        b.rotation_quaternion = Quaternion()
        b.location = (0,0,0)
    scene.frame_end = 97
    scene.frame_set(1)


def key_stationary(clip,length,rig,points,sole_points,basis,local,lean,tilt):
    pose = rig.pose.bones
    for frame in range(length + 1):
        t = 2 * math.pi * frame / length
        s, c = math.sin(t), math.cos(t)
        talking = clip == 'Talk'
        angles = {
            'Hips':(0,0,0),
            'Chest':(lean + .012*s, tilt*.28, .014*s),
            'Head':(-lean*.54 + (.039*math.sin(2*t) if talking else .015*c),
                    tilt, (.058 if talking else .018)*s),
        }
        for side in ('L','R'):
            thigh, shin = -.020, .040
            angles.update({
                'Thigh.'+side:(thigh,0,0), 'Shin.'+side:(shin,0,0),
                'Foot.'+side:(-thigh-.83*shin,0,0),
                'UpperArm.'+side:(-.17-.12*s if talking and side=='R' else -.024,0,0),
                'Forearm.'+side:(-.33-.13*s if talking and side=='R' else -.08,0,0),
            })
        matrices = {}
        for name in points:
            rot = basis[name].inverted() @ Euler(angles.get(name,(0,0,0))).to_quaternion() @ basis[name]
            matrix = local[name] @ rot.to_matrix().to_4x4()
            parent = PARENTS.get(name)
            matrices[name] = matrices[parent] @ matrix if parent else matrix
            if name in angles:
                pose[name].rotation_quaternion = rot
                pose[name].keyframe_insert(data_path='rotation_quaternion', frame=frame+1, group=name)
        ground = min((matrices[bone] @ v).z for bone, verts in sole_points.items() for v in verts)
        pose['Root'].location = (0,0,-ground)
        pose['Root'].keyframe_insert(data_path='location',frame=frame+1,group='Root')

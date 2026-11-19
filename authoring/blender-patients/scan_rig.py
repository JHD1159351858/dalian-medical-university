"""Bind a normalized, welded patient scan to the outpatient animation rig."""
import heapq

import bpy
import numpy as np
from mathutils import Vector

from animation import animate, create_armature


# Heights are fractions of each scan's full stature, measured at anatomical landmarks.
# Chin, shoulder, elbow, wrist, fingertips, hip joint, knee, top of shoe.
LEVELS = {
    'lin-yue':   (.442, .397, .304, .219, .141, .222, .128, .058),
    'chen-yang': (.454, .411, .313, .232, .184, .230, .132, .063),
    'zhou-ning': (.455, .410, .307, .220, .161, .225, .132, .056),
    'zhao-hang': (.469, .426, .322, .228, .160, .228, .130, .065),
    'sun-lan':   (.465, .415, .311, .226, .173, .233, .132, .060),
}


def smooth(low, high, values):
    t = np.clip((values - low) / (high - low), 0., 1.)
    return t*t*(3.-2.*t)


def middle(values):
    return (np.quantile(values, .06) + np.quantile(values, .94)) * .5


def section_depth(mesh, x, y, z, height):
    # Cast outwards from inside the body: a ponytail behind the blouse cannot move the spine.
    origin = (x * height, y * height, z * height)
    front = mesh.ray_cast(origin, (0, -1, 0))
    back = mesh.ray_cast(origin, (0, 1, 0))
    if front[0] and back[0]:
        return (front[1].y + back[1].y) / (2 * height)
    return y


def surface_graph(mesh, xyz):
    edges = np.empty(len(mesh.edges)*2, dtype=np.int32)
    mesh.edges.foreach_get('vertices', edges)
    edges = edges.reshape(-1, 2)
    lengths = np.linalg.norm(xyz[edges[:, 0]] - xyz[edges[:, 1]], axis=1)
    neighbours = [[] for _ in xyz]
    for (a, b), length in zip(edges.tolist(), lengths.tolist()):
        neighbours[a].append((b, length))
        neighbours[b].append((a, length))
    return neighbours


def distance_from_surface_seeds(neighbours, seeds):
    # Distances follow the sewn scan. Fingers and trouser legs can be millimetres
    # apart in space while remaining quite far apart along the actual surface.
    ids = np.flatnonzero(seeds).tolist()
    distances = [float('inf')] * len(neighbours)
    for i in ids:
        distances[i] = 0.
    queue = [(0., i) for i in ids]
    while queue:
        distance, i = heapq.heappop(queue)
        if distance > distances[i]:
            continue
        for j, length in neighbours[i]:
            total = distance + length
            if total < distances[j]:
                distances[j] = total
                heapq.heappush(queue, (total, j))
    return np.array(distances)


def surface_blend(neighbours, first, second, feather, fallback):
    a = distance_from_surface_seeds(neighbours, first)
    b = distance_from_surface_seeds(neighbours, second)
    touched = np.isfinite(a) | np.isfinite(b)
    blend = fallback.copy()
    blend[touched] = smooth(-feather, feather, b[touched] - a[touched])
    return blend


def wrist_seeds(neighbours, x, z, center, height):
    # In these scans the sleeve and torso meet above the hanging hand. The
    # connected pieces below that join identify fingers even where they touch a hip.
    remaining = set(np.flatnonzero(z < height).tolist())
    hands = np.zeros(len(x), dtype=bool)
    body = hands.copy()
    while remaining:
        group = [remaining.pop()]
        for vertex in group:
            for other, _ in neighbours[vertex]:
                if other in remaining:
                    remaining.remove(other)
                    group.append(other)
        if len(group) < 30:
            continue
        target = hands if abs(float(np.median(x[group])) - center) > .125 else body
        target[group] = True
    return hands, body


def rig_scan(case_id, mesh):
    """Mesh is Blender Z-up, facing -Y, at actual scale with transforms applied."""
    coordinates = np.empty(len(mesh.data.vertices)*3, dtype=np.float32)
    mesh.data.vertices.foreach_get('co', coordinates)
    coordinates = coordinates.reshape(-1, 3)
    height = float(coordinates[:, 2].max())
    xyz = coordinates / height
    x, y, z = xyz.T
    chin, shoulder, elbow, wrist, fingertips, hip, knee, ankle = LEVELS[case_id]
    shin_band = abs(z - knee) < .012
    shins = {}
    for side, sign in (('L', 1), ('R', -1)):
        band = shin_band & (x*sign > 0)
        shins[side] = (middle(x[band]), middle(y[band]))
    center = (shins['L'][0] + shins['R'][0]) * .5
    shin_y = (shins['L'][1] + shins['R'][1]) * .5
    pelvis_y = section_depth(mesh, center, shin_y, hip, height)
    torso_y = section_depth(mesh, center, pelvis_y, shoulder - .036, height)

    points = {
        'Root': (0., 0., 0.), 'Hips': (center, pelvis_y, hip),
        'Chest': (center, torso_y, (hip + shoulder) * .54),
        'Head': (center, torso_y, chin),
    }
    arm_x = np.zeros_like(z)
    arm_y = np.zeros_like(z)
    for side, sign in (('L', 1), ('R', -1)):
        on_side = sign*(x-center) >= 0
        joints = []
        for level in (wrist, elbow, shoulder):
            band = on_side & (abs(z - level) < .014) & (abs(y - torso_y) < .080)
            extent = np.quantile(x[band]*sign, .985)
            outer = band & (x*sign > extent - .037)
            joints.append(((extent - .031)*sign, middle(y[outer]), level))
        hand, forearm, upper_arm = joints
        arm_x[on_side] = np.interp(z[on_side], (wrist, elbow, shoulder), [v[0] for v in joints])
        arm_y[on_side] = np.interp(z[on_side], (wrist, elbow, shoulder), [v[1] for v in joints])
        if case_id == 'lin-yue' and side == 'R':
            # Her lifted hand stays at the temple in the supplied sculpt.
            upper_arm, forearm, hand = ((-.114,-.035,shoulder),(-.196,-.066,.380),(-.211,-.105,.512))
        lx, ly = shins[side]
        points.update({
            'UpperArm.'+side: upper_arm, 'Forearm.'+side: forearm, 'Hand.'+side: hand,
            'Thigh.'+side: (lx,pelvis_y,hip), 'Shin.'+side: (lx,ly,knee),
            'Foot.'+side: (lx,ly+.009,ankle),
        })
    points = {name: tuple(float(c)*height for c in p) for name,p in points.items()}
    rig = create_armature(case_id, points)

    neighbours = surface_graph(mesh.data, xyz)
    left = surface_blend(neighbours, (x-center > .038) & (z < hip-.065),
                         (center-x > .038) & (z < hip-.065), .055,
                         smooth(center-.008, center+.008, x))
    hand_region = (z > fingertips-.014) & (z < shoulder-.010)
    if case_id == 'lin-yue':
        hand_region &= x > center
    arm_seeds = hand_region & (abs(x-center) > abs(arm_x-center)+.001) & (abs(y-arm_y) < .070)
    trunk_seeds = ((abs(x-center) < .078) | (z < fingertips-.035) |
                   (z > shoulder+.018) | (abs(y-arm_y) > .115))
    hand_join = {'lin-yue':.180, 'chen-yang':.224, 'zhou-ning':.224,
                 'zhao-hang':.242, 'sun-lan':.183}[case_id]
    fingers, lower_body = wrist_seeds(neighbours, x, z, center, hand_join)
    arm_seeds = (arm_seeds & ~lower_body) | fingers
    trunk_seeds = (trunk_seeds & ~fingers) | lower_body
    arms = surface_blend(neighbours, arm_seeds, trunk_seeds, .045,
                         smooth(-.055,.010,abs(x-center)-abs(arm_x-center)))
    arms *= 1.-smooth(shoulder-.022, shoulder+.012, z)
    if case_id == 'lin-yue':
        arms[x < center] = 0.

    head = smooth(chin-.046, chin+.002, z)
    if case_id == 'lin-yue':
        bob = smooth(.015,.096,y)*smooth(.345,.394,z)
        temple = (x < center-.085)*smooth(.371,.507,z)
        head = np.maximum.reduce([head, bob, temple])
    elif case_id == 'zhou-ning':
        # The ponytail hangs in open space behind the blouse, below her shoulders.
        head = np.maximum(head, smooth(.066,.091,y) * smooth(.249,.279,z))

    inner_leg = 1.-smooth(.018,.072,abs(x-center))
    hips = smooth(hip-.071,hip+.035,z)
    hips = np.maximum(hips, inner_leg*smooth(hip-.100,hip-.029,z))
    chest = smooth(hip+.022,shoulder-.028,z)
    shin = 1.-smooth(knee-.045,knee+.050,z)
    shoe = 1.-smooth(ankle-.008,ankle+.028,z)
    hand = 1.-smooth(wrist-.022,wrist+.023,z)
    lower_arm = 1.-smooth(elbow-.030,elbow+.031,z)

    trunk = (1.-head)*(1.-arms)
    weights = {'Head':head, 'Hips':trunk*hips*(1.-chest), 'Chest':trunk*hips*chest}
    for side, portion, sign in (('L',left,1),('R',1.-left,-1)):
        leg = trunk*(1.-hips)*portion
        arm = (1.-head)*arms*((x-center)*sign >= 0)
        weights.update({
            'Thigh.'+side: leg*(1.-shin), 'Shin.'+side: leg*shin*(1.-shoe),
            'Foot.'+side: leg*shin*shoe, 'UpperArm.'+side: arm*(1.-lower_arm),
            'Forearm.'+side: arm*lower_arm*(1.-hand), 'Hand.'+side: arm*lower_arm*hand,
        })
    groups = [mesh.vertex_groups.new(name=name) for name in weights]
    matrix = np.stack(list(weights.values()),axis=1)
    # glTF has four weights per vertex. Do the same reduction in the editable file.
    strongest = np.argsort(matrix,axis=1)[:, -4:]
    values = np.take_along_axis(matrix,strongest,axis=1)
    values[values < .0001] = 0.
    values /= values.sum(axis=1, keepdims=True)
    for i, (indices, amounts) in enumerate(zip(strongest.tolist(),values.tolist())):
        for group, value in zip(indices,amounts):
            if value:
                groups[group].add([i],value,'REPLACE')
    mesh.parent = rig
    modifier = mesh.modifiers.new('Patient skin','ARMATURE')
    modifier.object = rig

    soles = []
    for side in ('L', 'R'):
        name = 'Foot.'+side
        inverse = rig.data.bones[name].matrix_local.inverted()
        sole = (weights[name] > .999) & (z < .031)
        soles.append((name,[inverse @ Vector(point) for point in coordinates[sole]]))
    animate(case_id, rig, points, soles)
    return rig


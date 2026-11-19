"""Ground-contact walking cycles for the outpatient characters (Blender: forward = -Y)."""
import math

from mathutils import Euler, Quaternion, Vector

from rig import PARENTS


# Frames at 30 fps, swing clearance, arm swing, upper-body lean.
WALKS = {
    'lin-yue': (38, .038, .15, .035),
    'chen-yang': (39, .043, .21, .025),
    'zhou-ning': (38, .037, .15, .035),
    'zhao-hang': (36, .033, .16, .045),
    'sun-lan': (36, .029, .12, .065),
}
BASE_SPEED = .56 / 1.2


def ease(t):
    return t*t*(3-2*t)


def foot_target(phase, ankle, sole, stride, duty, clearance, roll):
    """During stance the ground moves backwards exactly as fast as the character advances."""
    heel, toe = -.10*roll, .16*roll
    travel = stride*(phase-duty/2)
    lift = 0.
    if phase < .12:
        pitch = heel*(1-ease(phase/.12))
    elif phase < duty-.17:
        pitch = 0.
    elif phase < duty:
        pitch = toe*ease((phase-duty+.17)/.17)
    else:
        u = (phase-duty)/(1-duty)
        # Match the velocity of the planted shoe at BOTH ends of the swing.
        travel -= stride*ease(u)
        lift = clearance*math.sin(math.pi*u)**2
        pitch = toe+(heel-toe)*ease(u)
    s,c = math.sin(pitch),math.cos(pitch)
    bottom = min(s*v.y+c*v.z for v in sole)
    neutral = min(v.z for v in sole)
    # Roll around the actual sole instead of rotating a foot around a stationary ankle.
    roll_y = pitch*(neutral+bottom)*.5
    return Vector((ankle.x, ankle.y+travel+roll_y, lift-bottom)), pitch


def key_walk(case_id, rig, points, sole_points):
    length, clearance, swing, lean = WALKS[case_id]
    stride = BASE_SPEED*length/30
    bones = rig.data.bones
    rest = {key: Vector(p) for key,p in points.items()}
    basis = {b.name: b.matrix_local.to_quaternion() for b in bones}
    soles = {key: [basis[key] @ v for v in verts] for key,verts in sole_points.items()}
    segments = {}
    for side in ('L','R'):
        hip,knee,ankle = [rest[key+'.'+side] for key in ('Thigh','Shin','Foot')]
        segments[side] = (knee-hip,ankle-knee)

    forward = Vector((0,-1,0))
    for frame in range(length+1):
        phase = (frame % length)/length
        cycle = math.tau*phase
        shift = math.sin(cycle)
        pelvis = Euler((0.,.019*shift,-.043*math.cos(cycle))).to_quaternion()
        body_shift = Vector((.011*shift,0.,0.))
        # The pelvis peaks over the planted leg, and settles slightly in double support.
        height = -.005 - .004*math.cos(2*cycle)
        targets = {}
        for side,offset in (('L',0.),('R',.5)):
            foot = 'Foot.'+side
            p = (phase+offset)%1
            injured = case_id == 'zhao-hang' and side == 'R'
            duty = .52 if injured else (.57 if case_id in ('sun-lan','zhao-hang') else .55)
            target,pitch = foot_target(p,rest[foot],soles[foot],stride,duty,
                                       clearance*(.77 if injured else 1.), .7 if injured or case_id=='sun-lan' else 1.)
            # Center the walking arc under the hip even when the scan stands with its heels set back.
            target.y += rest['Thigh.'+side].y-rest[foot].y
            hip = rest['Hips'] + pelvis @ (rest['Thigh.'+side]-rest['Hips']) + body_shift
            upper,lower = segments[side]
            reach = upper.length+lower.length-.001
            horizontal = (hip.x-target.x)**2 + (hip.y-target.y)**2
            limit = target.z+math.sqrt(max(0,reach**2-horizontal))-hip.z
            height = min(height,limit)
            targets[side] = (hip,target,pitch)
        body_shift.z = height
        chest = Euler((lean + .004*math.cos(2*cycle), -.010*shift, .030*math.cos(cycle))).to_quaternion()
        world = {'Root': Quaternion(), 'Hips': pelvis, 'Chest': chest,
                 'Head': Euler((lean*.3, -.018 if case_id=='lin-yue' else -.004*shift,
                                .007*math.cos(cycle))).to_quaternion()}
        rig.pose.bones['Root'].location = basis['Root'].inverted() @ body_shift
        rig.pose.bones['Root'].keyframe_insert(data_path='location', frame=frame+1, group='Root')
        for side,sign in (('L',1),('R',-1)):
            suffix = '.'+side
            hip,target,pitch = targets[side]
            hip.z += height
            upper,lower = segments[side]
            direction = target-hip
            distance = direction.length
            direction.normalize()
            along = (upper.length_squared - lower.length_squared + distance**2)/(2*distance)
            pole = (forward-direction*direction.dot(forward)).normalized()
            knee = hip + direction*along + pole*math.sqrt(max(0.,upper.length_squared-along**2))
            world['Thigh'+suffix] = upper.rotation_difference(knee-hip)
            world['Shin'+suffix] = lower.rotation_difference(target-knee)
            world['Foot'+suffix] = Quaternion((1,0,0),pitch)
            arm = sign*math.cos(cycle+.10)
            held = case_id=='lin-yue' and side=='R'
            world['UpperArm'+suffix] = chest @ Quaternion((1,0,0),0 if held else swing*arm)
            world['Forearm'+suffix] = world['UpperArm'+suffix] @ Quaternion((1,0,0),0 if held else -.065+.033*arm)
        for name,rotation in world.items():
            if name == 'Root':
                continue
            # Convert solved world-space orientations into glTF-exportable local bone rotations.
            local = world[PARENTS[name]].inverted() @ rotation
            bone = rig.pose.bones[name]
            bone.rotation_quaternion = basis[name].inverted() @ local @ basis[name]
            bone.keyframe_insert(data_path='rotation_quaternion',frame=frame+1,group=name)

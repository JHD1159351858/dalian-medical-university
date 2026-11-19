"""Blender garment patterns for the five outpatient figures. Coordinates are in metres."""

import math

import bpy
import numpy as np
from mathutils import Vector

TAU = math.tau
FITS = {
    'lin-yue': ('mulberry', '#884865', '#6d3950', '#565673', '#f6e6dc', '#dfc6b6', '#f2c2a6'),
    'chen-yang': ('sage', '#788863', '#56694e', '#645b52', '#936c53', '#c5a380', '#eabe9b'),
    'zhou-ning': ('rose', '#cc8189', '#b46776', '#eadcc8', '#bd8e88', '#b2947f', '#f1c1a6'),
    'zhao-hang': ('cobalt', '#315ea8', '#234371', '#344764', '#edf1eb', '#b9c9cf', '#d6a380'),
    'sun-lan': ('clay', '#ae665d', '#884940', '#515c54', '#886750', '#4d413a', '#e9bd9f'),
}


def mix(a, b, t):
    return a + (b - a) * t


def smooth(t):
    t = max(0., min(1., t))
    return t * t * (3 - 2 * t)


def linear_color(hexcolor):
    def linear(x):
        return x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4
    return tuple(linear(int(hexcolor[i:i+2], 16) / 255) for i in (1, 3, 5)) + (1.,)


def textile_normal(style):
    """Seamless small tangent-space patterns, generated and packed in Blender."""
    name = 'Textile sample · ' + style
    if name in bpy.data.images:
        return bpy.data.images[name]
    shape = 256
    y, x = np.mgrid[:shape, :shape] / shape * TAU
    if style == 'knit':
        # Mirrored chain stitches lean into the next wale rather than horizontal stripes.
        lane = np.cos(12*x)
        height = .55 * np.cos(24*x) + .55 * np.cos(22*y + 1.7*lane) + .20 * np.cos(48*x + 22*y)
    elif style == 'twill':
        height = .68*np.sin(27*(x-y)) + .23*np.cos(38*y) + .17*np.sin(46*x)
    else:
        height = .55*np.cos(32*x) * np.sin(32*y) + .3*np.sin(48*x) + .22*np.cos(48*y)
    dx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * .23
    dy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) * .23
    norm = np.sqrt(1 + dx*dx + dy*dy)
    pixels = np.stack((.5-dx/norm*.5, .5-dy/norm*.5, .5+.5/norm, np.ones_like(x)), axis=-1)
    img = bpy.data.images.new(name, width=shape, height=shape, alpha=False)
    img.colorspace_settings.name = 'Non-Color'
    img.pixels.foreach_set(pixels.astype('float32').ravel())
    img.pack()
    return img


def fabric(name, color, weave=None, rough=.73, metallic=0.):
    name = 'Wardrobe · ' + name + ' · ' + color
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = linear_color(color)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    p = nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = mat.diffuse_color
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metallic
    if weave:
        image = nodes.new('ShaderNodeTexImage')
        image.image = textile_normal(weave)
        normal = nodes.new('ShaderNodeNormalMap')
        normal.inputs['Strength'].default_value = .34
        links.new(image.outputs['Color'], normal.inputs['Color'])
        links.new(normal.outputs['Normal'], p.inputs['Normal'])
    return mat


class Tailor:
    def __init__(self):
        self.parts = []

    def mesh(self, name, points, faces, material, bone, uv=None, weights=None):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(points, [], faces)
        mesh.materials.append(material)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        obj['bone'] = bone
        for face in mesh.polygons:
            face.use_smooth = True
        if uv:
            layer = mesh.uv_layers.new(name='Cut cloth')
            for face in mesh.polygons:
                # Cylindrical UVs cross the back seam at a multiple of the repeating tile.
                u = [uv[i][0] for i in face.vertices]
                wrap = max(u) - min(u) > 2
                for idx, vert in zip(face.loop_indices, face.vertices):
                    a, b = uv[vert]
                    layer.data[idx].uv = (a + 4 if wrap and a < 2 else a, b)
        if weights:
            groups = {}
            for i, pos in enumerate(points):
                for key, amount in weights(Vector(pos)).items():
                    if amount <= 1.e-5:
                        continue
                    if key not in groups:
                        groups[key] = obj.vertex_groups.new(name=key)
                    groups[key].add([i], amount, 'REPLACE')
        self.parts.append(obj)
        return obj

    def surface(self, name, material, bone, nz, na, point, weights=None, cap=True):
        """Tubular tailoring block. Angular zero is the centre front, increasing toward the wearer's left."""
        points, uv, faces = [], [], []
        for j in range(nz + 1):
            for k in range(na):
                p = point(j/nz, TAU*k/na)
                points.append(tuple(p))
                uv.append((4*k/na, p[2]*9.))
        for j in range(nz):
            for k in range(na):
                a, b = j*na+k, j*na+(k+1)%na
                faces.append((a,b,b+na,a+na))
        for top, ring in ([(False, 0), (True, nz)] if cap else []):
            indices = [ring*na+k for k in range(na)]
            centre = sum((Vector(points[i]) for i in indices), Vector((0,0,0)))/na
            ci = len(points)
            points.append(tuple(centre))
            uv.append((2.,centre.z*9.))
            for k in range(na):
                a,b = indices[k], indices[(k+1)%na]
                faces.append((ci,a,b) if top else (ci,b,a))
        return self.mesh(name,points,faces,material,bone,uv,weights)

    def ball(self,name,mat,bone,pos,radii,tilt=0.):
        def point(t,a):
            lat = math.pi*(.001+t*.998)
            return (pos[0]+radii[0]*math.sin(lat)*math.sin(a)+tilt*(t-.5),
                    pos[1]-radii[1]*math.sin(lat)*math.cos(a),pos[2]-radii[2]*math.cos(lat))
        return self.surface(name,mat,bone,10,22,point)

    def piping(self,name,mat,bone,points,radius=.0025,loop=False, weights=None):
        curve = bpy.data.curves.new(name,'CURVE')
        curve.dimensions='3D'
        curve.resolution_u=4
        curve.bevel_depth=radius
        curve.bevel_resolution=2
        spline=curve.splines.new('BEZIER')
        spline.bezier_points.add(len(points)-1)
        for cp,co in zip(spline.bezier_points,points):
            cp.co=co
            cp.handle_left_type=cp.handle_right_type='AUTO'
        spline.use_cyclic_u=loop
        temp=bpy.data.objects.new(name+' path',curve)
        bpy.context.collection.objects.link(temp)
        deps=bpy.context.evaluated_depsgraph_get()
        mesh=bpy.data.meshes.new_from_object(temp.evaluated_get(deps))
        points=[v.co[:] for v in mesh.vertices]
        faces=[p.vertices[:] for p in mesh.polygons]
        bpy.data.objects.remove(temp,do_unlink=True)
        bpy.data.curves.remove(curve)
        bpy.data.meshes.remove(mesh)
        return self.mesh(name,points,faces,mat,bone,weights=weights)

    def panel(self,name,mat,bone,rows,weights=None):
        # Rows run from hem toward neck, columns from wearer's right toward left.
        n=len(rows[0])
        pts=[tuple(p) for row in rows for p in row]
        faces=[(j*n+i,j*n+i+1,(j+1)*n+i+1,(j+1)*n+i)
               for j in range(len(rows)-1) for i in range(n-1)]
        return self.mesh(name,pts,faces,mat,bone,
                         [(p[0]*9,p[2]*9) for p in pts],weights)


def sample(profile, t):
    """Smooth interpolation at pattern landmarks, without spline overshoot at cuffs."""
    if t <= profile[0][0]:
        return profile[0][1:]
    for left,right in zip(profile,profile[1:]):
        if t <= right[0]:
            alpha=(t-left[0])/(right[0]-left[0])
            return tuple(mix(a,b,alpha) for a,b in zip(left[1:],right[1:]))
    return profile[-1][1:]


def soft_power(a,n):
    return math.copysign(abs(a)**n, a)


def torso(tailor, style, rig, m):
    hip, chin = rig['Hips'][2], rig['Head'][2]
    width = abs(rig['UpperArm.L'][0])
    blouse, old, jersey = style=='rose',style=='clay',style=='cobalt'
    sweater, shirt = style=='mulberry',style=='sage'
    hem = hip - (.025 if blouse or old else .012)
    top = chin-.051
    profile=[
        (0,.98,.65),(.014,1.02,.67),(.055,1.035,.68),(.16,1.00,.66),
        (.32,.91 if blouse else .95,.63),(.48,.91 if blouse else .97,.64),
        (.66,1.01,.69),(.81,1.04,.70),(.88,1.00,.64),(.93,.85,.56),(.98,.52,.40),(1,.42,.34),
    ]
    def point(t,a,offset=0):
        rx,ry=sample(profile,t)
        front=max(0,math.cos(a))
        # Shallow irregular drapes localised below the waist, plus tension near the armholes.
        folds=(.0055*math.cos(6*a+1.1*t)+.0028*math.cos(11*a-2.3*t))*(1-smooth((t-.12)/.48))
        folds+=.0035*math.sin(12*t+2*math.cos(a))*math.sin(a)**4
        x=(width*(rx+.055)+folds+offset)*soft_power(math.sin(a),.96)
        dy=(width*(ry+.09)+folds+offset)*soft_power(math.cos(a),.93)
        cy=mix(rig['Hips'][1],rig['Head'][1],t)
        y=cy-dy-.010*front*math.sin(math.pi*t)**2
        z=mix(hem,top,t)-(.012 if blouse else .006)*front*(1-t)**4
        z-=(.021 if blouse or old else .012)*front*t**7
        return Vector((x,y,z))
    def torso_weights(pos):
        amt=smooth((pos.z-hip-.012)/.25)
        return {'Hips':1-amt,'Chest':amt}
    def on(t,a,off=.004):
        return point(t,a,off)
    tailor.surface('Shaped torso | '+style,m['top'],'Chest',46,64,point,torso_weights)

    def band(name,t0,t1,color):
        ribbed = sweater or old
        def binding(q,a):
            relief=(.0012+.0016*math.cos(60*a)) if ribbed else 0
            return on(mix(t0,t1,q),a,.0028+(.002+relief)*math.sin(q*math.pi))
        tailor.surface(name,color,'Chest',6,240 if ribbed else 64,binding,torso_weights,cap=False)
    def centre_panel(name, t0,t1,width_fn,color,off=.006,center=0):
        rows=[]
        for j in range(20):
            t=mix(t0,t1,j/19)
            left,right=width_fn(t)
            rows.append([on(t,mix(left,right,i/8)+center,off) for i in range(9)])
        return tailor.panel(name,color,'Chest',rows,torso_weights)
    def seam(name,lo,hi,afun,colour,rad=.002):
        tailor.piping(name,colour,'Chest',[on(mix(lo,hi,i/10),afun(mix(lo,hi,i/10)),.008) for i in range(11)],rad,weights=torso_weights)
    # Close the back of the neckline with a tailored fabric welt.
    if blouse or old:
        gap = .40 if old else .19
        rows=[[on(mix(.954,1,j/6),mix(gap,TAU-gap,i/112),.0036)
               for i in range(113)] for j in range(7)]
        tailor.panel('Split neck binding',m['top'] if old else m['trim'],'Chest',rows,torso_weights)
    else:
        band('Neck binding',.954,1,m['trim'])
    tailor.piping('Back neck topstitch',m['stitch'],'Chest',[on(.976,1.4+i*(TAU-2.8)/12,.006) for i in range(13)],.0017,weights=torso_weights)
    if sweater:
        band('Deep ribbed knit hem',.008,.12,m['rib'])
        tailor.piping('Raised link at rib transition',m['trim'],'Chest',[on(.12,TAU*i/36,.007) for i in range(36)],.0028,True,torso_weights)
        for s in (-1,1):
            seam('Raglan sleeve seam',.69,.96,lambda t:s*mix(1.58,.55,(t-.69)/.27),m['trim'],.003)
            seam('Raglan twin stitch',.70,.955,lambda t:s*mix(1.54,.51,(t-.69)/.27),m['stitch'],.0014)
    elif shirt:
        centre_panel('Button placket',.018,.947,lambda t:(-.069,.069),m['top'])
        seam('Placket left stitch',.025,.94,lambda t:-.068,m['stitch'],.0014)
        for j in range(5):
            t=.16+.155*j
            p=on(t,0,.009)
            tailor.ball('Smoke horn shirt button',m['button'],'Chest' if t>.42 else 'Hips',p,(.009,.003,.009))
        for s in (-1,1):
            # A wide folded point, rolled back at the neck.
            rows=[]
            for j in range(15):
                q=j/14
                left=mix(.38,.075,q)
                right=mix(.405,1.08,q)
                rows.append([on(mix(.795,.966,q)+.027*math.sin(i/10*math.pi)*q,
                                s*mix(left,right,i/10),.010+.0055*math.sin(i/10*math.pi)) for i in range(11)])
            if s<0: rows=[list(reversed(row)) for row in rows]
            tailor.panel('Turned collar leaf',m['trim'],'Chest',rows,torso_weights)
        centre_panel('Patch chest pocket',.54,.71,lambda t:(.28,.75),m['top'],.008)
        tailor.piping('Rounded pocket facing',m['stitch'],'Chest',[on(.70,.28+.47*i/8,.010) for i in range(9)],.0024,weights=torso_weights)
        # Strap wraps front and back over opposite shoulder to the satchel.
        for back in (False,True):
            rows=[]
            for j in range(34):
                t=mix(.067,.911,j/33)
                angle=mix(1.12,-1.57,(t-.067)/.844)
                if back: angle=math.pi-angle
                rows.append([on(t,angle+i*.068,.0135-.007*smooth((t-.7)/.18)) for i in (-1,0,1)])
            if back: rows=[list(reversed(row)) for row in rows]
            tailor.panel('Leather crossbody strap',m['leather'],'Chest',rows,torso_weights)
        cx=width*.78
        cy=-.119
        bagz=hip-.048
        def bag(q,a):
            fac,depth=sample([(0,.76,.73),(.08,.98,.94),(.18,1,1),(.84,1,1),(.96,.92,.89),(1,.77,.83)],q)
            return (cx+.076*fac*soft_power(math.sin(a),.66),cy-.040*depth*soft_power(math.cos(a),.70),bagz+q*.117)
        tailor.surface('Soft box crossbody satchel',m['leather'],'Hips',14,40,bag)
        rows=[]
        for j in range(13):
            q=j/12
            row=[]
            for i in range(21):
                a=mix(-1.40,1.40,i/20)
                v=Vector(bag(mix(.44+.10*(abs(a)/1.4)**2,.95,q),a))
                v.y-=.004+.002*math.sin(q*math.pi)
                row.append(v)
            rows.append(row)
        tailor.panel('Curved leather satchel flap',m['lightLeather'],'Hips',rows)
        tailor.piping('Satchel edge finish',m['trimLeather'],'Hips',rows[0][::2],.0015)
        tailor.ball('Brass satchel stud',m['brass'],'Hips',(cx,cy-.049,bagz+.061),(.007,.0035,.007))
    elif blouse:
        band('Folded curved hem',.015,.046,m['top'])
        for s in (-1,1):
            seam('Gathered shoulder pintuck',.76,.93,lambda t:s*(.53+.48*(.93-t)),m['stitch'],.0013)
        centre_panel('Open blouse notch',.858,1,lambda t:(-(t-.858)*1.38,(t-.858)*1.38),m['skin'],.006)
        tailor.piping('Narrow neckline facing',m['trim'],'Chest',
                      [on(1,-.20,.008),on(.917,-.083,.008),on(.857,0,.008),on(.917,.083,.008),on(1,.20,.008)],.0024)
    elif jersey:
        for s in (-1,1):
            centre_panel('Underarm contrast panel',.025,.76,lambda t:(-.25,.25),m['trim'],.004,center=s*1.48)
            seam('Curved jersey yoke line',.73,.95,lambda t:s*mix(1.45,.47,(t-.73)/.22),m['light'],.003)
        band('Jersey welt hem',.012,.053,m['trim'])
    elif old:
        def opening(t):
            return .065 + .33*smooth((t-.52)/.45)
        centre_panel('Visible inner ivory knit',.02,1,lambda t:(-opening(t),opening(t)),m['cream'],.006)
        for s in (-1,1):
            centre_panel('Cardigan button band',.019,.978,lambda t:(s*opening(t)-.048,s*opening(t)+.048),m['rib'],.009)
            centre_panel('Rounded cardigan pocket',.13,.27,lambda t:(s*.89-.19,s*.89+.19),m['top'],.009)
            tailor.piping('Pocket opening piping',m['rib'],'Hips',[on(.276,s*.89-.19+i*.38/8,.013) for i in range(9)],.004,weights=torso_weights)
        for t in (.14,.30,.46,.62):
            p=on(t,-opening(t),.015)
            tailor.ball('Pearl cardigan button',m['button'],'Hips' if t<.4 else 'Chest',p,(.009,.003,.009))
        band('Cardigan rib hem',.007,.051,m['rib'])
    # Exposed neck has a gentle cut into shoulder, smooth upper rim into the head.
    neck=rig['Head']
    tailor.surface('Nape and throat',m['skin'],'Head',15,40,
                   lambda q,a: (neck[0]+mix(.067,.077,q)*math.sin(a),
                                neck[1]-mix(.061,.067,q)*math.cos(a),chin-.085+q*.13))


def articulated(rig, names):
    high, middle, low = (Vector(rig[n]) for n in names)
    def centre(t):
        z = mix(low.z, high.z, t)
        if z < middle.z:
            return low.lerp(middle, (z-low.z)/(middle.z-low.z))
        return middle.lerp(high, (z-middle.z)/(high.z-middle.z))
    def weights(p):
        lower=1-smooth((p.z-middle.z+.052)/.104)
        return {names[0]:1-lower,names[1]:lower}
    return centre, weights


def hand(tailor, boneside, sign, wrist, skin, nail):
    """Single fused hand sculpt, including relaxed digits and an opposed thumb."""
    bone='Hand.'+boneside
    wrist=Vector(wrist)
    mirrored=lambda p: wrist+Vector((sign*p[0],p[1],p[2]))
    objects=[]
    objects.append(tailor.ball('Palm mass',skin,bone,mirrored((.002,.0,-.030)),(.031,.042,.048)))
    for i,(depth,length) in enumerate(((-.025,.046),(-.008,.057),(.010,.052),(.027,.039))):
        b=mirrored((.004,depth,-.051))
        # Slightly curled fingertips, with more flexion toward the little finger.
        f=mirrored((-.008-.004*i,depth+.004,-.051-length))
        radius=.0135 if i<2 else .0125
        path=lambda q:b.lerp(f,q)+Vector((sign*.005*math.sin(math.pi*q),0,0))
        def point(q,a):
            p=path(1-q)
            r=radius*sample([(0,.86),(.14,1),(.54,.94),(.80,.83),(.95,.56),(1,.1)],1-q)[0]
            return (p.x+r*math.sin(a),p.y-r*.82*math.cos(a),p.z)
        objects.append(tailor.surface('Relaxed digit',skin,bone,10,16,point))
    base=mirrored((-.001,-.025,-.019))
    end=mirrored((-.012,-.055,-.060))
    def thumb(q,a):
        p=end.lerp(base,q)
        r=.019*sample([(0,.12),(.13,.70),(.36,.88),(.68,1),(1,.90)],q)[0]
        return (p.x+r*math.sin(a),p.y-r*.87*math.cos(a),p.z)
    objects.append(tailor.surface('Thumb lobe',skin,bone,12,18,thumb))
    # Voxel sculpt fuses the finger web spaces; a single surface keeps tiny joints from looking glued on.
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
        tailor.parts.remove(obj)
    palm=objects[0]
    bpy.context.view_layer.objects.active=palm
    bpy.ops.object.join()
    palm.data.remesh_voxel_size=.0033
    bpy.ops.object.voxel_remesh()
    smooth_mod=palm.modifiers.new('Smooth finger webs','SMOOTH')
    smooth_mod.factor=.56
    smooth_mod.iterations=3
    bpy.ops.object.modifier_apply(modifier=smooth_mod.name)
    decimate=palm.modifiers.new('Polished palm topology','DECIMATE')
    decimate.ratio=.37
    bpy.ops.object.modifier_apply(modifier=decimate.name)
    for poly in palm.data.polygons: poly.use_smooth=True
    palm.name='Sculpted relaxed hand '+boneside
    palm['bone']=bone
    tailor.parts.append(palm)
    # Nail planes face outward and follow the curled tips.
    for i,(depth,length) in enumerate(((-.025,.046),(-.008,.057),(.010,.052),(.027,.039))):
        pos=mirrored((.004-.004*i,depth+.004,-.049-length+.009))
        tailor.ball('Satin fingernail',nail,bone,pos,(.0025,.0063,.008))


def sleeves(tailor,style,side,sign,rig,m):
    bones=['UpperArm.'+side,'Forearm.'+side,'Hand.'+side]
    shoulder, elbow, wrist=(Vector(rig[n]) for n in bones)
    centre,limb_weights=articulated(rig,bones)
    length=shoulder.z-wrist.z
    def weights(pos):
        support = .48*smooth((pos.z-shoulder.z+.021)/.046)
        return {**{k:v*(1-support) for k,v in limb_weights(pos).items()},'Chest':support}
    cut={'mulberry':.04,'sage':.29,'rose':.56,'cobalt':.53,'clay':.055}[style]
    short=style in ('rose','cobalt')
    width=.071 if style in ('sage','cobalt') else .066
    if cut>.12:
        def skin(q,a):
            t=mix(-.05,cut+.10,q)
            c=centre(t)
            r=sample([(-.05,.026),(.08,.029),(.28,.044),(.5,.038),(.76,.051)],t)[0]
            return (c.x+r*math.sin(a),c.y-.94*r*math.cos(a),c.z)
        tailor.surface('Exposed forearm',m['skin'],bones[1],28,34,skin,weights)
    def sleeve(q,a,push=0):
        t=mix(cut,1.09,q)
        c=centre(t)
        profile=[
            (0,.69),(.016,.72),(.064,.79),(.10,.87),(.17,.85),(.27,.91),
            (.42,.85),(.52,.96),(.68,1),(.79,1.04),(.89,1),(.94,.83),(.98,.54),(1,.16)]
        r=width*sample(profile,q)[0]
        if not short:
            r+=.0042*math.cos(6*a + 1.4*q)*(.16+.8*math.sin(q*math.pi)**2)
            r+=.0030*math.cos(13*math.pi*q-1.6*math.sin(a))*(1-smooth(abs(t-.48)/.24))
        else:
            r+=.003*math.cos(5*a+q)*(1-q)
        if q>.87:
            c.x-=sign*.018*smooth((q-.87)/.13)
        return (c.x+(r+push)*math.sin(a),c.y-(r*.93+push)*math.cos(a),c.z)
    tailor.surface('Set-in sleeve '+side,m['top'],bones[0],36,40,sleeve,weights)
    band_end=.13 if style in ('mulberry','sage','clay') else .065
    bandmat=m['rib'] if style in ('mulberry','clay') else m['top']
    if style=='sage': bandmat=m['trim']
    tailor.surface('Turned sleeve cuff '+side,bandmat,bones[0],8,40,
                   lambda q,a:sleeve(mix(0,band_end,q),a,.002+.0033*math.sin(q*math.pi)),weights)
    tailor.piping('Stitched cuff edge',m['stitch'],bones[0],[sleeve(.020,i*TAU/28,.0048) for i in range(28)],
                  .00175,True,weights)
    if style=='cobalt':
        outward=sign*math.pi/2
        for a in (outward-.18,outward+.18):
            rows=[[sleeve(mix(.06,.93,j/24),a+offset,.004) for offset in (-.051,0,.051)] for j in range(25)]
            tailor.panel('Woven double sport stripe',m['light'],bones[0],rows,weights)
    if style=='sage':
        c=Vector(sleeve(.073,sign*math.pi/2,.006))
        tailor.ball('Sleeve tab stud',m['button'],bones[1],c,(.003,.006,.006))
    hand(tailor,side,sign,wrist,m['skin'],m['nail'])


def shoe(tailor, style, side, sign, rig, m):
    foot='Foot.'+side
    cx,cy,_=rig[foot]
    sneaker=style in ('mulberry','cobalt')
    leather=style in ('sage','clay')
    wide=1.05 if style in ('sage','clay') else 1.
    # The asymmetric foot-last has a tapered mid-foot, rounded toe box, and inset heel.
    def last(a):
        front=math.cos(a)
        y=(-.049-.101*front)* (1.10 if style=='cobalt' else 1.)
        toe=smooth((front+.1)/1.1)
        x=.064*wide*soft_power(math.sin(a),.85)*(.82+.21*toe)
        x+=sign*.009*toe
        y+=.005*max(0,-sign*math.sin(a))*toe
        return x,y,toe
    def sole(q,a,scale=1.,above=0):
        x,y,toe=last(a)
        outline=.955+.045*math.sin(math.pi*q)
        # Rocker profile lifts the end of the toe and heel off the floor.
        rocker=.014*max(0,math.cos(a))**3 + .004*max(0,-math.cos(a))**4
        z=rocker+.001+q*.026+above
        return (cx+x*outline*scale,cy+y*outline*scale,z)
    tailor.surface('Moulded rubber outsole',m['sole'],foot,9,44,sole)
    tailor.surface('Midsole sidewall',m['light'] if sneaker else m['sole'],foot,7,44,
                   lambda q,a:sole(.58+.42*q,a,1.003,.0035))
    def upper(q,a,push=0):
        x,y,toe=last(a)
        fac,basey=sample([(0,.97,0),(.06,1,0),(.3,.97,.001),(.53,.89,.004),(.73,.73,.012),(.89,.54,.022),(1,.43,.025)],q)
        z0=sole(1,a)[2]
        z=mix(z0-.002,.095+.008*max(-math.cos(a),0),q)
        z-=.019*toe*math.sin(q*math.pi)
        return (cx+x*(fac+push),cy+y*fac+basey,z)
    tailor.surface('Shaped shoe upper',m['shoe'],foot,26,44,upper)
    tailor.piping('Raised sole welt',m['light'] if sneaker else m['lightLeather'],foot,
                  [sole(.92,TAU*i/32,1.008,.003) for i in range(32)],.0026,True)
    if sneaker or style=='sage':
        tongue=m['shoe2']
        for sideSign in (-1,1):
            rows=[]
            for j in range(15):
                q=mix(.24,.94,j/14)
                inner=sideSign*(.58+.14*(1-q))
                outer=sideSign*(1.44+.28*(1-q))
                row=[upper(q,mix(inner,outer,i/7),.031) for i in range(8)]
                rows.append(row if sideSign>0 else list(reversed(row)))
            tailor.panel('Lacing eyestay',tongue,foot,rows)
        for j in range(3):
            q=.43+j*.136
            l=upper(q,-.68,.021)
            r=upper(q,.68,.021)
            mid=upper(q+.040,0,.032)
            tie=[Vector(l),Vector(mid)+Vector((0,-.0008,.003)),Vector(r)]
            tailor.piping('Flat woven lace',m['light'] if sneaker else m['trimLeather'],foot,tie,.0031)
        for s in (-1,1):
            rows=[[upper(mix(.15,.64,j/8),s*mix(1.5,2.45,i/5),.036) for i in range(6)] for j in range(9)]
            tailor.panel('Heel overlay',m['shoe2'],foot,rows if s>0 else [list(reversed(r)) for r in rows])
    else:
        for a in (-.94,.94):
            p=upper(.47,a,.02)
            mid=upper(.60,0,.023)
            tailor.piping('Apron toe stitch',m['lightLeather'],foot,[upper(.34,a*1.27,.03),p,mid],.0022)
        if style=='rose':
            row0=[Vector(upper(.66,a,.03)) for a in np.linspace(-1.13,1.13,17)]
            row1=[Vector(upper(.78,a,.03)) for a in np.linspace(-1.13,1.13,17)]
            tailor.panel('Mary Jane instep strap',m['shoe2'],foot,[row0,row1])
            p=upper(.74,sign*1.15,.034)
            tailor.ball('Brushed keeper',m['brass'],foot,p,(.006,.003,.006))


def trousers(tailor,style,side,sign,rig,m):
    bones=['Thigh.'+side,'Shin.'+side,'Foot.'+side]
    thigh, knee, foot=(Vector(rig[n]) for n in bones)
    centre,weights=articulated(rig,bones)
    athlete=style=='cobalt'
    # A tapered upper hip stays inside the shirt, including when the femur swings forward.
    radius={'mulberry':.083,'sage':.088,'rose':.087,'cobalt':.090,'clay':.091}[style]
    def leg(q,a,tip=0):
        t=mix(.55 if athlete else -.012,1.09,q)
        c=centre(t)
        if t>.87:
            c.x-=sign*.016*smooth((t-.87)/.20)
        rx,ry=sample([(0,.66,.64),(.035,.70,.67),(.08,.69,.68),(.24,.71,.73),(.45,.82,.77),
                      (.54,.86,.83),(.67,.98,.96),(.80,1.03,1.02),(.89,1.01,.98),(.99,.86,.86),(1.10,.72,.74)],t)
        if style in ('rose','clay') and t<.52:
            rx+=.18*(1-smooth(t/.52)); ry+=.15*(1-smooth(t/.52))
        dr=.0025*math.sin(a*3+t*3) + .0029*math.cos(t*21+math.cos(a)*2)*math.exp(-((t-.44)/.12)**2)
        x=c.x+(radius*rx+dr+tip)*math.sin(a)
        y=c.y-(radius*ry+dr+tip)*math.cos(a)
        z=c.z + .0025*(1-q)*math.sin(a*3+.25)
        return Vector((x,y,z))
    tailor.surface('Tailored shorts leg' if athlete else 'Tailored trouser leg',m['pants'],bones[0],38,40,leg,weights)
    tailor.piping('Side-leg topstitch',m['pantStitch'],bones[0],
                  [leg(mix(.035,.875,i/14),sign*1.57,.003) for i in range(15)],.00165,weights=weights)
    tailor.surface('Trouser hem facing',m['pants'],bones[0],6,40,
                   lambda q,a:leg(mix(.011,.068,q),a,.0022),weights)
    if athlete:
        def calf(q,a):
            t=mix(-.02,.63,q)
            c=centre(t)
            rx,ry=sample([(-.02,.035,.037),(.15,.039,.041),(.28,.057,.059),(.36,.061,.060),(.48,.048,.050),(.62,.051,.058)],t)
            return Vector((c.x+rx*math.sin(a),c.y-ry*math.cos(a),c.z))
        tailor.surface('Athletic calf',m['skin'],bones[1],25,36,calf,weights)
        def sock(q,a,t0=-.015,t1=.33):
            t=mix(t0,t1,q)
            v=calf((t+.02)/.65,a)
            v+=Vector((.0036*math.sin(a),-.0036*math.cos(a),0))
            return v
        tailor.surface('Ribbed sports sock',m['light'],bones[1],20,36,sock,weights)
        for t in (.275,.309):
            tailor.surface('Sock contrast ring',m['top'],bones[1],4,36,lambda q,a:sock(q,a,t,t+.012),weights)
        for a in (sign*1.49,sign*1.66):
            rows=[[leg(mix(.04,.93,j/12),a+k*.046,.004) for k in (-1,0,1)] for j in range(13)]
            tailor.panel('Track pant piping',m['light'],bones[0],rows,weights)
    shoe(tailor,style,side,sign,rig,m)


def build_body(case_id,rig):
    style,top,trim,pants,uppers,sole,skin=FITS[case_id]
    knit=style in ('mulberry','clay')
    tailor=Tailor()
    m={
        'top':fabric(style+' cloth',top,'knit' if knit else 'cotton'),
        'rib':fabric(style+' rib knit',trim,'knit'),
        'trim':fabric(style+' binding',trim,'cotton'),
        'stitch':fabric(style+' topstitch',blend_color(top,'#e8d4ba',.22)),
        'pants':fabric('Trouser twill',pants,'twill'),
        'pantStitch':fabric('Denim stitch',blend_color(pants,'#dfcfb6',.19)),
        'skin':fabric('Warm skin',skin,None,.53),
        'nail':fabric('Nail bed',blend_color(skin,'#d89890',.32),None,.48),
        'button':fabric('Corozo button','#c3ad87',None,.42),
        'light':fabric('Cotton ivory','#eaeae1','cotton'),
        'cream':fabric('Ivory underlayer','#ebd9c0','knit'),
        'shoe':fabric('Shoe upper',uppers,None,.56),
        'shoe2':fabric('Shoe counter',blend_color(uppers,trim,.23),None,.60),
        'sole':fabric('Moulded sole',sole,None,.75),
        'brass':fabric('Brass', '#be9958', None,.34,.62),
        'leather':fabric('Cognac leather','#956341',None,.60),
        'lightLeather':fabric('Leather edge','#b8865e',None,.62),
        'trimLeather':fabric('Leather lace','#6c4938',None,.67),
    }
    torso(tailor,style,rig,m)
    for side,sign in [('L',1),('R',-1)]:
        sleeves(tailor,style,side,sign,rig,m)
        trousers(tailor,style,side,sign,rig,m)
    return tailor.parts


def blend_color(a,b,t):
    return '#'+''.join(f'{round(mix(int(a[i:i+2],16),int(b[i:i+2],16),t)):02x}' for i in (1,3,5))


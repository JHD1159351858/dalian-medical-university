"""Editable, texture-painted hairstyle meshes for the five outpatient rigs (Blender 5)."""

from functools import lru_cache
from math import sin, cos, pi, exp, sqrt, atan2, hypot
import bpy
import numpy as np
from mathutils import Vector
from face_specs import CASES
from faces import Sculpt


# X = anatomical left, face = -Y, lengths in metres from the chin.
# Rim heights are sampled at the centre fringe, temples, ear, and nape.
STYLES = {
    'lin-yue': dict(cut='bob', width=.367, depth=.304, top=.748, part=.055, sweep=.66,
        rim=(.562,.530,.442,.283,.085,.040,.065), ends=19, base=(64,44,45)),
    'chen-yang': dict(cut='part', width=.371, depth=.307, top=.752, part=.092, sweep=.88,
        rim=(.575,.555,.482,.402,.297,.230,.213), ends=18, base=(48,39,37)),
    'zhou-ning': dict(cut='tie', width=.354, depth=.299, top=.731, part=.049, sweep=.57,
        rim=(.574,.539,.472,.391,.331,.239,.193), ends=19, base=(62,43,40)),
    'zhao-hang': dict(cut='crop', width=.360, depth=.296, top=.728, part=-.038, sweep=-.40,
        rim=(.492,.480,.461,.407,.323,.256,.239), ends=24, base=(42,36,34)),
    'sun-lan': dict(cut='wave', width=.379, depth=.315, top=.750, part=.081, sweep=.65,
        rim=(.561,.527,.445,.282,.162,.102,.131), ends=20, base=(159,148,143)),
}
RIM_ANGLES = (0, .32, .66, .98, 1.34, 2.09, pi)


def clamp(t, low=0., high=1.):
    return min(high, max(low, t))


def ramp(a, b, x):
    t = clamp((x-a)/(b-a))
    return t*t*(3-2*t)


def interp(samples, t):
    """Smoothstep between control values; the compact fringes keep short and long styles distinct."""
    for i in range(len(RIM_ANGLES)-1):
        if t <= RIM_ANGLES[i+1]:
            v = ramp(RIM_ANGLES[i], RIM_ANGLES[i+1], t)
            return samples[i]*(1-v) + samples[i+1]*v
    return samples[-1]


@lru_cache(maxsize=5)
def skull_profile(case_id):
    # Radial distances from the actual sculpt in horizontal slices, including the
    # broad front of the temples. An ellipsoid alone clips the forehead at 3/4.
    sculpt = Sculpt(CASES[case_id])
    heights = np.linspace(.02, .67, 127)
    angles = np.linspace(-pi, pi, 145)
    profile = []
    for z in heights:
        ring = [sculpt.surface(a,z) for a in angles[:-1]]
        theta = np.array([atan2(x,-y) for x,y,_ in ring])
        radii = np.array([hypot(x,y) for x,y,_ in ring])
        profile.append(np.interp(angles,theta,radii,period=2*pi))
    return np.array(profile)


def cover_skull(s, x, y, z):
    if z >= .669 or z < .02:
        return x,y
    data=s['profile']
    row=clamp((z-.02)/.65)*(data.shape[0]-1)
    col=clamp((atan2(x,-y)+pi)/(2*pi))*(data.shape[1]-1)
    i=min(int(row),data.shape[0]-2)
    j=min(int(col),data.shape[1]-2)
    u=col-j; v=row-i
    boundary=(1-v)*((1-u)*data[i,j]+u*data[i,j+1])+v*((1-u)*data[i+1,j]+u*data[i+1,j+1])
    distance=hypot(x,y)
    delta=boundary+.014-distance
    # Smooth maximum leaves a gentle curve where the style departs the scalp.
    scale=1+(delta+sqrt(delta*delta+.000036))/(2*max(.001,distance))
    return x*scale,y*scale


def surface(s, az, level):
    """A scalp-aligned drape. Below the ear it folds inward rather than following the cone of a sphere."""
    cut = s['cut']
    a = (az+pi) % (2*pi)-pi
    side = sin(a)
    z_end = interp(s['rim'], abs(a))
    if cut in ('part','bob','tie','wave'):
        z_end -= (.095 if cut=='part' else .021) * exp(-((a+.50)/.31)**2)
        z_end += .016*exp(-((a-.35)/.29)**2)
    z_end += (.006 if cut=='crop' else .003) * sin(8*a+.6)
    descent = 1-cos(clamp(level)*pi/2)
    z = s['top'] + (z_end-s['top'])*descent
    zc = .345
    if z >= zc:
        radius = sqrt(max(0., 1-((z-zc)/(s['top']-zc))**2))
    else:
        low = (zc-z)/(zc-.035)
        radius = 1-.13*low**1.6 if cut in ('bob','wave') else 1-.26*low**1.6
    middle = sin(pi*level)
    flow = s['sweep'] * (.77-.32*cos(a)) * middle
    if cut=='wave':
        flow += .13*sin(2.7*pi*level-.8*a)*middle
    if cut=='tie':
        flow += sin(a)*.27*middle
    angle = a+flow
    x = s['width']*radius*sin(angle) + s['part']*(1-level)**1.75
    y = .020-s['depth']*radius*cos(angle) + .031*(1-level)**2
    if cut != 'crop':
        # Spread the roots along a real side part, from the forehead back to the crown.
        # Each bank peels away from this seam in a different direction.
        root_span = .165 if cut in ('part','wave') else .132
        root_shift = -root_span*cos(a)*(1-level)**2.35
        z += .88*((y-.020)**2-(y+root_shift-.020)**2)/(s['top']-.345)
        y += root_shift
    if cut=='bob':
        x *= 1+.070*exp(-((z-.19)/.12)**2)
    if cut=='wave':
        x *= 1+.078*exp(-((z-.24)/.14)**2)+.053*cos(3.5*pi*level+.55*sin(3*a))*ramp(.3,.7,level)
        y += .012*sin(3*a + 2*pi*level)*ramp(.4,.74,level)
    if cut=='part':
        z += .025*exp(-((a+.46)/.90)**2)*middle**1.8
    if cut=='crop':
        z += .008*sin(4*a+1.3)*middle**1.8
    x,y=cover_skull(s,x,y,z)
    return Vector((x,y,z))


def outward(point):
    return Vector((point.x/.37**2,(point.y-.018)/.31**2,max(-.12,point.z-.345)/.40**2)).normalized()


def painted_hair(case_id, rgb):
    """Paint direction into a packed base-color texture so the shader survives the GLB export."""
    name = case_id + ' · brushed hair'
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    w,h = 256,512
    u,v = np.meshgrid((np.arange(w)+.5)/w, (np.arange(h)+.5)/h)
    # Continuous root-to-tip grain. Winding and thickness vary inside a lock, with no isolated black strokes.
    u1 = u + .014*np.sin(2*pi*(v+.25*np.cos(2*pi*u)))+.006*np.sin(5*pi*v+4*u)
    brush = .036*np.sin(2*pi*(24*u1+.09*np.sin(5*v))) + .025*np.sin(2*pi*(47*u1-.12*v)) + .012*np.sin(2*pi*89*u1)
    grouped = .039*np.sin(2*pi*(3.1*u1+.37*v)) + .019*np.sin(2*pi*(5.8*u1-.26*v))
    silk = .058*np.exp(-((v-(.58+.05*np.cos(pi*u)))/.12)**2)
    tone = (.97 - .085*(1-v)**3 - .035*v**3 + silk + grouped + brush)
    pale = rgb[0]>120
    pixels=np.ones((h,w,4),dtype=np.float32)
    for ch in range(3):
        pixels[:,:,ch]=np.clip((rgb[ch]/255.)*tone + (0.008 if ch==0 and not pale else 0)*v,0,1)
    image=bpy.data.images.new(case_id+'-combed-strands',width=w,height=h,alpha=False)
    image.colorspace_settings.name='sRGB'
    image.pixels.foreach_set(pixels.ravel())
    image.update()
    image.pack()
    mat = bpy.data.materials.new(name)
    mat.diffuse_color=tuple(c/255 for c in rgb)+(1,)
    mat.use_nodes=True
    nodes=mat.node_tree.nodes
    shader=next(node for node in nodes if node.type == 'BSDF_PRINCIPLED')
    shader.inputs['Roughness'].default_value=.48 if not pale else .52
    shader.inputs['Specular IOR Level'].default_value=.29
    tex=nodes.new('ShaderNodeTexImage')
    tex.image=image
    mat.node_tree.links.new(tex.outputs['Color'],shader.inputs['Base Color'])
    return mat


def swatch(name, color, rough=.49):
    mat=bpy.data.materials.get(name)
    if mat:
        return mat
    mat=bpy.data.materials.new(name)
    mat.use_nodes=True
    shader=next(node for node in mat.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
    linear=tuple(((v/255+.055)/1.055)**2.4 if v/255>.04045 else v/255/12.92 for v in color)
    shader.inputs['Base Color'].default_value=linear+(1,)
    shader.inputs['Roughness'].default_value=rough
    mat.diffuse_color=linear+(1,)
    return mat


class Section:
    def __init__(self, name, chin, material):
        self.name,self.chin,self.material=name,chin,material
        self.verts,self.texcoords,self.faces=[],[],[]

    def patch(self, rows, columns, sample, reverse=False):
        start=len(self.verts)
        for r in range(rows+1):
            v=r/rows
            for col in range(columns+1):
                u=col/columns
                p=sample(u,v)
                self.verts.append((p.x,p.y,p.z+self.chin))
                self.texcoords.append((u,v))
        for r in range(rows):
            for col in range(columns):
                k=start+r*(columns+1)+col
                face=(k,k+1,k+columns+2,k+columns+1)
                self.faces.append(face[::-1] if reverse else face)

    def finish(self):
        mesh=bpy.data.meshes.new(self.name)
        mesh.from_pydata(self.verts,[],self.faces)
        mesh.update()
        uv=mesh.uv_layers.new(name='Flow')
        for loop in mesh.loops:
            uv.data[loop.index].uv=self.texcoords[loop.vertex_index]
        mesh.polygons.foreach_set('use_smooth',[True]*len(mesh.polygons))
        ob=bpy.data.objects.new(self.name,mesh)
        bpy.context.collection.objects.link(ob)
        mesh.materials.append(self.material)
        ob['bone']='Head'
        return ob


def sweep_cap(s, cap, panels):
    n=s['ends']
    def base(u,v):
        p=surface(s,(u-.5)*2*pi,.985*v)
        # modest undercut; visible seams read as shadows in the hair color.
        return p-outward(p)*.002
    cap.patch(32,100,base,True)
    def hem(u,v):
        p=base(u,1)
        p.x*=1-.28*v
        p.y*=1-.28*v
        p.z+=.030*v-.008*sin(pi*v)
        return p
    cap.patch(5,100,hem,True)
    widths=[1+.25*sin(i*2.59+.41)+.15*cos(i*1.34+.22) for i in range(n)]
    endpoints=[-pi]
    for width in widths:
        endpoints.append(endpoints[-1]+width/sum(widths)*2*pi)
    for i in range(n):
        az0,az1=endpoints[i:i+2]
        mid=(az0+az1)/2
        # Crown hair spirals out from the off-centre part. The bob has a weighty blunt hem,
        # while the cropped and tied cuts break into finer tips around the ears.
        blunt=s['cut'] in ('bob','wave')
        def lock(u,v):
            v=.007+.993*v
            edge=(2*u-1)
            narrowing=ramp(.82,1,v) * (.32 if blunt else .82)
            a=mid+(az1-az0)*(.53 if blunt else .55)*edge*(1-narrowing)
            a+=.027*sin(i*2.22)*ramp(.7,1,v)
            p=surface(s,a,v)
            ridge=max(0,1-edge*edge)**1.25
            lift=.002+(.009 if blunt else .012)*ridge*sin(pi*v)**.67
            lift+=.0024*sin(pi*v)*ridge*cos(4.2*pi*u+.36*sin(pi*v))
            p+=outward(p)*lift
            drop=(.011 if blunt else .020)*(.5+.5*sin(i*3.9))
            p.z-=drop*ramp(.85,1,v)*ridge
            return p
        panels.patch(25,9,lock,True)


def strand(section, path, width, thick, normal, rows=30, columns=10):
    """A flattened sculpted ribbon with a convex cross-section and feathered edges."""
    def sample(u,v):
        p=path(v)
        orient=normal(v,p).normalized()
        tan=(path(min(1,v+.002))-path(max(0,v-.002))).normalized()
        cross=tan.cross(orient).normalized()
        orient=cross.cross(tan).normalized()
        edge=2*u-1
        dome=clamp(1-edge*edge)**.78
        return p+cross*width(v)*edge+orient*thick(v)*dome
    section.patch(rows,columns,sample,False)


def fringe(s, panels):
    cut=s['cut']
    # (direction of tip, root longitude, root level, tip level, half width).
    # Manual locks over the part avoid a radial, helmet-like centre fringe.
    layouts={
        'bob': [(-1.15,.22,.17,.95,.057),(-.91,.29,.18,.98,.061),(-.58,.37,.20,.96,.063),(.98,.38,.22,.98,.061),(1.20,.60,.16,.97,.045)],
        'part':[(-.80,.09,.14,.88,.071),(-.47,.22,.19,.97,.076),(-.20,.35,.27,.95,.061),(.61,.38,.26,.94,.070),(.96,.56,.18,.98,.060)],
        'tie':[(-1.16,.04,.20,.96,.052),(-.85,.22,.21,.98,.055),(-.48,.26,.25,.93,.044),(.94,.39,.18,.99,.046)],
        'crop':[(-1.01,-.52,.25,.97,.043),(-.68,-.09,.27,.96,.053),(-.30,.14,.18,1,.054),(.08,.47,.24,.91,.044),(.38,.66,.28,.97,.047),(.74,.90,.24,.98,.043)],
        'wave':[(-1.16,.03,.21,.96,.072),(-.87,.13,.17,1,.081),(-.51,.28,.19,.97,.077),(.72,.46,.19,.97,.067),(1.05,.64,.22,.99,.071)],
    }
    for i,(end,start,lo,hi,w) in enumerate(layouts[cut]):
        def path(t):
            d=ramp(0,1,t)
            a=start*(1-d)+end*d
            p=surface(s,a,lo+(hi-lo)*t)
            hood=.002+(.018 if cut in ('part','wave') else .011)*sin(pi*t)**.72
            return p+outward(p)*hood
        def width(t):
            return w*(.05+.95*sin(pi*t)**(.60 if cut=='crop' else .50))*(1-.32*t)
        strand(panels,path,width,lambda t:.012*sin(pi*t)**.8,lambda _,p:outward(p))


def finishing_locks(s, panels):
    cut=s['cut']
    if cut=='crop':
        # Short lifted tips cross the crown in staggered tiers, with a tighter taper at the temples.
        strokes=[(-2.0,-1.80,.40,.77,.034),(-1.71,-1.50,.29,.70,.041),
                 (-1.43,-1.64,.22,.58,.040),(-1.10,-1.48,.20,.55,.050),
                 (-.72,-1.19,.14,.51,.052),(-.40,-.95,.18,.57,.058),
                 (-.11,-.76,.15,.59,.051),(.18,-.56,.17,.56,.050),
                 (.44,-.20,.22,.63,.052),(.72,.14,.26,.67,.051),
                 (1.01,.51,.22,.60,.045),(1.37,.87,.28,.65,.043),
                 (1.78,1.38,.37,.76,.035),(2.22,1.63,.31,.69,.03),
                 (-.27,-.86,.50,.80,.044),(.21,-.40,.47,.78,.044),
                 (.64,.14,.47,.77,.039),(1.05,.66,.49,.83,.045)]
    elif cut=='wave':
        # A Marcel-like S wave at each temple, then turned-under rolls around the ear.
        strokes=[(-.61,-1.15,.40,.83,.057),(-.82,-1.53,.47,.90,.060),
                 (-1.22,-1.77,.58,.99,.057),(-1.56,-2.19,.62,.98,.052),
                 (-1.93,-2.58,.63,.99,.052),(-2.43,-2.93,.59,.96,.05),
                 (.56,1.12,.38,.83,.052),(.79,1.52,.48,.9,.059),
                 (1.19,1.74,.55,.99,.055),(1.54,2.18,.58,.98,.058),
                 (2.02,2.55,.61,.98,.051),(2.50,2.94,.61,.97,.047)]
    else:
        strokes = []
    for i,(start,end,lo,hi,w) in enumerate(strokes):
        def path(t):
            a=start+(end-start)*ramp(0,1,t)
            if cut=='wave':
                a+=.18*(1 if start>0 else -1)*sin(2*pi*t)
            p=surface(s,a,lo+(hi-lo)*t)
            height=(.021 if cut=='wave' else .014)*sin(pi*t)**.76
            if cut=='crop':
                height+=.012*ramp(.42,1,t)
            return p+outward(p)*(.003+height)
        def width(t):
            return w*(.045+.955*sin(pi*t)**.64)*(1-.20*t)
        strand(panels,path,width,lambda t:.010*sin(pi*t),lambda _,p:outward(p),21,8)


def signature_curls(s,panels):
    if s['cut']=='part':
        # A loose comma lock crosses the otherwise swept-back forelock.
        curves=[([(.069,-.130,.700),(-.045,-.259,.707),(-.106,-.306,.589),(-.124,-.282,.515),
                  (-.135,-.278,.479),(-.155,-.268,.466),(-.181,-.248,.464)],.050,.015)]
    elif s['cut']=='wave':
        curves=[]
        # Two broad turned-under C curls at each ear give the silver blowout its rounded outline.
        for sign in (-1,1):
            for points,w in [
                ([(.23,-.21,.56),(.312,-.216,.505),(.354,-.171,.442),(.348,-.162,.393),
                  (.341,-.145,.309),(.413,-.085,.217),(.337,-.102,.191)],.051),
                ([(.327,-.068,.469),(.361,-.085,.404),(.394,-.078,.343),(.394,-.025,.296),
                  (.404,.051,.196),(.374,.08,.124),(.309,.043,.148)],.050)]:
                curves.append(([(sign*x,y,z) for x,y,z in points],w,.016))
    else:
        return
    for points,w,depth in curves:
        pts=[Vector(co) for co in points]
        def path(t):
            i=0 if t<.53 else 3
            f=t/.53 if i==0 else (t-.53)/.47
            return (1-f)**3*pts[i]+3*(1-f)**2*f*pts[i+1]+3*(1-f)*f*f*pts[i+2]+f**3*pts[i+3]
        strand(panels,path,lambda t:w*(.04+.96*sin(pi*t)**.59)*(1-.32*t),
               lambda t:depth*sin(pi*t)**.8,lambda _,p:outward(p),32,10)


def ponytail(section):
    # A tied tail narrows at the elastic, billows below it and curls towards one shoulder.
    def hair(u,v):
        a=2*pi*u
        center=Vector((-.006-.086*sin(1.2*pi*v),.258+.085*sin(.86*pi*v),.305-.52*v))
        side=Vector((1,0,-.10*cos(pi*v))).normalized()
        back=Vector((0,1,.24*cos(pi*v))).normalized()
        lean=.22*sin(pi*v)+.20*v
        r=(.027*(1-v)+.111*sin(pi*clamp(v*.89+.04))**.9)*(1-.50*ramp(.55,.98,v))
        r*=1-.92*ramp(.895,1,v)
        radius=r*(1+.038*cos(8*a+lean)+.010*sin(19*a-.2))
        return center + side*(radius*cos(a+lean)) + back*(radius*.82*sin(a+lean))
    section.patch(33,58,hair,True)


def build_hair(case_id,chin_z):
    s=dict(STYLES[case_id],profile=skull_profile(case_id))
    paint=painted_hair(case_id,s['base'])
    dark=swatch(case_id+' · hair root',tuple(int(c*.91) for c in s['base']))
    cap=Section(case_id+' · crown foundation',chin_z,dark)
    panels=Section(case_id+' · sculpted locks',chin_z,paint)
    sweep_cap(s,cap,panels)
    fringe(s,panels)
    finishing_locks(s,panels)
    signature_curls(s,panels)
    if s['cut']=='tie':
        ponytail(panels)
        band=Section(case_id+' · ponytail tie',chin_z,swatch(case_id+' · russet elastic',(109,65,65)))
        def elastic(u,v):
            a=2*pi*u
            return Vector((-.012+.042*cos(a),.281+.039*sin(a),.281+.026*v))
        band.patch(3,42,elastic)
        return [cap.finish(),panels.finish(),band.finish()]
    return [cap.finish(),panels.finish()]

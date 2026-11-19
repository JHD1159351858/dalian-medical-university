"""Blender face sculpt and portrait UV registration for the five outpatient characters."""
import math
from bisect import bisect_right
from pathlib import Path

import bpy

from face_specs import CASES, Projection, RINGS

TAU = 2*math.pi
HERE = Path(__file__).resolve().parent

def bump(x, z, cx, cz, sx, sz):
    return math.exp(-((x-cx)/sx)**2 - ((z-cz)/sz)**2)

# A shared tangent per sculpt ring keeps grazing light continuous across the jaw.
# The harmonic mean preserves monotonicity and gives a horizontal tangent at each extremum.
HEIGHTS = tuple(ring[0] for ring in RINGS)
SECANTS = [tuple((b-a)/(right[0]-left[0]) for a,b in zip(left[1:],right[1:]))
           for left,right in zip(RINGS,RINGS[1:])]
TANGENTS = [SECANTS[0]] + [
    tuple(2*a*b/(a+b) if a*b > 0 else 0 for a,b in zip(lower,upper))
    for lower,upper in zip(SECANTS,SECANTS[1:])
] + [SECANTS[-1]]

def radii(z, spec):
    index = max(0,min(len(RINGS)-2,bisect_right(HEIGHTS,z)-1))
    a,b = RINGS[index:index+2]
    span = b[0]-a[0]
    t = max(0,min(1,(z-a[0])/span))
    blend = t*t*(3-2*t)
    left = t*(1-t)**2*span
    right = t*t*(t-1)*span
    width,front,back = (lo+(hi-lo)*blend + left*ml + right*mr
                        for lo,hi,ml,mr in zip(a[1:],b[1:],TANGENTS[index],TANGENTS[index+1]))
    return width*spec['width'] + spec['jaw']*math.exp(-((z-.15)/.086)**2),front,back

class Sculpt:
    def __init__(self, spec):
        self.s=spec
        self.project=Projection(spec)
        self.nose,self.ala_l,self.ala_r = [self.project.unproject(p) for p in spec['nose']]
        self.lips=[self.project.unproject(p) for p in spec['mouth']]
        self.eyes=[self.project.unproject(p) for p in spec['eyes']]

    def relief(self, x,z):
        # Sculpt from the same landmarks that register the paint. Positive relief points toward the viewer.
        nx,nz=self.nose
        depth=.047 if self.s['age']<60 else .055
        r=depth*bump(x,z,nx,nz,.047,.032)
        r+=.042*bump(x,z,nx,nz+.059,.029,.073)
        r+=.016*bump(x,z,nx,nz+.103,.044,.065)
        for ax,az in (self.ala_l,self.ala_r):
            r+=.026*bump(x,z,ax,az+.011,.023,.019)
            r-=.010*bump(x,z,ax*.89,az-.001,.011,.007)
        # Eyeballs sit under a defined supraorbital rim; shallow tear troughs preserve a soft teaching style.
        for ex,ez in self.eyes:
            r-=.030*bump(x,z,ex,ez+.003,.109,.061)
            r+=.023*bump(x,z,ex,ez-.002,.072,.030)
            r+=.017*bump(x,z,ex,ez+.061,.091,.025)
            r+=.011*bump(x,z,ex*1.25,ez-.060,.068,.039)
            r+=.024*bump(x,z,ex*1.43,ez-.102,.092,.073)
            if self.s['age']>=60:
                r-=.009*bump(x,z,ex*1.16,ez-.042,.070,.012)
        (lx,lz),(rx,rz),(ux,uz),(bx,bz)=self.lips
        center=(lx+rx)*.5; midz=(lz+rz)*.5
        tilt=(rz-lz)/(rx-lx)
        lip_offset=z-(x-center)*tilt
        half=(rx-lx)*.51
        r+=.012*bump(x,z,center,midz,.11,.060)
        r+=.014*bump(x,lip_offset,ux-.019,uz,.046,.013)+.014*bump(x,lip_offset,ux+.019,uz,.046,.013)
        r+=.020*bump(x,lip_offset,bx,bz,half*.75,.015)
        r-=.011*bump(x,lip_offset,center,midz,half*.86,.007)
        for px,pz in ((lx,lz),(rx,rz)):
            r-=.011*bump(x,z,px,pz,.013,.016)
        r-=.006*bump(x,z,nx,(nz+uz)/2,.011,.021)
        r+=.015*bump(x,z,center,.069,.099,.034)
        return r

    def surface(self, a,z):
        w,f,b=radii(z,self.s)
        cs=math.cos(a)
        x=w*math.sin(a)
        if cs>=0:
            # A broad frontal plane, rounded three-quarter cheeks and a fully formed profile.
            y=-f*(cs**.81)-self.relief(x,z)*min(1,cs*2)
        else:
            y=b*(-cs)
        return (x,y,z)

    def surface_at(self,x,z):
        width,_,_=radii(z,self.s)
        a=math.asin(max(-.9999,min(.9999,x/width)))
        p=self.surface(a,z)
        return p[1], ((a+math.pi)/TAU,z/.67)

def mesh_object(name, verts, faces, uvs, material):
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(obj)
    obj['bone']='Head'
    mesh.materials.append(material)
    if uvs is not None:
        layer=mesh.uv_layers.new(name='FacePainting')
        for polygon in mesh.polygons:
            for loop_id in polygon.loop_indices:
                vertex=mesh.loops[loop_id].vertex_index
                layer.data[loop_id].uv=uvs[vertex]
    for poly in mesh.polygons: poly.use_smooth=True
    return obj

def make_material(name, color=(1,1,1), roughness=.50, image=None, specular=.31):
    mat=bpy.data.materials.new(name);mat.diffuse_color=(*color,1);mat.use_nodes=True
    nodes=mat.node_tree.nodes
    shader=nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value=(*color,1)
    shader.inputs['Roughness'].default_value=roughness
    shader.inputs['Specular IOR Level'].default_value=specular
    if image:
        tex=nodes.new('ShaderNodeTexImage');tex.image=image
        tex.label='Registered hand-finished portrait paint';tex.interpolation='Linear'
        mat.node_tree.links.new(tex.outputs['Color'],shader.inputs['Base Color'])
    return mat

def skull(name, chin, sculpt, material):
    # The rear UV seam is duplicated so glTF can retain correct derivatives through the outline.
    segs,levels=144,112
    verts=[];uvs=[];faces=[]
    for i in range(levels+1):
        z=.0003+.6694*i/levels
        for j in range(segs+1):
            a=(j/segs-.5)*TAU
            x,y,_=sculpt.surface(a,z)
            verts.append((x,y,chin+z));uvs.append((j/segs,z/.67))
    row=segs+1
    for i in range(levels):
        for j in range(segs):
            k=i*row+j
            faces.append((k,k+1,k+1+row,k+row))
    top=len(verts);verts.append((0,0,chin+.67));uvs.append((.5,1))
    bottom=len(verts);verts.append((0,-.027,chin));uvs.append((.5,0))
    for j in range(segs):
        faces.extend([(levels*row+j,levels*row+j+1,top),(j+1,j,bottom)])
    return mesh_object(name,verts,faces,uvs,material)

def eye(name, chin, sculpt, eyelid, material):
    a,b,top,bottom=[sculpt.project.unproject(point) for point in eyelid]
    verts=[];uvs=[];faces=[]
    for i in range(33):
        t=i/32; x=a[0]*(1-t)+b[0]*t
        axis=a[1]*(1-t)+b[1]*t
        arch=math.sin(math.pi*t)**.74
        mid=(a[1]+b[1])*.5
        for j in range(13):
            f=j/12
            z=axis+arch*((bottom[1]-mid)*(1-f)+(top[1]-mid)*f)
            y,uv=sculpt.surface_at(x,z)
            # The gloss follows the rounded corneal lens and the opening defined by the lids.
            verts.append((x,y-.00065-.009*arch*math.sin(math.pi*f),chin+z));uvs.append(uv)
    for i in range(32):
        for j in range(12):
            k=i*13+j
            faces.append((k,k+13,k+14,k+1))
    return mesh_object(name,verts,faces,uvs,material)

def ear(name, sign, chin, spec):
    # Shell surface: concha, antihelix, outer helix and soft lobule all continuous in profile.
    skin=[(c/255+.055)**2.4/1.055**2.4 for c in spec['skin']]
    mat=make_material(name+' skin',skin,.54)
    tint=mat.node_tree.nodes.new('ShaderNodeVertexColor');tint.layer_name='EarTone'
    mat.node_tree.links.new(tint.outputs['Color'],mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
    verts=[];colors=[];faces=[]; rings=15; sides=44
    cx=.314*spec['width']; cz=chin+.273; cy=-.007
    for ring in range(rings+1):
        r=.001+.999*ring/rings
        for idx in range(sides):
            angle=TAU*idx/sides
            local_u=.063*r*math.cos(angle)*(1+.10*math.sin(angle))
            local_z=.096*r*math.sin(angle)
            rim=math.exp(-((r-.77)/.155)**2)
            anti=.010*bump(local_u,local_z,-.012,.006,.011,.049)
            tragus=.012*bump(local_u,local_z,-.030,-.012,.014,.020)
            lobe=.012*bump(local_u,local_z,.002,-.055,.028,.025)
            relief=.015+.011*(1-r*r)+.016*rim+anti+tragus+lobe
            verts.append((sign*(cx+.78*local_u+.63*relief),cy+.63*local_u-.78*relief,cz+local_z))
            basin=math.exp(-((local_u-.010)/.032)**2-((local_z-.003)/.047)**2)
            colors.append((skin[0]*(1-.11*basin),skin[1]*(1-.31*basin),skin[2]*(1-.23*basin),1))
    for i in range(rings):
        for j in range(sides):
            a=i*sides+j;b=i*sides+(j+1)%sides
            # radial x angular is outward front for the right half of the image.
            face=(a,a+sides,b+sides,b)
            faces.append(face if sign>0 else face[::-1])
    back=len(verts);verts.append((sign*(cx-.009),cy+.038,cz));colors.append((*skin,1))
    for j in range(sides):
        face=(rings*sides+j,back,rings*sides+(j+1)%sides)
        faces.append(face if sign>0 else face[::-1])
    obj=mesh_object(name,verts,faces,None,mat)
    layer=obj.data.color_attributes.new(name='EarTone',type='FLOAT_COLOR',domain='POINT')
    for i,c in enumerate(colors):layer.data[i].color=c
    return obj

def build_face(case_id, chin_z):
    """Construct the detailed face, two optically distinct eyes and both ears for one patient."""
    spec=CASES[case_id];sculpt=Sculpt(spec)
    image_path=HERE/'textures'/(case_id+'-face.png')
    image=bpy.data.images.load(str(image_path),check_existing=True)
    if not image.packed_file:image.pack()
    face_paint=make_material(case_id+' • face paint',roughness=.53,image=image)
    eye_gloss=make_material(case_id+' • cornea',roughness=.39,image=image,specular=.09)
    objects=[skull(case_id+' • sculpted cranium and facial features',chin_z,sculpt,face_paint)]
    for side,eyelid in enumerate(spec['eyelids']):
        objects.append(eye(case_id+' • eye '+str(side+1),chin_z,sculpt,eyelid,eye_gloss))
    objects.extend(ear(case_id+' • ear '+str(side),side,chin_z,spec) for side in (-1,1))
    return objects


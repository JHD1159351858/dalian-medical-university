"""Reproducible Blender 5.2 source-preserving character rig and hospital export.
Run all: blender -b -t 8 --python hospital-agent/scripts/prepare_assets.py
Hospital only: blender -b --python hospital-agent/scripts/prepare_assets.py -- --hospital-only
Characters only: blender -b --python hospital-agent/scripts/prepare_assets.py -- --characters-only
Original user assets are read only. Weights use continuous anatomical regions,
not connected-component heat binding, because the supplied scan surface is fragmented.
"""
import bpy, bmesh, math, json, hashlib, struct, sys
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'hospital-agent/public/models'
AUTHOR = ROOT / 'hospital-agent/authoring'
VERIFY = ROOT / 'hospital-agent/verification'
for p in (OUT, AUTHOR, VERIFY): p.mkdir(parents=True, exist_ok=True)
FPS = 30
NAMES = ['Root','Hips','Spine','Chest','Neck','Head'] + [n+s for s in ('.L','.R') for n in ('UpperArm','Forearm','Hand','Thigh','Shin','Foot','Toe','Coat')]
HOSPITAL_ONLY = '--hospital-only' in (sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
CHARACTERS_ONLY = '--characters-only' in (sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
manifest_path = OUT/'asset-manifest.json'
if HOSPITAL_ONLY or CHARACTERS_ONLY:
 manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
 manifest['generator']='Blender '+bpy.app.version_string
else:
 manifest={'schemaVersion':1,'generator':'Blender '+bpy.app.version_string,'coordinateSystem':{'up':'+Y','forward':'+Z','unit':'meter','ground':0,'sourceBlenderToRuntime':'(x, y, z) -> (x, z, -y)'},'sources':{},'characters':{}}
for fn in ('患者.glb','医生.glb','医院场景_极致还原.blend'):
 p=ROOT/fn
 manifest['sources'][fn]={'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'format':'glTF 2.0 binary' if p.suffix=='.glb' else 'Blender project','version':2 if p.suffix=='.glb' else None}

def select_only(obs):
 bpy.ops.object.select_all(action='DESELECT')
 for o in obs:o.select_set(True)
 bpy.context.view_layer.objects.active=obs[0]

def smoothstep(a,b,x):
 t=max(0,min(1,(x-a)/(b-a)));return t*t*(3-2*t)

def lerp_weights(nodes,z):
 if z<=nodes[0][0]:return {nodes[0][1]:1}
 for (a,na),(b,nb) in zip(nodes,nodes[1:]):
  if z<=b:
   t=smoothstep(a,b,z);return {na:1-t,nb:t}
 return {nodes[-1][1]:1}

def make_rig(name,h):
 data=bpy.data.armatures.new(name+'_Skeleton');rig=bpy.data.objects.new(name+'_Rig',data);bpy.context.collection.objects.link(rig);select_only([rig]);bpy.ops.object.mode_set(mode='EDIT')
 def bone(n,head,tail,parent=None):
  b=data.edit_bones.new(n);b.head=Vector(head)*h;b.tail=Vector(tail)*h
  if parent:b.parent=data.edit_bones[parent]
  return b
 bone('Root',(0,0,0),(0,0,.1))
 bone('Hips',(0,0,.27),(0,0,.34),'Root')
 bone('Spine',(0,0,.34),(0,0,.44),'Hips')
 bone('Chest',(0,0,.44),(0,0,.51),'Spine')
 bone('Neck',(0,0,.51),(0,0,.57),'Chest')
 bone('Head',(0,0,.57),(0,0,.9),'Neck')
 for s,sgn in (('.L',1),('.R',-1)):
  bone('UpperArm'+s,(sgn*.137,0,.50),(sgn*.202,0,.415),'Chest')
  bone('Forearm'+s,(sgn*.202,0,.415),(sgn*.246,-.004,.345),'UpperArm'+s)
  bone('Hand'+s,(sgn*.246,-.004,.345),(sgn*.252,-.015,.315),'Forearm'+s)
  bone('Thigh'+s,(sgn*.075,0,.27),(sgn*.075,-.006,.155),'Hips')
  bone('Shin'+s,(sgn*.075,-.006,.155),(sgn*.075,0,.055),'Thigh'+s)
  bone('Foot'+s,(sgn*.075,0,.055),(sgn*.075,-.095,.027),'Shin'+s)
  bone('Toe'+s,(sgn*.075,-.095,.027),(sgn*.075,-.145,.027),'Foot'+s)
  bone('Coat'+s,(sgn*.06,0,.30),(sgn*.075,0,.205),'Hips')
 bpy.ops.object.mode_set(mode='OBJECT');rig.show_in_front=True;data.display_type='STICK'
 for b in rig.pose.bones:b.rotation_mode='QUATERNION'
 return rig

def bind(mesh,rig,h,is_doctor):
 groups={n:mesh.vertex_groups.new(name=n) for n in NAMES}
 for v in mesh.data.vertices:
  x,y,z=(c/h for c in v.co);ax=abs(x);s='.L' if x>=0 else '.R'
  # Anatomical envelopes remain continuous across disconnected scan fragments.
  body=lerp_weights([(.27,'Hips'),(.355,'Spine'),(.465,'Chest'),(.535,'Neck'),(.575,'Head')],z)
  arm=smoothstep(.115,.18,ax)*(1-smoothstep(.50,.56,z))*smoothstep(.265,.32,z)
  if arm>0:
   aw=lerp_weights([(.33,'Hand'+s),(.373,'Forearm'+s),(.445,'UpperArm'+s)],z)
   body={k:w*(1-arm) for k,w in body.items()}
   for k,w in aw.items():body[k]=body.get(k,0)+arm*w
  leg=1-smoothstep(.235,.29,z)
  if leg>0:
   lw=lerp_weights([(.055,'Foot'+s),(.105,'Shin'+s),(.205,'Thigh'+s),(.285,'Hips')],z)
   # Long coat surface is driven by gentle coat bones rather than tearing at crotch.
   coat=0
   if z>(.19 if is_doctor else .205):
    coat=smoothstep(.19 if is_doctor else .205,.235 if is_doctor else .245,z)*max(smoothstep(.048,.080,abs(y)),smoothstep(.10,.13,ax))
    lw={k:w*(1-coat) for k,w in lw.items()}
    side=smoothstep(-.055,.055,x);lw['Coat.L']=coat*side;lw['Coat.R']=coat*(1-side)
   crotch=(1-smoothstep(.018,.048,ax))*smoothstep(.19,.235,z)
   lw={k:w*(1-crotch) for k,w in lw.items()};lw['Hips']=lw.get('Hips',0)+crotch
   body={k:w*(1-leg) for k,w in body.items()}
   for k,w in lw.items():body[k]=body.get(k,0)+leg*w
  ws=sorted(((k,w) for k,w in body.items() if w>.001),key=lambda a:-a[1])[:4];total=sum(w for k,w in ws)
  for k,w in ws:groups[k].add([v.index],w/total,'REPLACE')
 mesh.parent=rig;mod=mesh.modifiers.new('Anatomical skin binding','ARMATURE');mod.object=rig;mod.use_deform_preserve_volume=True
 return {'method':'continuous spatial anatomical envelopes on original-derived mesh','maxInfluences':4,'weightedVertices':len(mesh.data.vertices),'unweightedVertices':sum(not v.groups for v in mesh.data.vertices)}

def world_bone_matrix(bone,head,tail):
 rest=bone.matrix_local.to_quaternion();q=(bone.tail_local-bone.head_local).rotation_difference(Vector(tail)-Vector(head)) @ rest
 return Matrix.Translation(head) @ q.to_matrix().to_4x4()

def build_animations(rig,h):
 scene=bpy.context.scene;scene.render.fps=FPS;rig.animation_data_create();actions={}
 for clip,duration in [('Idle',2.4),('Walk',1.2),('Talk',2.4)]:
  count=round(duration*FPS);act=bpy.data.actions.new(rig.name+'_'+clip);rig.animation_data.action=act
  for f in range(count+1):
   scene.frame_set(f);phase=2*math.pi*f/count
   for pb in rig.pose.bones:pb.location=(0,0,0);pb.rotation_quaternion=(1,0,0,0);pb.scale=(1,1,1)
   def rot(n,axis,angle):rig.pose.bones[n].rotation_quaternion=Quaternion(axis,angle)
   if clip=='Walk':
    hips=rig.pose.bones['Hips'];hips.location=(.006*h*math.sin(phase),-.029*h+.003*h*math.cos(2*phase),0)
    # Hips bone local Y follows world Z. Root remains stationary.
    rot('Hips',(0,1,0),.025*math.sin(phase));rot('Spine',(0,1,0),-.035*math.sin(phase));rot('Chest',(0,1,0),.025*math.sin(phase));rot('Head',(0,0,1),.012*math.sin(phase))
    for s,sgn in (('.L',1),('.R',-1)):
     theta=phase+(0 if s=='.L' else math.pi)
     rot('UpperArm'+s,(1,0,0),.20*math.cos(theta));rot('Forearm'+s,(1,0,0),-.075-.055*math.sin(theta))
     rot('Coat'+s,(1,0,0),-.055*math.cos(theta))
    bpy.context.view_layer.update()
    for s in ('.L','.R'):
     t=(f/count+(0 if s=='.L' else .5))%1
     # 60% planted support; 40% swing with raised toe clearance.
     stride=.56
     if t<.6:y=-stride*.3+stride*.6*t/.6;lift=0;pitch=0
     else:
      u=(t-.6)/.4;ease=u*u*(3-2*u);y=stride*.3-stride*.6*ease;lift=.055*math.sin(math.pi*u);pitch=-.16*math.sin(2*math.pi*u)
     thigh=rig.pose.bones['Thigh'+s];shin=rig.pose.bones['Shin'+s];foot=rig.pose.bones['Foot'+s]
     hip=thigh.head.copy();ankle=Vector(((1 if s=='.L' else -1)*.075*h,y,.055*h+lift))
     L1=thigh.bone.length;L2=shin.bone.length;delta=ankle-hip;dist=min(delta.length,L1+L2-.0001);direction=delta.normalized()
     mid=(L1*L1-L2*L2+dist*dist)/(2*dist);bend=Vector((0,-1,0));bend=(bend-direction*bend.dot(direction)).normalized();knee=hip+direction*mid+bend*math.sqrt(max(0,L1*L1-mid*mid))
     thigh.matrix=world_bone_matrix(thigh.bone,hip,knee);bpy.context.view_layer.update();shin.matrix=world_bone_matrix(shin.bone,knee,ankle);bpy.context.view_layer.update()
     target=ankle+Quaternion((1,0,0),pitch)@(foot.bone.tail_local-foot.bone.head_local)
     foot.matrix=world_bone_matrix(foot.bone,ankle,target);bpy.context.view_layer.update()
   elif clip=='Idle':
    rot('Spine',(1,0,0),.012*math.sin(phase));rot('Chest',(0,1,0),.009*math.sin(phase));rot('Head',(0,0,1),.018*math.sin(phase));rot('UpperArm.L',(0,0,1),.012*math.sin(phase));rot('UpperArm.R',(0,0,1),-.012*math.sin(phase))
   else:
    rot('Head',(1,0,0),.045*math.sin(phase*2));rot('Chest',(0,1,0),.025*math.sin(phase));rot('UpperArm.L',(1,0,0),-.14*(.5-.5*math.cos(phase)));rot('Forearm.L',(0,0,1),-.18*(.5-.5*math.cos(phase)));rot('UpperArm.R',(1,0,0),-.07*math.sin(phase));rot('Hand.L',(0,1,0),.08*math.sin(phase*2))
   for pb in rig.pose.bones:
    pb.keyframe_insert('location',frame=f,group=pb.name);pb.keyframe_insert('rotation_quaternion',frame=f,group=pb.name)
  act.use_fake_user=True;actions[clip]=act
 rig.animation_data.action=None
 for clip,act in actions.items():
  tr=rig.animation_data.nla_tracks.new();tr.name=clip;st=tr.strips.new(clip,0,act);st.name=clip
 for pb in rig.pose.bones:pb.matrix_basis=Matrix.Identity(4)
 return actions

def export(path,obs,animated=False):
 select_only(obs)
 bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_animations=animated,export_animation_mode='NLA_TRACKS',export_nla_strips=True,export_anim_slide_to_zero=True,export_frame_range=False,export_skins=animated,export_influence_nb=4,export_def_bones=True,export_apply=False,export_materials='EXPORT',export_image_format='JPEG',export_jpeg_quality=90,export_normals=True,export_texcoords=True,export_extras=True,export_lights=False,export_cameras=False)

def glb_info(path):
 raw=path.read_bytes();length,kind=struct.unpack_from('<II',raw,12);doc=json.loads(raw[20:20+length]);tri=0
 for m in doc.get('meshes',[]):
  for p in m['primitives']:tri+=doc['accessors'][p['indices']]['count']//3
 result={'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'triangles':tri,'meshes':len(doc.get('meshes',[])),'drawCalls':sum(len(m['primitives']) for m in doc.get('meshes',[])),'materials':len(doc.get('materials',[])),'skins':len(doc.get('skins',[])),'clips':[a.get('name') for a in doc.get('animations',[])],'joints':[doc['nodes'][j].get('name') for skin in doc.get('skins',[]) for j in skin['joints']]}
 if len(doc.get('meshes',[]))==1:
  position=doc['accessors'][doc['meshes'][0]['primitives'][0]['attributes']['POSITION']]
  result['measuredHeightMeters']=position['max'][1]-position['min'][1]
  result['restBounds']={'min':position['min'],'max':position['max']}
 return result

def build_hospital():
 bpy.ops.wm.open_mainfile(filepath=str(ROOT/'医院场景_极致还原.blend'))
 source_meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
 source_counts={'objects':len(source_meshes),'vertices':sum(len(o.data.vertices) for o in source_meshes),'polygons':sum(len(o.data.polygons) for o in source_meshes),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in source_meshes)}
 left_names=['GlassDoor','Entrance leaf stile','Entrance leaf stile.001','Entrance leaf rail','Entrance leaf rail.001','Entrance handle']
 right_names=['GlassDoor.001','Entrance leaf stile.002','Entrance leaf stile.003','Entrance leaf rail.002','Entrance leaf rail.003','Entrance handle.001']
 door_names=set(left_names+right_names)
 doors={name:bpy.data.objects.get(name) for name in door_names}
 assert all(doors.values()), 'Missing entrance door parts: '+', '.join(name for name,o in doors.items() if o is None)
 assert all(o.type=='MESH' for o in doors.values()), 'Entrance door parts must all be meshes'
 assert all(max(abs(v) for v in o.rotation_euler)<1e-7 for o in doors.values()), 'Entrance door source rotations must remain zero'
 pivots=[]
 for name,location,parts in [('EntranceDoorLeft',(-1.11,-5.49,1.3),left_names),('EntranceDoorRight',(1.11,-5.49,1.3),right_names)]:
  pivot=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(pivot);pivot.location=location;bpy.context.view_layer.update();pivots.append(pivot)
  for part_name in parts:
   child=doors[part_name];world=child.matrix_world.copy();child.parent=pivot
   child.matrix_parent_inverse=Matrix.Identity(4);child.matrix_basis=pivot.matrix_world.inverted()@world
 static_meshes=[o for o in source_meshes if o.name not in door_names]
 groups={}
 for o in static_meshes:
  if len(o.data.materials)<=1:groups.setdefault(o.data.materials[0].name if o.data.materials else '_none',[]).append(o)
  else:groups.setdefault('_multi_'+o.name,[]).append(o)
 merged=[]
 for matname,obs in groups.items():
  select_only(obs)
  if len(obs)>1:bpy.ops.object.join()
  o=bpy.context.object;o.name='Hospital_'+matname;merged.append(o)
 export(OUT/'hospital.glb',merged+pivots+list(doors.values()),False)
 info=glb_info(OUT/'hospital.glb')
 assert info['triangles']==source_counts['triangles'], f"Hospital triangle mismatch: {info['triangles']} != {source_counts['triangles']}"
 manifest['sources']['医院场景_极致还原.blend']['savedVersion']='.'.join(map(str,bpy.data.version))
 manifest['hospital']={'file':'hospital.glb','sourceCounts':source_counts,'geometryAudit':{'exportedTriangles':info['triangles'],'lostTriangles':0,'duplicatedTriangles':0},'entranceDoors':[{'name':'EntranceDoorLeft','pivot':[-1.11,1.3,5.49],'pivotRotationQuaternion':[0,0,0,1],'rotationAxis':'+Y','closedAngleDegrees':0,'openAngleDegrees':85,'opensTowardRuntimeZ':'negative (indoors)','closedBounds':{'min':[-1.1475,.047687,5.435],'max':[-.002647,2.541164,5.6075]},'openBounds':{'min':[-1.168059,.047687,4.382067],'max':[-.915596,2.541164,5.532151]},'sourceParts':left_names},{'name':'EntranceDoorRight','pivot':[1.11,1.3,5.49],'pivotRotationQuaternion':[0,0,0,1],'rotationAxis':'+Y','closedAngleDegrees':0,'openAngleDegrees':-85,'opensTowardRuntimeZ':'negative (indoors)','closedBounds':{'min':[.020628,.055498,5.435],'max':[1.148407,2.534701,5.6075]},'openBounds':{'min':[.915596,.055498,4.399979],'max':[1.168138,2.534701,5.533054]},'sourceParts':right_names}],'landmarks':{'entrance':[.55,0,5.7],'welcomeMat':[0,0,6.6],'welcomeMatBounds':{'min':[-1.6,0,6.04],'max':[1.6,.028,7.16]},'entrancePavementBounds':{'min':[-2.3,0,6],'max':[2.3,0,7.72]},'receptionDeskBounds':{'min':[-6.8,0,1.4],'max':[-2.1,1.4,3.5]},'receptionInteraction':[-1.5,0,2.6],'floorBounds':{'min':[-8,0,-6],'max':[8,0,6]}},**info}
 (OUT/'asset-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
 (VERIFY/'asset-audit.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
 print('HOSPITAL_COMPLETE',json.dumps(manifest['hospital'],ensure_ascii=False),flush=True)

if HOSPITAL_ONLY:
 build_hospital()
 raise SystemExit(0)

bpy.ops.wm.read_factory_settings(use_empty=True)
character_objects=[];character_actions={}
for key,src,height in [('patient','患者.glb',1.65),('doctor','医生.glb',1.72)]:
 before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(ROOT/src));imported=[o for o in bpy.data.objects if o not in before];meshes=[o for o in imported if o.type=='MESH'];select_only(meshes);bpy.ops.object.join();mesh=bpy.context.object;mesh.name=key+'_OriginalSurface'
 bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
 coords=[v.co.copy() for v in mesh.data.vertices];minz=min(v.z for v in coords);maxz=max(v.z for v in coords);cx=(min(v.x for v in coords)+max(v.x for v in coords))/2;scale=height/(maxz-minz)
 for v in mesh.data.vertices:v.co=Vector(((v.co.x-cx)*scale,v.co.y*scale,(v.co.z-minz)*scale))
 source_tri=sum(len(p.vertices)-2 for p in mesh.data.polygons)
 # Join coincident scan fragments before collapse so reduction cannot open their shared seams.
 vertices_before_weld=len(mesh.data.vertices);bm=bmesh.new();bm.from_mesh(mesh.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=0.00001);bm.to_mesh(mesh.data);bm.free();mesh.data.update()
 vertices_after_weld=len(mesh.data.vertices);welded_tri=sum(len(p.vertices)-2 for p in mesh.data.polygons)
 mod=mesh.modifiers.new('Source preserving runtime reduction','DECIMATE');mod.ratio=100000/welded_tri;mod.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=mod.name)
 for poly in mesh.data.polygons:poly.use_smooth=True
 for mat in mesh.data.materials:
  if mat and mat.use_nodes:
   for node in mat.node_tree.nodes:
    if node.type=='TEX_IMAGE' and node.image and max(node.image.size)>2048:
     im=node.image;factor=2048/max(im.size);im.scale(round(im.size[0]*factor),round(im.size[1]*factor));im.pack()
 rig=make_rig(key,height);weight_audit=bind(mesh,rig,height,key=='doctor');actions=build_animations(rig,height)
 mesh['source_file']=src;mesh['source_preserved']=True;rig['walk_cycle_seconds']=1.2;rig['walk_stride_meters']=.56
 export(OUT/(key+'.glb'),[mesh,rig],True)
 manifest['characters'][key]={'file':key+'.glb','heightMeters':height,'sourceTriangles':source_tri,'surfaceCleanup':{'weldDistanceMeters':0.00001,'verticesBeforeWeld':vertices_before_weld,'verticesAfterWeld':vertices_after_weld},'textureMaxDimension':2048,'binding':weight_audit,'walk':{'durationSeconds':1.2,'strideMeters':.56,'recommendedSpeedMetersPerSecond':.56/1.2,'stanceFraction':.6,'rootMotion':False},'animations':{'Idle':{'durationSeconds':2.4},'Walk':{'durationSeconds':1.2},'Talk':{'durationSeconds':2.4}},**glb_info(OUT/(key+'.glb'))}
 character_objects.extend([mesh,rig]);character_actions[key]=(rig,actions)
 print('CHARACTER_COMPLETE',key,json.dumps(manifest['characters'][key]),flush=True)
# Preserve an editable native scene with original-derived meshes, bone weights and NLA clips.
for i,key in enumerate(('patient','doctor')):
 rig,actions=character_actions[key];rig.location.x=(-1 if i==0 else 1)*.75
bpy.context.preferences.filepaths.save_version=0
bpy.context.scene.frame_set(0);bpy.ops.wm.save_as_mainfile(filepath=str(AUTHOR/'characters-rigged.blend'))
# Render inspection contact sheets from exported animation authoring poses.
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.render.resolution_x=1000;scene.render.resolution_y=850;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('PreviewWorld');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.7,.75,.8,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.7
bpy.ops.object.camera_add(location=(2.1,-6,2.3));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,.85))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=3.2;scene.camera=cam
for pos,power,size in [((-3,-4,6),600,5),((3,1,5),450,4)]:
 bpy.ops.object.light_add(type='AREA',location=pos);bpy.context.object.data.energy=power;bpy.context.object.data.size=size
for clip,frame in [('Idle',0),('Walk',8),('Walk',26),('Talk',30)]:
 for rig,actions in character_actions.values():
  for tr in rig.animation_data.nla_tracks:tr.mute=True
  rig.animation_data.action=actions[clip]
 scene.frame_set(frame);scene.render.filepath=str(VERIFY/f'characters-{clip.lower()}-{frame}.png');bpy.ops.render.render(write_still=True)
# Open and export the supplied hospital only after the character authoring project is safely saved.
if not CHARACTERS_ONLY:build_hospital()
manifest['limitations']=['Source scan topology is fragmented. Weights use continuous anatomical envelopes and 4 influences, not automatic heat binding.','Gown hem and long coat use supplementary coat bones with restrained motion; it is not a cloth simulation.','The original source character surfaces and UV materials were retained through decimation; no replacement humanoid mesh was used.','Talk is a body gesture clip, without facial blend shapes or lip sync.']
(OUT/'asset-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
(VERIFY/'asset-audit.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print('ASSET_PIPELINE_COMPLETE',json.dumps(manifest,ensure_ascii=False),flush=True)

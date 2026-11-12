import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

// Design-only render: existing patient asset, with a proposed examination bed.
const container=document.querySelector('#scene');
const width=container.clientWidth, height=container.clientHeight;
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
renderer.setSize(width,height);renderer.setPixelRatio(2);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.87;container.append(renderer.domElement);
const scene=new THREE.Scene();
scene.add(new THREE.AmbientLight(0xffffff,1.6),new THREE.HemisphereLight(0xffffff,0xbacbe6,2));
const light=new THREE.DirectionalLight(0xfff5ed,2.8);light.position.set(-3,7,4);light.castShadow=true;light.shadow.mapSize.set(2048,2048);light.shadow.camera.left=-4;light.shadow.camera.right=4;light.shadow.camera.top=4;light.shadow.camera.bottom=-4;light.shadow.bias=-.0003;light.shadow.normalBias=.025;light.shadow.radius=5;scene.add(light);
const rim=new THREE.DirectionalLight(0xbcd6ff,2);rim.position.set(4,3,-3);scene.add(rim);
const camera=new THREE.PerspectiveCamera(32,width/height,.1,40);camera.position.set(1.95,3.7,2.8);camera.lookAt(.02,.7,.1);camera.updateMatrixWorld(true);
const group=new THREE.Group();group.position.set(-.25,0,0);scene.add(group);
function box(w,h,d,color,x,y,z,r=.07){const m=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,4,r),new THREE.MeshStandardMaterial({color,roughness:.7}));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;group.add(m);return m;}
box(1.15,.15,2.33,0xbdcfe9,0,.43,.18);box(1.1,.18,2.23,0xf8fbff,0,.57,.18);box(.84,.12,.55,0xe1ebfa,0,.71,-.64,.055);
box(.94,.10,1.95,0xd0deef,0,.15,.18);for(const x of [-.42,.42])for(const z of [-.62,.97])box(.085,.30,.085,0xb6c8de,x,.24,z,.025);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({opacity:.075}));floor.rotation.x=-Math.PI/2;floor.position.y=.04;floor.receiveShadow=true;scene.add(floor);
const gltf=await new GLTFLoader().loadAsync('/models/patient.glb');const patient=gltf.scene;
patient.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;}});
patient.rotation.x=-Math.PI/2;patient.position.set(0,.89,.96);group.add(patient);scene.updateMatrixWorld(true);
const overlay=document.querySelector('#overlay');
function project(v){v.applyMatrix4(patient.matrixWorld).project(camera);return [(v.x+1)*width/2,(1-v.y)*height/2];}
let svg='';for(let row=0;row<3;row++)for(let col=0;col<3;col++){
const x=-.135+col*.09,y=.69-row*.075,z=.10;
const points=[[x,y,z],[x+.084,y,z],[x+.084,y-.07,z],[x,y-.07,z]].map(a=>project(new THREE.Vector3(...a)));
svg+=`<polygon points="${points.map(p=>p.join(',')).join(' ')}" fill="${col===2&&row===0?'#e8a298':'#b5d2f0'}" fill-opacity="${col===2&&row===0?'.75':'.18'}" stroke="white" stroke-opacity=".85" stroke-width="1.2" stroke-dasharray="3 3"/>`;
}
const [px,py]=project(new THREE.Vector3(.09,.65,.10));
svg+=`<circle cx="${px}" cy="${py}" r="8" fill="white" fill-opacity=".75"/><circle cx="${px}" cy="${py}" r="16" fill="none" stroke="white" stroke-width="1.5"/><path d="M${px+17},${py} Q${px+90},${py+35} ${width-290},${height-233}" fill="none" stroke="#89a3c5" stroke-width="1.3" stroke-dasharray="4 5"/>`;
overlay.innerHTML=svg;
renderer.render(scene,camera);
const pr=new THREE.WebGLRenderer({alpha:true,antialias:true});pr.setSize(68,68);pr.setPixelRatio(2);pr.toneMapping=THREE.ACESFilmicToneMapping;document.querySelector('#portrait').append(pr.domElement);
const ps=new THREE.Scene();ps.add(new THREE.AmbientLight(0xffffff,2),new THREE.HemisphereLight(0xffffff,0xbdcfea,2));const pl=new THREE.DirectionalLight(0xffffff,3);pl.position.set(-2,5,4);ps.add(pl);const avatar=clone(patient);avatar.rotation.set(0,0,0);avatar.position.set(0,0,0);ps.add(avatar);const pc=new THREE.PerspectiveCamera(32,1,.1,20);pc.position.set(0,1.24,1.85);pc.lookAt(0,1.18,0);pr.render(ps,pc);
window.designReady=true;

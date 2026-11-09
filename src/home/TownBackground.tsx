import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const DIVE_DURATION = 1400;

export function TownBackground({ onReady, onError, transitioning = false, onDiveComplete }: { onReady: () => void; onError: () => void; transitioning?: boolean; onDiveComplete?: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const transitioningRef = useRef(transitioning);
  const onDiveCompleteRef = useRef(onDiveComplete);
  useEffect(() => { transitioningRef.current = transitioning; }, [transitioning]);
  useEffect(() => { onDiveCompleteRef.current = onDiveComplete; }, [onDiveComplete]);
  useEffect(() => {
    const container = host.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' }); }
    catch { onError(); return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.append(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = null;
    scene.add(new THREE.HemisphereLight('#ffffff', '#7a9395', 2.4));
    const sun = new THREE.DirectionalLight('#fff4df', 2.6);
    sun.position.set(-40, 85, 45); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -85, right: 85, top: 85, bottom: -85, near: 1, far: 230 });
    sun.shadow.normalBias = 0.08; scene.add(sun);
    const camera = new THREE.OrthographicCamera(-80, 80, 60, -60, 0.1, 500);
    camera.position.set(85, 100, 110); camera.lookAt(0, 0, 0);
    const resize = () => {
      const width = container.clientWidth, height = container.clientHeight;
      const aspect = width / height, span = Math.max(112, 180 / aspect);
      Object.assign(camera, { left: -span * aspect / 2, right: span * aspect / 2, top: span / 2, bottom: -span / 2 });
      camera.updateProjectionMatrix(); renderer.setSize(width, height);
    };
    const observer = new ResizeObserver(resize); observer.observe(container); resize();
    const decoder = new DRACOLoader().setDecoderPath('/draco/');
    const loader = new GLTFLoader().setDRACOLoader(decoder);
    let disposed = false, frame = 0, elapsed = 0, previous = performance.now();
    let diveStartedAt = 0, diveCompleted = false;
    const diveStart = new THREE.Vector3(85, 100, 110);
    const diveEnd = new THREE.Vector3(18, 24, 28);
    const diveTarget = new THREE.Vector3(0, -0.35, 0);
    const cars: THREE.Group[] = [];
    const people: Array<{ root: THREE.Group; left: THREE.Group; right: THREE.Group }> = [];
    const resources = new Set<THREE.BufferGeometry | THREE.Material>();
    const track = (root: THREE.Object3D) => root.traverse(object => {
      if (object instanceof THREE.Mesh) {
        resources.add(object.geometry);
        (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => resources.add(material));
      }
    });
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const diagnostic = window as Window & { __townScene?: Record<string, unknown> };
    const started = performance.now();
    Promise.all([loader.loadAsync('/models/town.glb'), loader.loadAsync('/models/town-car.glb')].map(promise => promise.then(asset => {
      if (disposed) { asset.scene.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => material.dispose()); } }); }
      else track(asset.scene);
      return asset;
    }))).then(([town, car]) => {
      if (disposed) return;
      // The supplied backdrop replaces the model's oversized outer ground plane.
      const ground = town.scene.getObjectByName('HX_ground');
      if (ground) ground.visible = false;
      town.scene.traverse(object => { if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true; } });
      scene.add(town.scene);
      for (let i = 0; i < 4; i++) { const copy = car.scene.clone(true); scene.add(copy); cars.push(copy); }
      const skin = new THREE.MeshStandardMaterial({ color: '#d8aa85', roughness: 1 });
      const trousers = new THREE.MeshStandardMaterial({ color: '#314555', roughness: 1 });
      const head = new THREE.SphereGeometry(0.19, 8, 6);
      const torso = new THREE.BoxGeometry(0.48, 0.62, 0.28);
      const limb = new THREE.BoxGeometry(0.15, 0.67, 0.18);
      ['#e9e9df', '#34849a', '#cb7958'].forEach((color, palette) => {
        const shirt = new THREE.MeshStandardMaterial({ color, roughness: 1 });
        for (let i = 0; i < 4; i++) {
          const root = new THREE.Group();
          const body = new THREE.Mesh(torso, shirt); body.position.y = 1.05; root.add(body);
          const face = new THREE.Mesh(head, skin); face.position.y = 1.57; root.add(face);
          const legs = [-1, 1].map(side => {
            const joint = new THREE.Group(); joint.position.set(side * 0.14, 0.76, 0);
            const mesh = new THREE.Mesh(limb, trousers); mesh.position.y = -0.33; joint.add(mesh); root.add(joint); return joint;
          });
          root.scale.setScalar(1.15); root.userData.palette = palette;
          scene.add(root); track(root); people.push({ root, left: legs[0], right: legs[1] });
        }
      });
      // Follow the open lane around parked cars, with room for the full car at each turn.
      const road = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-30, -0.48, 29.6), new THREE.Vector3(-18, -0.48, 29.6),
        new THREE.Vector3(-7, -0.48, 29.6), new THREE.Vector3(11, -0.48, 32.4),
        new THREE.Vector3(29, -0.48, 32.4), new THREE.Vector3(33.8, -0.48, 31.2),
        new THREE.Vector3(35.65, -0.48, 28.65), new THREE.Vector3(36.35, -0.48, 25),
        new THREE.Vector3(36.35, -0.48, 17), new THREE.Vector3(33.65, -0.48, 1),
        new THREE.Vector3(33.65, -0.48, -16), new THREE.Vector3(34.9, -0.48, -26),
        new THREE.Vector3(34.6, -0.48, -29.6), new THREE.Vector3(31, -0.48, -31),
        new THREE.Vector3(-31, -0.48, -31), new THREE.Vector3(-34.2, -0.48, -30.5),
        new THREE.Vector3(-35, -0.48, -27), new THREE.Vector3(-33.65, -0.48, -5),
        new THREE.Vector3(-33.65, -0.48, 12), new THREE.Vector3(-34, -0.48, 25),
        new THREE.Vector3(-33.5, -0.48, 28.8),
      ], true, 'catmullrom', 0.16);
      const point = new THREE.Vector3(), tangent = new THREE.Vector3();
      const animate = (now: number) => {
        frame = requestAnimationFrame(animate);
        const delta = Math.min((now - previous) / 1000, 0.05); previous = now;
        if (document.hidden) return;
        if (transitioningRef.current) {
          if (!diveStartedAt) diveStartedAt = now;
          const raw = Math.min(1, (now - diveStartedAt) / DIVE_DURATION);
          const progress = raw * raw * (3 - 2 * raw);
          camera.position.lerpVectors(diveStart, diveEnd, progress);
          camera.lookAt(diveTarget);
          camera.zoom = 1 + progress * 3.8;
          camera.updateProjectionMatrix();
          if (import.meta.env.DEV) diagnostic.__townScene = { ready: true, transitioning: true, transitionProgress: raw, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, carPosition: cars[0].position.toArray(), pedestrianPosition: people[0].root.position.toArray() };
          if (raw >= 1 && !diveCompleted) {
            diveCompleted = true;
            onDiveCompleteRef.current?.();
          }
        }
        if (!motion.matches) elapsed += delta;
        cars.forEach((copy, index) => {
          road.getPointAt((elapsed / 95 + index / 4) % 1, point); road.getTangentAt((elapsed / 95 + index / 4) % 1, tangent);
          copy.position.copy(point); copy.rotation.y = -Math.atan2(tangent.z, tangent.x);
        });
        people.forEach(({ root, left, right }, index) => {
          // Walk out and back on the existing south hospital sidewalk.
          const progress = (elapsed * 0.85 + index * 3.7) % 72;
          const outgoing = progress < 36;
          root.position.set(outgoing ? -18 + progress : 54 - progress, -0.35, 21.55 + (index % 2) * 0.3);
          root.rotation.y = outgoing ? Math.PI / 2 : -Math.PI / 2;
          left.rotation.x = Math.sin(elapsed * 6 + index) * 0.38; right.rotation.x = -left.rotation.x;
        });
        renderer.render(scene, camera);
        if (import.meta.env.DEV && !transitioningRef.current) diagnostic.__townScene = { ready: true, transitioning: false, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, frameMs: delta * 1000, carPosition: cars[0].position.toArray(), pedestrianPosition: people[0].root.position.toArray(), loadMs: readyMs };
      };
      const readyMs = performance.now() - started;
      // Static architecture shadows are computed once; animated ambient objects are unshadowed.
      renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
      onReady(); frame = requestAnimationFrame(animate);
    }).catch(() => { if (!disposed) onError(); });
    return () => {
      disposed = true; cancelAnimationFrame(frame); observer.disconnect(); decoder.dispose();
      resources.forEach(resource => resource.dispose()); sun.shadow.dispose();
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
      delete diagnostic.__townScene;
    };
  }, [onReady, onError]);
  return <div className="town-background" ref={host} aria-hidden="true" />;
}

import { readFile } from 'node:fs/promises'
import { AnimationMixer, Box2, Box3, Mesh, MeshStandardMaterial, Object3D, PropertyBinding, SkinnedMesh, Texture, Vector2, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { expect, it } from 'vitest'
import patients from '../server/training-cases.json'
import manifest from '../public/models/asset-manifest.json'
import { patientModelUrl } from '../src/scene/patientModel'
import { WALK_CLIP_SPEED } from '../src/scene/navigation'

// Compare the front and side outlines by height: repainting a mesh cannot change them.
function outline(root: Object3D, bounds: Box3) {
  const slices = Array.from({ length: 24 }, () => new Box3())
  const height = bounds.max.y - bounds.min.y
  const vertex = new Vector3()
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return
    const positions = object.geometry.getAttribute('position')
    for (let i = 0; i < positions.count; i += 1) {
      vertex.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld)
      const index = Math.max(0, Math.min(slices.length - 1, Math.floor((vertex.y - bounds.min.y) * slices.length / height)))
      slices[index].expandByPoint(vertex)
    }
  })
  return slices.map((slice) => {
    const size = slice.getSize(new Vector3())
    return [Math.round(size.x / height * 100), Math.round(size.z / height * 100)]
  })
}

async function loadModel(url: string) {
  const bytes = await readFile(new URL('../public' + url, import.meta.url))
  // Node lacks a GPU image decoder. Check the actual embedded image bytes, then
  // let GLTFLoader and Three.js load all geometry, UVs, skinning and animation.
  const loader = new GLTFLoader().register((parser) => ({
    name: 'EmbeddedAtlasTestLoader',
    async loadTexture(index) {
      const image: { bufferView: number; mimeType: string } = parser.json.images[parser.json.textures[index].source]
      const data = Buffer.from(await parser.loadBufferView(image.bufferView))
      expect(image.mimeType, url).toBe('image/jpeg')
      expect(data.readUInt16BE(0), url).toBe(0xffd8)
      expect(data.readUInt16BE(data.length - 2), url).toBe(0xffd9)
      return new Texture()
    },
  }))
  return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
}

function triangles(scene: Object3D) {
  let total = 0
  scene.traverse((part) => {
    if (part instanceof Mesh) total += (part.geometry.index?.count ?? part.geometry.getAttribute('position').count) / 3
  })
  return total
}

function checkWalkingCycle(id: string, scene: Object3D, hips: Object3D, mixer: AnimationMixer, duration: number) {
  const mesh = scene.getObjectByProperty('isSkinnedMesh', true)
  if (!(mesh instanceof SkinnedMesh)) throw new Error(id + ' has no skinned surface')
  const point = new Vector3()
  const positions = mesh.geometry.getAttribute('position')
  const joints = mesh.geometry.getAttribute('skinIndex')
  const weights = mesh.geometry.getAttribute('skinWeight')
  const soles: number[][] = [[], []]
  for (let i = 0; i < positions.count; i++) {
    point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld)
    if (point.y >= 0.06) continue
    let dominant = 0
    for (let slot = 1; slot < weights.itemSize; slot++) {
      if (weights.getComponent(i, slot) > weights.getComponent(i, dominant)) dominant = slot
    }
    const bone = mesh.skeleton.bones[joints.getComponent(i, dominant)].name
    if (bone.endsWith('L')) soles[0].push(i)
    if (bone.endsWith('R')) soles[1].push(i)
  }
  const poseAt = (time: number) => {
    mixer.setTime(time)
    scene.updateMatrixWorld(true)
  }
  const vertex = (i: number) => mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld)
  const samples = 48
  const dt = duration / samples
  const travel = WALK_CLIP_SPEED * dt
  const intervals = [0, 0]
  const hipHeights: number[] = []
  let slip = 0
  for (let frame = 0; frame < samples; frame++) {
    poseAt((frame + 0.5) * dt)
    hipHeights.push(hips.getWorldPosition(point).y)
    const contact = soles.map(indices => {
      let index = -1, height = Infinity
      for (const i of indices) {
        const y = vertex(i).y
        if (y < height) { index = i; height = y }
      }
      return { index, height }
    })
    const side = contact[0].height < contact[1].height ? 0 : 1
    if (contact[side].height > 0.004 || contact[1 - side].height < 0.008) continue
    // The heel can roll onto the toe. Track the same patch of rubber over just
    // this interval, adding the scene's forward motion to the in-place clip.
    poseAt(frame * dt)
    const start = vertex(contact[side].index).z
    poseAt((frame + 1) * dt)
    slip += Math.abs(vertex(contact[side].index).z - start + travel)
    intervals[side]++
  }
  expect(Math.min(...intervals), id + ' single support on each foot').toBeGreaterThan(samples * 0.1)
  expect(Math.max(...hipHeights) - Math.min(...hipHeights), id + ' pelvis bounce in metres').toBeLessThan(0.05)
  expect(slip / ((intervals[0] + intervals[1]) * travel), id + ' planted-foot slip / travel').toBeLessThan(0.30)
}

it('matches Wang Xu’s height and triangle budget with distinct textured, walking patients', async () => {
  const shapes = new Set<string>()
  expect(patientModelUrl('wang-xu')).toBe('/models/patient.glb')
  const reference = await loadModel(patientModelUrl('wang-xu'))
  const referenceWalk = reference.animations.find((clip) => clip.name === 'Walk')!
  const referenceHeight = new Box3().setFromObject(reference.scene, true).getSize(new Vector3()).y
  const referenceTriangles = triangles(reference.scene)
  expect(referenceTriangles).toBe(manifest.characters.patient.triangles)
  for (const { id } of patients) {
    const url = patientModelUrl(id)
    expect(url, id).toBe(`/models/patients/${id}.glb`)
    const { scene, animations } = await loadModel(url)
    const bounds = new Box3().setFromObject(scene, true)
    const height = bounds.getSize(new Vector3()).y
    expect(Math.abs(bounds.min.y), id).toBeLessThan(0.005)
    expect(Math.abs(height - referenceHeight), id).toBeLessThan(0.005)
    expect(triangles(scene), id).toBe(referenceTriangles)

    let texturedMeshes = 0
    scene.traverse((part) => {
      if (!(part instanceof Mesh)) return
      expect(part.material, id).toBeInstanceOf(MeshStandardMaterial)
      const material: MeshStandardMaterial = part.material
      expect([material.map, material.normalMap, material.roughnessMap, material.metalnessMap].every(Boolean), id).toBe(true)
      const channel = material.map!.channel
      const uv = part.geometry.getAttribute(channel === 0 ? 'uv' : 'uv' + channel)
      expect(uv, id).toBeDefined()
      const region = new Box2()
      const point = new Vector2()
      const v = new Vector3()
      const positions = part.geometry.getAttribute('position')
      for (let i = 0; i < positions.count; i++) {
        v.fromBufferAttribute(positions, i).applyMatrix4(part.matrixWorld)
        if (v.y > bounds.min.y + height * 0.62) region.expandByPoint(point.set(uv.getX(i), uv.getY(i)))
      }
      const size = region.getSize(point)
      expect(Math.min(size.x, size.y), id + ' head UV coverage').toBeGreaterThan(0.02)
      texturedMeshes++
    })
    expect(texturedMeshes, id).toBeGreaterThan(0)
    const shape = JSON.stringify(outline(scene, bounds))
    expect(shapes.has(shape), `${id} repeats another patient's geometry`).toBe(false)
    shapes.add(shape)

    expect(animations.map((clip) => clip.name), id).toEqual(expect.arrayContaining(['Idle', 'Walk', 'Talk']))
    const walk = animations.find((clip) => clip.name === 'Walk')!
    // At the same travel speed, a shorter cycle would step faster than Wang Xu.
    expect(walk.duration, id + ' walk cycle').toBeGreaterThanOrEqual(referenceWalk.duration)
    const mixer = new AnimationMixer(scene)
    mixer.clipAction(walk).play()
    const hips = scene.getObjectByName('Hips')
    const feet = ['L', 'R'].map((side) => scene.getObjectByName(PropertyBinding.sanitizeNodeName('Foot.' + side)))
    if (!hips || !feet[0] || !feet[1]) throw new Error(`${id} is missing its hips or feet`)
    const samples = [0, 0.25, 0.5, 0.75].map((fraction) => {
      mixer.setTime(walk.duration * fraction)
      scene.updateMatrixWorld(true)
      expect(Math.abs(new Box3().setFromObject(scene, true).min.y), id).toBeLessThan(0.025)
      return feet.map((foot) => {
        return hips.worldToLocal(foot!.getWorldPosition(new Vector3()))
      })
    })
    for (const side of [0, 1]) {
      expect(Math.max(...samples.map((sample) => sample[side].distanceTo(samples[0][side]))), id).toBeGreaterThan(0.025)
    }
    checkWalkingCycle(id, scene, hips, mixer, walk.duration)
  }
})

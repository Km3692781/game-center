import * as THREE from 'three'
import { assets } from '@core/AssetLoader'

const TREE_PATHS = [
  '/assets/models/nature/tree1.fbx',
  '/assets/models/nature/tree2.fbx',
  '/assets/models/nature/tree3.fbx',
  '/assets/models/nature/tree4.fbx',
  '/assets/models/nature/pine1.fbx',
  '/assets/models/nature/pine2.fbx',
  '/assets/models/nature/pine3.fbx',
]

const BUSH_PATHS = [
  '/assets/models/nature/bush1.fbx',
  '/assets/models/nature/bush2.fbx',
]

const ROCK_PATHS = [
  '/assets/models/nature/rock1.fbx',
  '/assets/models/nature/rock2.fbx',
]

export class NatureAssets {
  private static ready = false
  private static trees: string[] = []
  private static bushes: string[] = []
  private static rocks: string[] = []
  private static barkMap: THREE.Texture | null = null
  private static barkNor: THREE.Texture | null = null

  static get isReady(): boolean {
    return this.ready
  }

  static get hasTrees(): boolean {
    return this.trees.length > 0
  }

  static async preload(): Promise<void> {
    const loader = new THREE.TextureLoader()
    try {
      this.barkMap = loader.load('/assets/textures/pbr/bark/diff.jpg')
      this.barkMap.colorSpace = THREE.SRGBColorSpace
      this.barkMap.wrapS = this.barkMap.wrapT = THREE.RepeatWrapping
      this.barkNor = loader.load('/assets/textures/pbr/bark/nor.jpg')
      this.barkNor.wrapS = this.barkNor.wrapT = THREE.RepeatWrapping
    } catch {
      /* optional */
    }

    const tryLoad = async (paths: string[], into: string[]): Promise<void> => {
      await Promise.all(paths.map(async (p) => {
        try {
          await assets.preloadModel(p)
          into.push(p)
        } catch (err) {
          console.warn(`Nature asset failed (${p}):`, err)
        }
      }))
    }

    await Promise.all([
      tryLoad(TREE_PATHS, this.trees),
      tryLoad(BUSH_PATHS, this.bushes),
      tryLoad(ROCK_PATHS, this.rocks),
    ])
    this.ready = true
  }

  static createTree(scale = 1): THREE.Group | null {
    if (!this.trees.length) return null
    const path = this.trees[Math.floor(Math.random() * this.trees.length)]
    return this.instance(path, 6 + Math.random() * 5, scale)
  }

  static createBush(scale = 1): THREE.Group | null {
    if (!this.bushes.length) return null
    const path = this.bushes[Math.floor(Math.random() * this.bushes.length)]
    return this.instance(path, 1.2 + Math.random() * 0.8, scale)
  }

  static createRock(scale = 1): THREE.Group | null {
    if (!this.rocks.length) return null
    const path = this.rocks[Math.floor(Math.random() * this.rocks.length)]
    return this.instance(path, 1.5 + Math.random() * 2, scale)
  }

  private static instance(path: string, targetHeight: number, scaleMul: number): THREE.Group | null {
    const raw = assets.cloneModel(path)
    if (!raw) return null

    const root = new THREE.Group()
    root.add(raw)

    raw.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(raw)
    const size = box.getSize(new THREE.Vector3())
    const h = Math.max(size.y, 0.001)
    raw.scale.setScalar((targetHeight * scaleMul) / h)

    raw.updateMatrixWorld(true)
    const box2 = new THREE.Box3().setFromObject(raw)
    raw.position.y -= box2.min.y

    raw.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true

      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      mesh.material = mats.map((mat) => {
        const std = (mat as THREE.MeshStandardMaterial).clone()
        const name = (mesh.name + (std.name ?? '')).toLowerCase()
        const isTrunk = name.includes('trunk') || name.includes('bark') || name.includes('wood')
        const isLeaf = name.includes('leaf') || name.includes('foliage') || name.includes('crown')

        if (isTrunk && this.barkMap) {
          std.map = this.barkMap
          if (this.barkNor) {
            std.normalMap = this.barkNor
            std.normalScale = new THREE.Vector2(0.9, 0.9)
          }
          std.color.set(0xffffff)
          std.roughness = 0.95
          std.metalness = 0
        } else if (isLeaf || !isTrunk) {
          // Quaternius often uses vertex colors — boost foliage green
          if (!std.map) {
            std.color.set(0x2f6b32).offsetHSL(0, 0, (Math.random() - 0.5) * 0.08)
          }
          std.roughness = 0.9
          std.metalness = 0
          std.side = THREE.DoubleSide
        }
        std.needsUpdate = true
        return std
      })
      if (Array.isArray(mesh.material) && mesh.material.length === 1) {
        mesh.material = mesh.material[0]
      }
    })

    root.rotation.y = Math.random() * Math.PI * 2
    return root
  }
}

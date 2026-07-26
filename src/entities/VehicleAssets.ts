import * as THREE from 'three'
import { assets } from '@core/AssetLoader'

/** Higher-detail CC0 motorcycle (OpenGameArt → GLB). */
const BIKE_PATH = '/assets/models/bikes_hq/motorcycle.glb'
/** Fallback Kenney moto if HQ fails. */
const BIKE_FALLBACK = '/assets/models/bikes/motorcycle.glb'

const CAR_HQ = '/assets/models/cars_hq/ferrari.glb'
const CAR_PATHS = [
  '/assets/models/cars/sedan.glb',
  '/assets/models/cars/sedan-sports.glb',
  '/assets/models/cars/taxi.glb',
  '/assets/models/cars/hatchback-sports.glb',
  '/assets/models/cars/suv.glb',
  '/assets/models/cars/van.glb',
  '/assets/models/cars/truck.glb',
  '/assets/models/cars/race.glb',
]

const RIDER_PATH = '/assets/models/props/xbot.glb'

const BIKE_LENGTH = 2.05
const CAR_LENGTH = 4.4
const FERRARI_LENGTH = 4.5

export class VehicleAssets {
  private static ready = false
  private static bikePath: string | null = null
  private static carOk = false
  private static ferrariOk = false
  private static riderOk = false

  static get isReady(): boolean {
    return this.ready
  }

  static get hasBike(): boolean {
    return this.bikePath !== null
  }

  static get hasCars(): boolean {
    return this.carOk || this.ferrariOk
  }

  static get hasRider(): boolean {
    return this.riderOk
  }

  static async preload(): Promise<void> {
    const jobs: Promise<void>[] = [
      assets.preloadModel(BIKE_PATH).then(() => {
        this.bikePath = BIKE_PATH
      }).catch(async () => {
        try {
          await assets.preloadModel(BIKE_FALLBACK)
          this.bikePath = BIKE_FALLBACK
        } catch (err) {
          console.warn('Bike GLTF missing:', err)
        }
      }),
      assets.preloadModel(CAR_HQ).then(() => {
        this.ferrariOk = true
      }).catch((err) => console.warn('Ferrari GLTF missing:', err)),
      assets.preloadModel(RIDER_PATH).then(() => {
        this.riderOk = true
      }).catch((err) => console.warn('Rider GLTF missing:', err)),
    ]

    for (const path of CAR_PATHS) {
      jobs.push(
        assets.preloadModel(path).then(() => { this.carOk = true }).catch((err) => {
          console.warn(`Car GLTF failed (${path}):`, err)
        })
      )
    }

    await Promise.all(jobs)
    this.ready = true
  }

  static createBike(tint: number, envMap?: THREE.Texture): THREE.Group | null {
    if (!this.bikePath) return null
    const raw = assets.cloneModel(this.bikePath)
    if (!raw) return null
    const kind = this.bikePath === BIKE_PATH ? 'bike_hq' : 'bike'
    return this.prepare(raw, BIKE_LENGTH, tint, envMap, kind)
  }

  static createCar(tint: number, envMap?: THREE.Texture): THREE.Group | null {
    // Prefer HQ sports car ~40% of the time when available
    if (this.ferrariOk && Math.random() < 0.4) {
      const raw = assets.cloneModel(CAR_HQ)
      if (raw) return this.prepare(raw, FERRARI_LENGTH, tint, envMap, 'ferrari')
    }
    if (!this.carOk) {
      if (this.ferrariOk) {
        const raw = assets.cloneModel(CAR_HQ)
        if (raw) return this.prepare(raw, FERRARI_LENGTH, tint, envMap, 'ferrari')
      }
      return null
    }
    const path = CAR_PATHS[Math.floor(Math.random() * CAR_PATHS.length)]
    const raw = assets.cloneModel(path) ?? assets.cloneModel(CAR_PATHS[0])
    if (!raw) return null
    return this.prepare(raw, CAR_LENGTH, tint, envMap, 'car')
  }

  static createRider(_tint: number, _envMap?: THREE.Texture): THREE.Group | null {
    // Xbot needs Mixamo sit pose / retarget — procedural racing rider is more reliable for now.
    return null
  }

  private static prepare(
    source: THREE.Object3D,
    targetLength: number,
    tint: number,
    envMap: THREE.Texture | undefined,
    kind: 'bike' | 'bike_hq' | 'car' | 'ferrari'
  ): THREE.Group {
    const root = new THREE.Group()
    const pivot = new THREE.Group()
    root.add(pivot)
    pivot.add(source)

    // OGA bike mesh is length-along-X; rotate so length → Z
    if (kind === 'bike_hq') {
      pivot.rotation.y = Math.PI / 2
    }

    pivot.updateMatrixWorld(true)
    let box = new THREE.Box3().setFromObject(root)
    let size = box.getSize(new THREE.Vector3())
    let center = box.getCenter(new THREE.Vector3())

    pivot.position.x -= center.x
    pivot.position.z -= center.z
    pivot.position.y -= box.min.y

    pivot.updateMatrixWorld(true)
    box = new THREE.Box3().setFromObject(root)
    size = box.getSize(new THREE.Vector3())

    const lengthDim = Math.max(
      kind === 'bike' || kind === 'bike_hq' ? size.z : Math.max(size.x, size.z),
      0.001
    )
    const scale = targetLength / lengthDim
    pivot.scale.setScalar(scale)

    pivot.updateMatrixWorld(true)
    box = new THREE.Box3().setFromObject(root)
    pivot.position.y -= box.min.y

    // Traffic uses Object3D.lookAt which aims local +Z along travel.
    // Ferrari / procedural noses sit on −Z → flip π so the nose follows +Z/travel.
    // Kenney Car Kit noses already sit on +Z → do not flip (π made vans/F1 look reversed).
    if (kind === 'ferrari') {
      pivot.rotation.y += Math.PI
    } else if (kind === 'bike' || kind === 'bike_hq') {
      // Bikes use rotation.y = heading (−Z forward), not lookAt
      pivot.rotation.y += Math.PI
    }
    // kind === 'car' (Kenney): no extra yaw

    root.userData.vehicleKind = kind
    root.userData.yawOffset = 0

    const lookKind = kind === 'bike_hq' ? 'bike' : kind === 'bike' ? 'bike' : kind
    this.applyLook(root, tint, envMap, lookKind)
    return root
  }

  private static applyLook(
    root: THREE.Object3D,
    tint: number,
    envMap: THREE.Texture | undefined,
    kind: 'bike' | 'car' | 'ferrari'
  ): void {
    const tintColor = new THREE.Color(tint)
    root.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh) return

      mesh.castShadow = true
      mesh.receiveShadow = true

      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      const next = mats.map((mat) => {
        const std = mat as THREE.MeshStandardMaterial
        if (!std || !('color' in std)) return mat

        const m = std.clone()
        const name = (mesh.name + (m.name ?? '')).toLowerCase()

        if (m.map) {
          m.map.colorSpace = THREE.SRGBColorSpace
          m.map.anisotropy = 8
          m.map.needsUpdate = true
        }

        // Paint / body tint
        if (kind === 'bike') {
          // Untextured OGA mesh — assign paint / rubber / chrome by brightness
          const brightness = (m.color.r + m.color.g + m.color.b) / 3
          if (name.includes('tire') || name.includes('wheel') || name.includes('rubber') || brightness < 0.15) {
            m.color.set(0x1a1a1a)
            m.metalness = 0.05
            m.roughness = 0.92
          } else if (name.includes('chrome') || name.includes('metal') || name.includes('exhaust') || brightness > 0.75) {
            m.color.set(0xd8d8d8)
            m.metalness = 0.95
            m.roughness = 0.16
          } else if (name.includes('seat') || name.includes('leather')) {
            m.color.set(0x1a1a1a)
            m.metalness = 0.05
            m.roughness = 0.7
          } else {
            m.color.copy(tintColor)
            m.metalness = 0.65
            m.roughness = 0.22
          }
        } else if (kind === 'ferrari') {
          // Keep baked materials; subtle tint on body-like mats
          if (!m.map && m.color.getHex() > 0x333333) {
            m.color.lerp(tintColor, 0.35)
          }
          m.metalness = Math.max(m.metalness ?? 0.4, 0.5)
          m.roughness = Math.min(m.roughness ?? 0.4, 0.35)
        } else {
          if (m.map) {
            m.color.copy(tintColor).lerp(new THREE.Color(0xffffff), 0.5)
          } else {
            const brightness = (m.color.r + m.color.g + m.color.b) / 3
            if (brightness > 0.18 && brightness < 0.92) m.color.multiply(tintColor)
          }
          m.metalness = Math.min(0.6, (m.metalness ?? 0) + 0.2)
          m.roughness = Math.max(0.2, (m.roughness ?? 0.6) * 0.7)
        }

        if (envMap) {
          m.envMap = envMap
          m.envMapIntensity = kind === 'bike' ? 1.0 : 1.15
        }

        m.needsUpdate = true
        return m
      })

      mesh.material = next.length === 1 ? next[0] : next
    })
  }
}

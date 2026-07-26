import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { Physics } from '@core/Physics'
import { NatureAssets } from '@entities/NatureAssets'

export interface Waypoint {
  position: THREE.Vector3
  width: number
}

/** Body center Y so wheels sit on the road surface */
export const RIDE_HEIGHT = 0.42
/** Visual asphalt top — bike wheels should touch this */
export const ROAD_SURFACE_Y = 0.06

export class Track {
  public mesh: THREE.Group
  public waypoints: Waypoint[] = []
  private physics: Physics
  private readonly roadWidth = 16
  private curve!: THREE.CatmullRomCurve3
  private readonly segments = 400
  /** Hidden when PseudoRoad is the primary asphalt visual */
  private legacyRoadVisuals: THREE.Group = new THREE.Group()
  private sceneryVisuals: THREE.Group = new THREE.Group()
  private grassTexture!: THREE.Texture
  private grassNormal!: THREE.Texture
  private grassRough!: THREE.Texture
  private asphaltTexture!: THREE.Texture
  private asphaltNormal!: THREE.Texture
  private asphaltRough!: THREE.Texture
  private gravelTexture!: THREE.Texture
  private gravelNormal!: THREE.Texture
  private gravelRough!: THREE.Texture
  private brickTexture!: THREE.Texture
  private brickNormal!: THREE.Texture
  private brickRough!: THREE.Texture
  private concreteTexture!: THREE.Texture
  private concreteNormal!: THREE.Texture
  private concreteRough!: THREE.Texture

  get roadHalfWidth(): number {
    return this.roadWidth / 2
  }

  constructor(physics: Physics) {
    this.physics = physics
    this.mesh = new THREE.Group()
    this.loadTextures()
    this.buildCurve()
    this.buildWaypoints()
    this.build()
  }

  private loadTextures(): void {
    const loader = new THREE.TextureLoader()

    const prep = (tex: THREE.Texture, repeatX: number, repeatY: number, srgb: boolean): THREE.Texture => {
      tex.wrapS = THREE.RepeatWrapping
      tex.wrapT = THREE.RepeatWrapping
      tex.repeat.set(repeatX, repeatY)
      tex.anisotropy = 16
      if (srgb) tex.colorSpace = THREE.SRGBColorSpace
      return tex
    }

    // Prefer leafy grass / asphalt_track / gravel_floor when present
    this.grassTexture = prep(loader.load('/assets/textures/pbr/leafy_grass/diff.jpg'), 60, 60, true)
    this.grassNormal = prep(loader.load('/assets/textures/pbr/leafy_grass/nor.jpg'), 60, 60, false)
    this.grassRough = prep(loader.load('/assets/textures/pbr/leafy_grass/rough.jpg'), 60, 60, false)

    this.asphaltTexture = prep(loader.load('/assets/textures/pbr/asphalt_track/diff.jpg'), 1, 1, true)
    this.asphaltNormal = prep(loader.load('/assets/textures/pbr/asphalt_track/nor.jpg'), 1, 1, false)
    this.asphaltRough = prep(loader.load('/assets/textures/pbr/asphalt_track/rough.jpg'), 1, 1, false)

    this.gravelTexture = prep(loader.load('/assets/textures/pbr/gravel_floor/diff.jpg'), 1, 1, true)
    this.gravelNormal = prep(loader.load('/assets/textures/pbr/gravel_floor/nor.jpg'), 1, 1, false)
    this.gravelRough = prep(loader.load('/assets/textures/pbr/gravel_floor/rough.jpg'), 1, 1, false)

    this.brickTexture = prep(loader.load('/assets/textures/pbr/brick/diff.jpg'), 2, 2, true)
    this.brickNormal = prep(loader.load('/assets/textures/pbr/brick/nor.jpg'), 2, 2, false)
    this.brickRough = prep(loader.load('/assets/textures/pbr/brick/rough.jpg'), 2, 2, false)

    this.concreteTexture = prep(loader.load('/assets/textures/pbr/concrete/diff.jpg'), 2, 3, true)
    this.concreteNormal = prep(loader.load('/assets/textures/pbr/concrete/nor.jpg'), 2, 3, false)
    this.concreteRough = prep(loader.load('/assets/textures/pbr/concrete/rough.jpg'), 2, 3, false)
  }

  private buildCurve(): void {
    // Closed loop — do NOT duplicate the start point.
    // Points near the seam stay nearly colinear along -Z so the finish is smooth.
    const controlPoints = [
      new THREE.Vector3(0, 0, 0),          // START / FINISH
      new THREE.Vector3(-5, 0, -70),
      new THREE.Vector3(-25, 0, -170),
      new THREE.Vector3(-40, 0, -280),
      new THREE.Vector3(20, 0, -380),
      new THREE.Vector3(140, 0, -430),
      new THREE.Vector3(260, 0, -400),
      new THREE.Vector3(340, 0, -300),
      new THREE.Vector3(360, 0, -180),
      new THREE.Vector3(330, 0, -60),
      new THREE.Vector3(280, 0, 60),
      new THREE.Vector3(260, 0, 180),
      new THREE.Vector3(220, 0, 300),
      new THREE.Vector3(120, 0, 380),
      new THREE.Vector3(10, 0, 400),
      new THREE.Vector3(-90, 0, 340),
      new THREE.Vector3(-130, 0, 220),
      new THREE.Vector3(-110, 0, 120),
      new THREE.Vector3(-50, 0, 60),
      new THREE.Vector3(-15, 0, 30),       // gentle approach into start
    ]

    this.curve = new THREE.CatmullRomCurve3(controlPoints, true, 'catmullrom', 0.25)
  }

  private buildWaypoints(): void {
    const totalWaypoints = 48
    for (let i = 0; i < totalWaypoints; i++) {
      const t = i / totalWaypoints
      const point = this.curve.getPointAt(t)
      this.waypoints.push({
        position: new THREE.Vector3(point.x, 0, point.z),
        width: this.roadWidth,
      })
    }
  }

  private build(): void {
    this.legacyRoadVisuals.visible = true
    this.sceneryVisuals.visible = true
    this.mesh.add(this.legacyRoadVisuals)
    this.mesh.add(this.sceneryVisuals)

    this.buildTerrain()
    this.buildShoulders()
    this.buildRoadMesh()
    this.buildRoadMarkings()
    this.buildWalls()
    this.buildScenery()
    this.buildStartFinish()
  }

  /** @deprecated Pseudo-road mode removed — full PBR track is always shown. */
  enablePseudoRoadMode(): void {
    this.legacyRoadVisuals.visible = true
  }

  private buildTerrain(): void {
    const size = 1400
    const geo = new THREE.PlaneGeometry(size, size)
    const mat = new THREE.MeshStandardMaterial({
      map: this.grassTexture,
      normalMap: this.grassNormal,
      normalScale: new THREE.Vector2(0.9, 0.9),
      roughnessMap: this.grassRough,
      roughness: 1,
      metalness: 0.0,
      color: 0xb8d090,
    })
    const terrain = new THREE.Mesh(geo, mat)
    terrain.rotation.x = -Math.PI / 2
    terrain.position.set(0, -0.02, 0)
    terrain.receiveShadow = true
    this.mesh.add(terrain)

    // Ground collider top ≈ y = 0
    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.15, 0)
    const body = this.physics.world.createRigidBody(bodyDesc)
    this.physics.world.createCollider(
      RAPIER.ColliderDesc.cuboid(700, 0.15, 700).setFriction(1.2),
      body
    )
  }

  private buildShoulders(): void {
    const halfW = this.roadWidth / 2
    const shoulderW = 2.2
    const vertices: number[] = []
    const uvs: number[] = []
    const indices: number[] = []
    const up = new THREE.Vector3(0, 1, 0)
    let dist = 0
    let prev: THREE.Vector3 | null = null

    for (let i = 0; i <= this.segments; i++) {
      const t = i / this.segments
      const point = this.curve.getPointAt(t)
      const tangent = this.curve.getTangentAt(t).normalize()
      const right = new THREE.Vector3().crossVectors(tangent, up).normalize()

      if (prev) dist += point.distanceTo(prev)
      prev = point.clone()

      const innerL = point.clone().addScaledVector(right, -(halfW + 0.05))
      const outerL = point.clone().addScaledVector(right, -(halfW + shoulderW))
      const innerR = point.clone().addScaledVector(right, halfW + 0.05)
      const outerR = point.clone().addScaledVector(right, halfW + shoulderW)

      vertices.push(outerL.x, 0.04, outerL.z, innerL.x, 0.05, innerL.z)
      vertices.push(innerR.x, 0.05, innerR.z, outerR.x, 0.04, outerR.z)

      const v = dist / 3.5
      uvs.push(0, v, shoulderW / 3.5, v, 0, v, shoulderW / 3.5, v)

      if (i < this.segments) {
        const b = i * 4
        indices.push(b, b + 1, b + 4, b + 1, b + 5, b + 4)
        indices.push(b + 2, b + 3, b + 6, b + 3, b + 7, b + 6)
      }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geo.setIndex(indices)
    geo.computeVertexNormals()

    const mat = new THREE.MeshStandardMaterial({
      map: this.gravelTexture,
      normalMap: this.gravelNormal,
      normalScale: new THREE.Vector2(1.2, 1.2),
      roughnessMap: this.gravelRough,
      roughness: 1,
      metalness: 0,
      color: 0xffffff,
    })
    const shoulders = new THREE.Mesh(geo, mat)
    shoulders.receiveShadow = true
    this.legacyRoadVisuals.add(shoulders)
  }

  private buildRoadMesh(): void {
    const vertices: number[] = []
    const uvs: number[] = []
    const indices: number[] = []
    const up = new THREE.Vector3(0, 1, 0)
    const halfW = this.roadWidth / 2
    let dist = 0
    let prev: THREE.Vector3 | null = null

    for (let i = 0; i <= this.segments; i++) {
      const t = i / this.segments
      const point = this.curve.getPointAt(t)
      const tangent = this.curve.getTangentAt(t).normalize()
      const right = new THREE.Vector3().crossVectors(tangent, up).normalize()

      if (prev) dist += point.distanceTo(prev)
      prev = point.clone()

      const left3 = point.clone().addScaledVector(right, -halfW)
      const right3 = point.clone().addScaledVector(right, halfW)

      vertices.push(left3.x, 0.06, left3.z)
      vertices.push(right3.x, 0.06, right3.z)
      // 4 tiles across road (~4m), ~4m along track
      const v = dist / 4
      uvs.push(0, v)
      uvs.push(4, v)

      if (i < this.segments) {
        const a = i * 2
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
      }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geo.setIndex(indices)
    geo.computeVertexNormals()

    const mat = new THREE.MeshStandardMaterial({
      map: this.asphaltTexture,
      normalMap: this.asphaltNormal,
      normalScale: new THREE.Vector2(1.5, 1.5),
      roughnessMap: this.asphaltRough,
      roughness: 1,
      metalness: 0.02,
      color: 0xffffff,
    })

    const road = new THREE.Mesh(geo, mat)
    road.receiveShadow = true
    this.legacyRoadVisuals.add(road)
  }

  private buildRoadMarkings(): void {
    const centerMat = new THREE.MeshStandardMaterial({
      color: 0xffdd33,
      roughness: 0.55,
      emissive: 0x332200,
      emissiveIntensity: 0.15,
    })
    const laneMat = new THREE.MeshStandardMaterial({
      color: 0xf5f5f0,
      roughness: 0.6,
    })
    const dashCount = 160

    for (let i = 0; i < dashCount; i++) {
      const t = i / dashCount
      const tNext = Math.min(1, (i + 0.35) / dashCount)
      const p = this.curve.getPointAt(t)
      const pNext = this.curve.getPointAt(tNext)
      const tangent = this.curve.getTangentAt(t).normalize()
      const right = new THREE.Vector3()
        .crossVectors(tangent, new THREE.Vector3(0, 1, 0))
        .normalize()

      const segLen = p.distanceTo(pNext)
      const center = p.clone().lerp(pNext, 0.5)
      const angle = Math.atan2(tangent.x, tangent.z)

      ;[-0.1, 0.1].forEach((offset) => {
        const line = new THREE.Mesh(new THREE.PlaneGeometry(0.1, segLen), centerMat)
        line.rotation.x = -Math.PI / 2
        line.rotation.z = angle
        const pos = center.clone().addScaledVector(right, offset)
        line.position.set(pos.x, 0.075, pos.z)
        this.legacyRoadVisuals.add(line)
      })

      if (i % 2 === 0) {
        ;[-4.2, 4.2].forEach((offset) => {
          const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.12, segLen * 0.55), laneMat)
          dash.rotation.x = -Math.PI / 2
          dash.rotation.z = angle
          const pos = center.clone().addScaledVector(right, offset)
          dash.position.set(pos.x, 0.075, pos.z)
          this.legacyRoadVisuals.add(dash)
        })
      }
    }
  }

  private buildWalls(): void {
    const kerbH = 0.22
    const railH = 1.15
    const wallThick = 0.35
    const kerb1 = new THREE.MeshStandardMaterial({ color: 0xd92b1f, roughness: 0.55 })
    const kerb2 = new THREE.MeshStandardMaterial({ color: 0xf2f2f0, roughness: 0.55 })
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x8a9098,
      metalness: 0.75,
      roughness: 0.35,
    })
    const postMat = new THREE.MeshStandardMaterial({
      color: 0x555960,
      metalness: 0.6,
      roughness: 0.4,
    })
    const segCount = 160
    const half = this.roadWidth / 2

    for (let i = 0; i < segCount; i++) {
      const t0 = i / segCount
      const t1 = (i + 1) / segCount
      const p0 = this.curve.getPointAt(t0)
      const p1 = this.curve.getPointAt(t1)
      const tangent = new THREE.Vector3().subVectors(p1, p0).normalize()
      const right = new THREE.Vector3()
        .crossVectors(tangent, new THREE.Vector3(0, 1, 0))
        .normalize()
      const segLen = Math.max(0.5, p0.distanceTo(p1))
      const center = p0.clone().lerp(p1, 0.5)
      const angle = Math.atan2(tangent.x, tangent.z)
      const isEven = i % 2 === 0

      ;[-1, 1].forEach((side) => {
        const kerbCenter = center.clone().addScaledVector(right, side * half)

        const kerb = new THREE.Mesh(
          new THREE.BoxGeometry(wallThick, kerbH, segLen + 0.05),
          isEven ? kerb1 : kerb2
        )
        kerb.position.set(kerbCenter.x, kerbH / 2 + 0.06, kerbCenter.z)
        kerb.rotation.y = angle
        kerb.castShadow = true
        kerb.receiveShadow = true
        this.mesh.add(kerb)

        // Guard rail outside the kerb — keeps bikes on the road
        const railCenter = center.clone().addScaledVector(right, side * (half + 0.55))
        const rail = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, 0.28, segLen + 0.05),
          railMat
        )
        rail.position.set(railCenter.x, 0.55, railCenter.z)
        rail.rotation.y = angle
        rail.castShadow = true
        this.mesh.add(rail)

        if (i % 3 === 0) {
          const post = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, railH, 0.1),
            postMat
          )
          post.position.set(railCenter.x, railH / 2, railCenter.z)
          post.castShadow = true
          this.mesh.add(post)
        }

        // Tall physics barrier (invisible height beyond visual rail)
        const bodyDesc = RAPIER.RigidBodyDesc.fixed()
          .setTranslation(railCenter.x, railH / 2, railCenter.z)
          .setRotation({ x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) })
        const body = this.physics.world.createRigidBody(bodyDesc)
        this.physics.world.createCollider(
          RAPIER.ColliderDesc.cuboid(0.28, railH / 2, segLen / 2 + 0.05)
            .setFriction(0.95)
            .setRestitution(0.02),
          body
        )
      })
    }
  }

  private buildScenery(): void {
    this.buildTrees()
    this.buildBuildings()
    this.buildLampposts()
    this.buildMountains()
  }

  private buildTrees(): void {
    if (NatureAssets.hasTrees) {
      this.buildNatureScenery()
      return
    }
    this.buildProceduralTrees()
  }

  private buildNatureScenery(): void {
    const treeCount = 140
    const bushCount = 70
    const rockCount = 36
    const minDist = this.roadWidth / 2 + 7
    const maxDist = 85

    for (let i = 0; i < treeCount; i++) {
      const tree = NatureAssets.createTree(0.85 + Math.random() * 0.45)
      if (!tree) continue
      const t = (i / treeCount + Math.random() * 0.004) % 1
      const point = this.curve.getPointAt(t)
      const tangent = this.curve.getTangentAt(t).normalize()
      const right = new THREE.Vector3()
        .crossVectors(tangent, new THREE.Vector3(0, 1, 0))
        .normalize()
      const side = i % 2 === 0 ? 1 : -1
      const dist = minDist + Math.random() * (maxDist - minDist)
      const pos = point.clone().addScaledVector(right, side * dist)
      tree.position.set(pos.x, 0, pos.z)
      this.sceneryVisuals.add(tree)
    }

    for (let i = 0; i < bushCount; i++) {
      const bush = NatureAssets.createBush()
      if (!bush) continue
      const t = Math.random()
      const point = this.curve.getPointAt(t)
      const tangent = this.curve.getTangentAt(t).normalize()
      const right = new THREE.Vector3()
        .crossVectors(tangent, new THREE.Vector3(0, 1, 0))
        .normalize()
      const side = Math.random() > 0.5 ? 1 : -1
      const dist = this.roadWidth / 2 + 4 + Math.random() * 20
      const pos = point.clone().addScaledVector(right, side * dist)
      bush.position.set(pos.x, 0, pos.z)
      this.sceneryVisuals.add(bush)
    }

    for (let i = 0; i < rockCount; i++) {
      const rock = NatureAssets.createRock()
      if (!rock) continue
      const t = Math.random()
      const point = this.curve.getPointAt(t)
      const tangent = this.curve.getTangentAt(t).normalize()
      const right = new THREE.Vector3()
        .crossVectors(tangent, new THREE.Vector3(0, 1, 0))
        .normalize()
      const side = Math.random() > 0.5 ? 1 : -1
      const dist = this.roadWidth / 2 + 5 + Math.random() * 30
      const pos = point.clone().addScaledVector(right, side * dist)
      rock.position.set(pos.x, 0, pos.z)
      this.sceneryVisuals.add(rock)
    }
  }

  private buildProceduralTrees(): void {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.95 })
    const leafMats = [
      new THREE.MeshStandardMaterial({ color: 0x2f6b32, roughness: 0.88 }),
      new THREE.MeshStandardMaterial({ color: 0x3d7a3a, roughness: 0.88 }),
      new THREE.MeshStandardMaterial({ color: 0x1f5a28, roughness: 0.9 }),
    ]
    const treeCount = 160
    const minDist = this.roadWidth / 2 + 6
    const maxDist = 90

    for (let i = 0; i < treeCount; i++) {
      const t = i / treeCount
      const point = this.curve.getPointAt(t)
      const tangent = this.curve.getTangentAt(t).normalize()
      const right = new THREE.Vector3()
        .crossVectors(tangent, new THREE.Vector3(0, 1, 0))
        .normalize()

      const side = i % 2 === 0 ? 1 : -1
      const dist = minDist + Math.random() * (maxDist - minDist)
      const pos = point.clone().addScaledVector(right, side * dist)
      const scale = 0.85 + Math.random() * 1.15
      const leafMat = leafMats[Math.floor(Math.random() * leafMats.length)]
      const deciduous = i % 3 !== 0

      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14 * scale, 0.24 * scale, deciduous ? 2.8 * scale : 2.4 * scale, 8),
        trunkMat
      )
      trunk.position.set(pos.x, (deciduous ? 1.4 : 1.2) * scale, pos.z)
      trunk.castShadow = true
      this.sceneryVisuals.add(trunk)

      if (deciduous) {
        for (let c = 0; c < 3; c++) {
          const canopy = new THREE.Mesh(
            new THREE.IcosahedronGeometry((1.1 + c * 0.15) * scale, 1),
            leafMat
          )
          canopy.position.set(
            pos.x + (c - 1) * 0.35 * scale,
            (3.2 + c * 0.45) * scale,
            pos.z + ((c % 2) - 0.5) * 0.3 * scale
          )
          canopy.castShadow = true
          this.sceneryVisuals.add(canopy)
        }
      } else {
        for (let layer = 0; layer < 4; layer++) {
          const cone = new THREE.Mesh(
            new THREE.ConeGeometry(
              (1.55 - layer * 0.26) * scale,
              (1.2 + layer * 0.12) * scale,
              10
            ),
            leafMat
          )
          cone.position.set(pos.x, (2.4 + layer * 0.9) * scale, pos.z)
          cone.castShadow = true
          this.sceneryVisuals.add(cone)
        }
      }
    }
  }

  private buildBuildings(): void {
    const brickMat = new THREE.MeshStandardMaterial({
      map: this.brickTexture,
      normalMap: this.brickNormal,
      normalScale: new THREE.Vector2(1.1, 1.1),
      roughnessMap: this.brickRough,
      roughness: 1,
      metalness: 0,
    })
    const concreteMat = new THREE.MeshStandardMaterial({
      map: this.concreteTexture,
      normalMap: this.concreteNormal,
      normalScale: new THREE.Vector2(1.0, 1.0),
      roughnessMap: this.concreteRough,
      roughness: 1,
      metalness: 0.05,
    })
    const plasterMats = [
      new THREE.MeshStandardMaterial({ color: 0xc4b49a, roughness: 0.82 }),
      new THREE.MeshStandardMaterial({ color: 0xb5a48a, roughness: 0.8 }),
      new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.85 }),
    ]
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x5c2e22, roughness: 0.88, metalness: 0.05 })
    const count = 38

    for (let i = 0; i < count; i++) {
      const t = (i / count + 0.05) % 1
      const point = this.curve.getPointAt(t)
      const tangent = this.curve.getTangentAt(t).normalize()
      const right = new THREE.Vector3()
        .crossVectors(tangent, new THREE.Vector3(0, 1, 0))
        .normalize()

      const side = i % 2 === 0 ? 1 : -1
      const dist = 48 + Math.random() * 40
      const pos = point.clone().addScaledVector(right, side * dist)

      const w = 8 + Math.random() * 16
      const h = 5 + Math.random() * 18
      const d = 7 + Math.random() * 14
      const style = i % 3
      const mat = style === 0 ? brickMat : style === 1 ? concreteMat : plasterMats[i % plasterMats.length]

      const building = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
      building.position.set(pos.x, h / 2, pos.z)
      building.castShadow = true
      building.receiveShadow = true
      this.sceneryVisuals.add(building)

      if (style !== 1 || Math.random() > 0.4) {
        const roof = new THREE.Mesh(
          new THREE.ConeGeometry(Math.max(w, d) * 0.7, h * 0.22, 4),
          roofMat
        )
        roof.position.set(pos.x, h + h * 0.1, pos.z)
        roof.rotation.y = Math.PI / 4
        roof.castShadow = true
        this.sceneryVisuals.add(roof)
      }

      const winMat = new THREE.MeshStandardMaterial({
        color: 0x88aacc,
        roughness: 0.12,
        metalness: 0.4,
        emissive: 0x1a2840,
        emissiveIntensity: 0.25,
      })
      const floors = Math.max(1, Math.floor(h / 3.2))
      for (let f = 0; f < floors; f++) {
        for (let ww = -1; ww <= 1; ww++) {
          if (Math.random() < 0.2) continue
          const win = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.5), winMat)
          const ang = Math.atan2(right.x * side, right.z * side)
          win.rotation.y = ang
          win.position.set(
            pos.x + Math.sin(ang) * (d / 2 + 0.03),
            2.2 + f * 3.1,
            pos.z + Math.cos(ang) * (d / 2 + 0.03)
          )
          this.sceneryVisuals.add(win)
        }
      }
    }
  }

  private buildLampposts(): void {
    const poleMat = new THREE.MeshStandardMaterial({
      color: 0x6a6e74,
      metalness: 0.85,
      roughness: 0.28,
    })
    const lightMat = new THREE.MeshStandardMaterial({
      color: 0xfff2cc,
      emissive: 0xffe8a0,
      emissiveIntensity: 1.1,
    })
    const count = 70

    for (let i = 0; i < count; i++) {
      const t = i / count
      const point = this.curve.getPointAt(t)
      const tangent = this.curve.getTangentAt(t).normalize()
      const right = new THREE.Vector3()
        .crossVectors(tangent, new THREE.Vector3(0, 1, 0))
        .normalize()
      const side = i % 2 === 0 ? 1 : -1
      const pos = point.clone().addScaledVector(right, side * (this.roadWidth / 2 + 2.2))
      const angle = Math.atan2(tangent.x, tangent.z)

      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.09, 6.2, 8),
        poleMat
      )
      pole.position.set(pos.x, 3.1, pos.z)
      pole.castShadow = true
      this.sceneryVisuals.add(pole)

      const arm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.045, 1.6, 6),
        poleMat
      )
      arm.rotation.z = Math.PI / 2
      arm.position.set(
        pos.x - Math.sin(angle) * side * 0.75,
        6.1,
        pos.z - Math.cos(angle) * side * 0.75
      )
      this.sceneryVisuals.add(arm)

      const light = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), lightMat)
      light.position.set(
        pos.x - Math.sin(angle) * side * 1.4,
        5.95,
        pos.z - Math.cos(angle) * side * 1.4
      )
      this.sceneryVisuals.add(light)
    }
  }

  private buildMountains(): void {
    const mountainMat = new THREE.MeshStandardMaterial({
      color: 0x6a7684,
      roughness: 1.0,
      flatShading: false,
    })
    const snowMat = new THREE.MeshStandardMaterial({ color: 0xeef2f8, roughness: 0.95 })

    const positions = [
      new THREE.Vector3(-380, 0, -220),
      new THREE.Vector3(520, 0, -320),
      new THREE.Vector3(-420, 0, 320),
      new THREE.Vector3(480, 0, 220),
      new THREE.Vector3(40, 0, -540),
      new THREE.Vector3(-200, 0, 480),
    ]

    positions.forEach((pos) => {
      const h = 90 + Math.random() * 90
      const r = 70 + Math.random() * 50
      // Soft low-poly hills rather than sharp pyramids
      const mountain = new THREE.Mesh(new THREE.ConeGeometry(r, h, 16), mountainMat)
      mountain.position.set(pos.x, h / 2 - 8, pos.z)
      mountain.scale.set(1.15, 1, 0.85 + Math.random() * 0.3)
      this.mesh.add(mountain)
      const snow = new THREE.Mesh(new THREE.ConeGeometry(r * 0.28, h * 0.22, 12), snowMat)
      snow.position.set(pos.x, h * 0.88 - 8, pos.z)
      this.mesh.add(snow)
    })
  }

  private buildStartFinish(): void {
    const startPoint = this.curve.getPointAt(0)
    const tangent = this.curve.getTangentAt(0).normalize()
    const right = new THREE.Vector3()
      .crossVectors(tangent, new THREE.Vector3(0, 1, 0))
      .normalize()
    const angle = Math.atan2(tangent.x, tangent.z)
    // Above PseudoRoad asphalt (~0.085) so the stripe stays visible
    const stripeY = 0.14

    // Checkered finish stripe across the road
    for (let i = 0; i < 10; i++) {
      for (let row = 0; row < 3; row++) {
        const mat = new THREE.MeshBasicMaterial({
          color: (i + row) % 2 === 0 ? 0x0a0a0a : 0xf7f7f0,
          depthWrite: true,
        })
        const tile = new THREE.Mesh(
          new THREE.PlaneGeometry(this.roadWidth / 10, 1.1),
          mat
        )
        tile.rotation.x = -Math.PI / 2
        tile.rotation.z = angle
        const offset = right.clone().multiplyScalar(
          -this.roadWidth / 2 + (i + 0.5) * (this.roadWidth / 10)
        )
        const fwd = tangent.clone().multiplyScalar(row * 1.1 - 1.1)
        tile.position.set(
          startPoint.x + offset.x + fwd.x,
          stripeY,
          startPoint.z + offset.z + fwd.z
        )
        tile.renderOrder = 2
        this.mesh.add(tile)
      }
    }

    // Gantry poles outside the roadway
    const poleMat = new THREE.MeshStandardMaterial({
      color: 0x2a2d32,
      metalness: 0.75,
      roughness: 0.35,
    })
    ;[-1, 1].forEach((side) => {
      const polePos = startPoint.clone().addScaledVector(right, side * (this.roadWidth / 2 + 3.2))
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 9.5, 10), poleMat)
      pole.position.set(polePos.x, 4.75, polePos.z)
      pole.castShadow = true
      this.mesh.add(pole)
    })

    // Checkered banner as a thick box so it reads from any approach angle
    const bannerTex = this.makeCheckeredFlagTexture()
    const bannerMat = new THREE.MeshBasicMaterial({
      map: bannerTex,
      side: THREE.DoubleSide,
    })
    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(this.roadWidth + 5.5, 1.8, 0.35),
      [
        bannerMat, bannerMat, // +x -x
        new THREE.MeshBasicMaterial({ color: 0xb01010 }), // +y
        new THREE.MeshBasicMaterial({ color: 0x222222 }), // -y
        bannerMat, bannerMat, // +z -z
      ]
    )
    banner.position.set(startPoint.x, 8.4, startPoint.z)
    banner.rotation.y = Math.atan2(-tangent.x, -tangent.z)
    banner.renderOrder = 5
    this.mesh.add(banner)

    // Vertical flags on each side (classic start/finish markers)
    ;[-1, 1].forEach((side, idx) => {
      const base = startPoint.clone().addScaledVector(right, side * (this.roadWidth / 2 + 2.4))
      const flagPole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.08, 5.5, 8),
        poleMat
      )
      flagPole.position.set(base.x, 2.75, base.z)
      this.mesh.add(flagPole)

      const flag = new THREE.Mesh(
        new THREE.BoxGeometry(1.7, 1.2, 0.08),
        bannerMat
      )
      flag.position.set(
        base.x + right.x * side * 0.85,
        4.6,
        base.z + right.z * side * 0.85
      )
      flag.rotation.y = Math.atan2(-tangent.x, -tangent.z) + (idx === 0 ? 0.2 : -0.2)
      flag.renderOrder = 5
      this.mesh.add(flag)
    })
  }

  private makeCheckeredFlagTexture(): THREE.CanvasTexture {
    const size = 128
    const canvas = document.createElement('canvas')
    canvas.width = size * 2
    canvas.height = size
    const ctx = canvas.getContext('2d')!
    const cols = 8
    const rows = 4
    const cw = canvas.width / cols
    const rh = canvas.height / rows
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#111111' : '#f5f5f0'
        ctx.fillRect(x * cw, y * rh, cw + 1, rh + 1)
      }
    }
    // Red "LAP" bar so it reads at distance
    ctx.fillStyle = '#c01010'
    ctx.fillRect(0, canvas.height * 0.38, canvas.width, canvas.height * 0.24)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 28px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('FINISH', canvas.width / 2, canvas.height / 2)

    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    tex.needsUpdate = true
    return tex
  }

  getStartDirection(): number {
    const tangent = this.curve.getTangentAt(0).normalize()
    return Math.atan2(-tangent.x, -tangent.z)
  }

  getCurve(): THREE.CatmullRomCurve3 {
    return this.curve
  }

  isNearStart(position: THREE.Vector3, threshold: number = 14): boolean {
    const start = this.curve.getPointAt(0)
    const dist = new THREE.Vector3(position.x, 0, position.z)
      .distanceTo(new THREE.Vector3(start.x, 0, start.z))
    return dist < threshold
  }

  getClosestT(position: THREE.Vector3, samples: number = 360): number {
    let closestT = 0
    let closestDist = Infinity
    for (let i = 0; i < samples; i++) {
      const t = i / samples
      const p = this.curve.getPointAt(t)
      const dx = position.x - p.x
      const dz = position.z - p.z
      const d = dx * dx + dz * dz
      if (d < closestDist) {
        closestDist = d
        closestT = t
      }
    }

    // Local refinement around the coarse sample
    const span = 1 / samples
    for (let i = 0; i <= 24; i++) {
      const t = ((closestT - span / 2 + (span * i) / 24) % 1 + 1) % 1
      const p = this.curve.getPointAt(t)
      const dx = position.x - p.x
      const dz = position.z - p.z
      const d = dx * dx + dz * dz
      if (d < closestDist) {
        closestDist = d
        closestT = t
      }
    }
    return closestT
  }

  /**
   * Monotonic race progress. Never jumps backward around corners — that was
   * flipping P1 → P3 when the outside line matched an earlier curve sample.
   */
  getRaceT(position: THREE.Vector3, prevT: number): number {
    // Tiny behind allowance for sample noise; most of the window is forward
    const windowBehind = 0.012
    const windowAhead = 0.1
    let bestT = prevT
    let bestDist = Infinity

    const steps = 80
    for (let i = 0; i <= steps; i++) {
      const u = i / steps
      const t = ((prevT - windowBehind + (windowBehind + windowAhead) * u) % 1 + 1) % 1
      const p = this.curve.getPointAt(t)
      const dx = position.x - p.x
      const dz = position.z - p.z
      const d = dx * dx + dz * dz
      if (d < bestDist) {
        bestDist = d
        bestT = t
      }
    }

    const span = (windowBehind + windowAhead) / steps
    for (let i = 0; i <= 16; i++) {
      const t = ((bestT - span + (span * 2 * i) / 16) % 1 + 1) % 1
      const p = this.curve.getPointAt(t)
      const dx = position.x - p.x
      const dz = position.z - p.z
      const d = dx * dx + dz * dz
      if (d < bestDist) {
        bestDist = d
        bestT = t
      }
    }

    // Hard reject large backward jumps (unless legitimate finish-line wrap)
    const wrappedFinish = prevT > 0.88 && bestT < 0.12
    const backDelta = (prevT - bestT + 1) % 1
    if (!wrappedFinish && backDelta > 0.02 && backDelta < 0.5) {
      bestT = prevT
    }

    // Global closest only for teleport/respawn recovery — never if it rewinds progress
    const global = this.getClosestT(position, 280)
    const gp = this.curve.getPointAt(global)
    const gDist =
      (position.x - gp.x) * (position.x - gp.x) +
      (position.z - gp.z) * (position.z - gp.z)
    if (gDist + 25 < bestDist) {
      const gBack = (prevT - global + 1) % 1
      const gWrap = prevT > 0.88 && global < 0.12
      if (gWrap || gBack <= 0.03 || gBack > 0.5) return global
    }

    return bestT
  }

  /** Signed travel along the track: +1 with race direction, −1 reverse. */
  getAlongTrackDot(position: THREE.Vector3, heading: number, t?: number): number {
    const tt = t ?? this.getClosestT(position)
    const tangent = this.curve.getTangentAt(tt).normalize()
    const fx = -Math.sin(heading)
    const fz = -Math.cos(heading)
    return fx * tangent.x + fz * tangent.z
  }

  /**
   * Keep bikes on asphalt by clamping lateral drift only.
   * Always pass hintT (race progress) — global closestT snaps wide lines
   * onto the wrong curve segment after turns.
   */
  constrainToRoad(
    position: THREE.Vector3,
    maxLateral: number = this.roadWidth / 2 - 1.1,
    hintT?: number
  ): { position: THREE.Vector3; heading: number; lateral: number; t: number } {
    // Use the caller's race T directly — never re-run global closest here
    const t = hintT !== undefined ? ((hintT % 1) + 1) % 1 : this.getClosestT(position)
    const point = this.curve.getPointAt(t)
    const tangent = this.curve.getTangentAt(t).normalize()
    const right = new THREE.Vector3()
      .crossVectors(tangent, new THREE.Vector3(0, 1, 0))
      .normalize()

    const offset = new THREE.Vector3(position.x - point.x, 0, position.z - point.z)
    const lateral = offset.dot(right)
    const along = offset.dot(tangent)
    const heading = Math.atan2(-tangent.x, -tangent.z)

    if (Math.abs(lateral) <= maxLateral) {
      return {
        position: new THREE.Vector3(position.x, RIDE_HEIGHT, position.z),
        heading,
        lateral,
        t,
      }
    }

    // Off road — push back to the edge, keep along-track progress
    const clampedLateral = Math.max(-maxLateral, Math.min(maxLateral, lateral))
    const constrained = point.clone()
      .addScaledVector(right, clampedLateral)
      .addScaledVector(tangent, along)
    constrained.y = RIDE_HEIGHT
    return { position: constrained, heading, lateral: clampedLateral, t }
  }

  /** Grid slots for player + up to 7 rivals (2 columns × 4 rows). */
  getStartPositions(count: number = 8): THREE.Vector3[] {
    const p = this.curve.getPointAt(0)
    const tangent = this.curve.getTangentAt(0).normalize()
    const right = new THREE.Vector3()
      .crossVectors(tangent, new THREE.Vector3(0, 1, 0))
      .normalize()
    const back = tangent.clone().negate()

    const slots: THREE.Vector3[] = []
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / 2)
      const col = i % 2 === 0 ? -1 : 1
      slots.push(
        p
          .clone()
          .addScaledVector(right, col * 3.5)
          .addScaledVector(back, 10 + row * 9)
          .setY(RIDE_HEIGHT)
      )
    }
    return slots
  }
}

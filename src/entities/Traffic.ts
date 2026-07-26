import * as THREE from 'three'
import { Physics } from '@core/Physics'
import { Track } from '@entities/Track'
import { VehicleAssets } from '@entities/VehicleAssets'

const TRAFFIC_COLORS = [
  0xffffff, 0x888888, 0x1a1aff, 0xffcc00, 0x00aa44, 0xff6600, 0xcc3333, 0x222222,
]
/** Road surface — GLTF cars are grounded at local y=0 */
const TRAFFIC_RIDE_Y = 0.06
/** Minimum gap along the curve between cars in the same direction (meters) */
const MIN_SAME_DIR_GAP = 14

export interface TrafficCarInfo {
  position: THREE.Vector3
  heading: number
  isOncoming: boolean
}

interface TrafficCar {
  mesh: THREE.Group
  body: ReturnType<Physics['createBoxBody']>
  isOncoming: boolean
  active: boolean
  targetSpeed: number
  t: number
  laneOffset: number
  heading: number
}

export class Traffic {
  private pool: TrafficCar[] = []
  private scene: THREE.Scene
  private physics: Physics
  private track: Track
  private envMap?: THREE.Texture
  private readonly poolSize = 14
  private spawnTimer: number = 0
  private readonly spawnInterval = 2.2
  private readonly spawnDelay = 2.5
  private elapsed: number = 0
  private readonly despawnT = 0.14
  private readonly up = new THREE.Vector3(0, 1, 0)

  constructor(
    scene: THREE.Scene,
    physics: Physics,
    track: Track,
    envMap?: THREE.Texture
  ) {
    this.scene = scene
    this.physics = physics
    this.track = track
    this.envMap = envMap
    this.buildPool()
  }

  private buildPool(): void {
    for (let i = 0; i < this.poolSize; i++) {
      const color = TRAFFIC_COLORS[Math.floor(Math.random() * TRAFFIC_COLORS.length)]
      const mesh = this.buildMesh(color)
      mesh.visible = false
      this.scene.add(mesh)

      const body = this.physics.createBoxBody(
        1.8, 0.7, 3.8,
        { x: 0, y: -200, z: 0 },
        40,
        { sensor: true }
      )

      this.pool.push({
        mesh,
        body,
        isOncoming: i % 2 === 0,
        active: false,
        targetSpeed: 0,
        t: 0,
        laneOffset: 0,
        heading: 0,
      })
    }
  }

  private buildMesh(color: number): THREE.Group {
    const gltf = VehicleAssets.createCar(color, this.envMap)
    if (gltf) return gltf
    return this.buildProceduralMesh(color)
  }

  private buildProceduralMesh(color: number): THREE.Group {
    const group = new THREE.Group()
    group.userData.vehicleKind = 'procedural'
    // Windshield is on −Z; lookAt aims +Z along travel → flip
    group.userData.yawOffset = Math.PI

    const bodyMat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.45,
      metalness: 0.35,
    })
    const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 3.8), bodyMat)
    bodyMesh.position.y = 0.45
    bodyMesh.castShadow = true
    bodyMesh.receiveShadow = true
    group.add(bodyMesh)

    const cabinMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color).multiplyScalar(0.55).getHex(),
      roughness: 0.35,
      metalness: 0.4,
    })
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.48, 1.9), cabinMat)
    cabin.position.set(0, 0.88, -0.15)
    cabin.castShadow = true
    group.add(cabin)

    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x88aacc,
      roughness: 0.1,
      metalness: 0.2,
      transparent: true,
      opacity: 0.55,
    })
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, 0.08), glassMat)
    windshield.position.set(0, 1.0, -1.05)
    windshield.rotation.x = -0.35
    group.add(windshield)

    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 })
    ;[
      { x: -0.85, z: 1.25 },
      { x: 0.85, z: 1.25 },
      { x: -0.85, z: -1.25 },
      { x: 0.85, z: -1.25 },
    ].forEach(({ x, z }) => {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.32, 0.28, 14),
        wheelMat
      )
      wheel.position.set(x, 0.32, z)
      wheel.rotation.z = Math.PI / 2
      wheel.castShadow = true
      group.add(wheel)
    })

    return group
  }

  private getInactive(): TrafficCar | null {
    return this.pool.find(c => !c.active) ?? null
  }

  private wrapT(t: number): number {
    return ((t % 1) + 1) % 1
  }

  private shortestTDelta(from: number, to: number): number {
    let d = to - from
    if (d > 0.5) d -= 1
    if (d < -0.5) d += 1
    return d
  }

  private placeOnCurve(car: TrafficCar): void {
    const curve = this.track.getCurve()
    const point = curve.getPointAt(car.t)
    const tangent = curve.getTangentAt(car.t).normalize()
    const right = new THREE.Vector3().crossVectors(tangent, this.up).normalize()

    const pos = point.clone().addScaledVector(right, car.laneOffset)
    pos.y = TRAFFIC_RIDE_Y

    const travel = car.isOncoming ? tangent.clone().negate() : tangent.clone()
    const angle = Math.atan2(-travel.x, -travel.z)
    car.heading = angle

    car.body.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true)
    car.body.setRotation({
      x: 0,
      y: Math.sin(angle / 2),
      z: 0,
      w: Math.cos(angle / 2),
    }, true)
    car.body.setLinvel({
      x: travel.x * car.targetSpeed,
      y: 0,
      z: travel.z * car.targetSpeed,
    }, true)
    car.body.setAngvel({ x: 0, y: 0, z: 0 }, true)

    car.mesh.position.copy(pos)
    // IMPORTANT: Object3D.lookAt (non-camera) aims local +Z at the target — not −Z.
    // So this lines travel up with +Z. Per-model nose is baked in VehicleAssets pivot yaw.
    const look = pos.clone().addScaledVector(travel, 4)
    car.mesh.lookAt(look.x, look.y, look.z)
    const yawOffset = (car.mesh.userData.yawOffset as number | undefined) ?? 0
    if (yawOffset !== 0) car.mesh.rotateY(yawOffset)
  }

  private laneBusy(t: number, isOncoming: boolean, curveLen: number): boolean {
    const minDelta = MIN_SAME_DIR_GAP * (curveLen > 0 ? 1 / curveLen : 0.001)
    for (const other of this.pool) {
      if (!other.active || other.isOncoming !== isOncoming) continue
      if (Math.abs(this.shortestTDelta(t, other.t)) < minDelta) return true
    }
    return false
  }

  private spawn(playerT: number, curveLen: number): void {
    const car = this.getInactive()
    if (!car) return

    // Strict lane split: oncoming left of center, same-direction right
    car.isOncoming = Math.random() > 0.45
    const ahead = 0.07 + Math.random() * 0.1
    car.t = this.wrapT(playerT + ahead)

    if (this.laneBusy(car.t, car.isOncoming, curveLen)) return

    const half = this.track.roadHalfWidth
    const laneBase = Math.min(5.2, half - 2.4)
    if (car.isOncoming) {
      car.laneOffset = -(laneBase + Math.random() * 0.8)
    } else {
      car.laneOffset = laneBase + Math.random() * 0.8
    }

    car.targetSpeed = car.isOncoming
      ? 12 + Math.random() * 8
      : 8 + Math.random() * 10

    this.placeOnCurve(car)
    car.mesh.visible = true
    car.active = true
  }

  private deactivate(car: TrafficCar): void {
    car.body.setTranslation({ x: 0, y: -200, z: 0 }, true)
    car.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    car.mesh.visible = false
    car.active = false
  }

  /** Keep same-direction cars from occupying the same stretch. */
  private separateTraffic(curveLen: number, metersToT: number): void {
    const active = this.pool.filter(c => c.active)
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i]
        const b = active[j]
        if (a.isOncoming !== b.isOncoming) continue

        const gapT = Math.abs(this.shortestTDelta(a.t, b.t))
        const gapM = gapT * curveLen
        if (gapM >= MIN_SAME_DIR_GAP) continue

        // Push the trailing car (relative to travel direction) backward
        const travelSign = a.isOncoming ? -1 : 1
        const aAhead = this.shortestTDelta(b.t, a.t) * travelSign > 0
        const trailing = aAhead ? b : a
        const push = (MIN_SAME_DIR_GAP - gapM) * metersToT * 0.55
        trailing.t = this.wrapT(trailing.t - travelSign * push)
        trailing.targetSpeed = Math.min(trailing.targetSpeed, 6)
      }
    }
  }

  update(playerPosition: THREE.Vector3, deltaTime: number): void {
    this.elapsed += deltaTime
    const playerT = this.track.getClosestT(playerPosition)
    const curve = this.track.getCurve()
    const curveLen = curve.getLength()
    const metersToT = curveLen > 0 ? 1 / curveLen : 0.001

    if (this.elapsed >= this.spawnDelay) {
      this.spawnTimer += deltaTime
      if (this.spawnTimer >= this.spawnInterval) {
        this.spawnTimer = 0
        this.spawn(playerT, curveLen)
      }
    }

    this.pool.forEach((car) => {
      if (!car.active) return

      const dir = car.isOncoming ? -1 : 1
      car.t = this.wrapT(car.t + dir * car.targetSpeed * metersToT * deltaTime)
    })

    this.separateTraffic(curveLen, metersToT)

    this.pool.forEach((car) => {
      if (!car.active) return
      this.placeOnCurve(car)

      const pos = car.body.translation()
      if (pos.y < -5) {
        this.deactivate(car)
        return
      }

      const delta = Math.abs(this.shortestTDelta(playerT, car.t))
      if (delta > this.despawnT) this.deactivate(car)
    })
  }

  getActivePositions(): THREE.Vector3[] {
    return this.getActiveCars().map(c => c.position.clone())
  }

  getActiveCars(): TrafficCarInfo[] {
    const out: TrafficCarInfo[] = []
    for (const car of this.pool) {
      if (!car.active) continue
      const p = car.body.translation()
      out.push({
        position: new THREE.Vector3(p.x, p.y, p.z),
        heading: car.heading,
        isOncoming: car.isOncoming,
      })
    }
    return out
  }

  dispose(): void {
    this.pool.forEach(car => this.scene.remove(car.mesh))
    this.pool = []
  }
}

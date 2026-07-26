import * as THREE from 'three'
import { VehicleAssets } from '@entities/VehicleAssets'
import { ROAD_SURFACE_Y } from '@entities/Track'

/**
 * Lit 3D bike + rider — GLB chassis with lean, wheel spin, and combat poses.
 * Replaces camera-facing sprites so racers share lighting with the world.
 */
export class BikeModel {
  public group: THREE.Group
  private frontWheelGroup: THREE.Group | null = null
  private rearWheelGroup: THREE.Group | null = null
  private steerGroup: THREE.Group | null = null
  private riderGroup: THREE.Group | null = null
  private rightArm: THREE.Group | null = null
  private punchStick: THREE.Mesh | null = null
  private visualRoot!: THREE.Group
  private wheelMeshes: THREE.Object3D[] = []

  private leanAngle = 0
  private wheelRotation = 0
  private readonly wheelRadius = 0.34
  private attackTimer = 0
  private attackSide = 0
  private attackKind: 'punch' | 'kick' | null = null
  private usingGltf = false
  private riderBasePos = new THREE.Vector3()
  private localMinY = 0

  constructor(color: number, envMap?: THREE.Texture) {
    this.group = new THREE.Group()
    const gltf = VehicleAssets.createBike(color, envMap)

    if (gltf) {
      this.usingGltf = true
      this.visualRoot = new THREE.Group()
      this.visualRoot.add(gltf)
      this.group.add(this.visualRoot)
      this.collectWheels(gltf)
      this.riderGroup = this.buildRider(color, envMap)
      this.visualRoot.add(this.riderGroup)
      this.seatRiderOnBike(gltf)
      this.riderBasePos.copy(this.riderGroup.position)
    } else {
      this.usingGltf = false
      this.visualRoot = this.group
      this.buildProcedural(color, envMap)
      if (this.riderGroup) this.riderBasePos.copy(this.riderGroup.position)
    }

    const box = new THREE.Box3().setFromObject(this.group)
    this.localMinY = Number.isFinite(box.min.y) ? box.min.y : 0
  }

  getMeshYOffset(rideHeight: number): number {
    return ROAD_SURFACE_Y - rideHeight - this.localMinY
  }

  private collectWheels(root: THREE.Object3D): void {
    root.traverse((obj) => {
      const n = obj.name.toLowerCase()
      if (n.includes('wheel') || n.includes('tire') || n.includes('tyre')) {
        this.wheelMeshes.push(obj)
      }
    })
  }

  private seatRiderOnBike(bike: THREE.Object3D): void {
    if (!this.riderGroup) return
    const box = new THREE.Box3().setFromObject(bike)
    const size = box.getSize(new THREE.Vector3())
    // Sit the rider on the seat area (rear half, mid height of bike)
    this.riderGroup.position.set(0, box.min.y + size.y * 0.52, box.min.z + size.z * 0.55)
    this.riderGroup.scale.setScalar(0.92)
  }

  private mat(
    color: number,
    metalness: number,
    roughness: number,
    envMap?: THREE.Texture
  ): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color,
      metalness,
      roughness,
      envMap: envMap ?? null,
      envMapIntensity: 1.0,
    })
  }

  private buildRider(color: number, envMap?: THREE.Texture): THREE.Group {
    const rider = new THREE.Group()
    const suit = this.mat(0x1a1a1e, 0.08, 0.82)
    const accent = this.mat(color, 0.35, 0.38, envMap)
    const helmet = this.mat(color, 0.4, 0.22, envMap)
    const boot = this.mat(0x0c0c0e, 0.05, 0.9)

    const hips = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.28), suit)
    hips.position.set(0, 0.12, 0.02)
    hips.castShadow = true
    rider.add(hips)

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.32, 4, 10), suit)
    torso.position.set(0, 0.42, -0.02)
    torso.rotation.x = -0.55
    torso.castShadow = true
    rider.add(torso)

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.36, 0.04), accent)
    stripe.position.set(0, 0.44, -0.16)
    stripe.rotation.x = -0.55
    rider.add(stripe)

    ;[-1, 1].forEach((side) => {
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.22, 3, 8), suit)
      thigh.position.set(side * 0.12, 0.02, 0.08)
      thigh.rotation.x = 0.85
      thigh.castShadow = true
      rider.add(thigh)

      const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.2, 3, 8), suit)
      shin.position.set(side * 0.14, -0.18, 0.22)
      shin.rotation.x = -0.35
      rider.add(shin)

      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.18), boot)
      foot.position.set(side * 0.14, -0.32, 0.28)
      rider.add(foot)

      const armPivot = new THREE.Group()
      armPivot.position.set(side * 0.22, 0.48, -0.18)
      armPivot.rotation.x = -1.1
      armPivot.rotation.z = side * 0.35

      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.28, 3, 8), suit)
      arm.position.set(0, -0.14, 0)
      arm.castShadow = true
      armPivot.add(arm)

      if (side === 1) {
        this.rightArm = armPivot
        // Club / pipe for Road Rash punch swings
        const stickMat = new THREE.MeshStandardMaterial({
          color: 0x5c4033,
          metalness: 0.15,
          roughness: 0.7,
          envMap: envMap ?? null,
        })
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.032, 0.72, 8), stickMat)
        stick.position.set(0.05, -0.42, -0.05)
        stick.rotation.x = 0.35
        stick.rotation.z = -0.2
        stick.castShadow = true
        stick.visible = false
        armPivot.add(stick)
        this.punchStick = stick
      }

      rider.add(armPivot)
    })

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 14), helmet)
    head.position.set(0, 0.78, -0.18)
    head.castShadow = true
    rider.add(head)

    const visor = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.42),
      new THREE.MeshStandardMaterial({
        color: 0x66aadd,
        transparent: true,
        opacity: 0.45,
        roughness: 0.08,
        metalness: 0.35,
        envMap: envMap ?? null,
      })
    )
    visor.position.set(0, 0.76, -0.26)
    visor.rotation.x = 0.2
    rider.add(visor)

    return rider
  }

  private buildProcedural(color: number, envMap?: THREE.Texture): void {
    const chromeMat = this.mat(0xdddddd, 0.95, 0.12, envMap)
    const tireMat = this.mat(0x1a1a1a, 0.0, 0.95)
    const frameMat = this.mat(color, 0.35, 0.4, envMap)
    const leatherMat = this.mat(0x1a1a1a, 0.0, 0.7)

    this.rearWheelGroup = this.buildWheel(tireMat, chromeMat)
    this.rearWheelGroup.position.set(0, this.wheelRadius, 0.95)
    this.group.add(this.rearWheelGroup)

    this.steerGroup = new THREE.Group()
    this.steerGroup.position.set(0, 0, -0.95)
    this.group.add(this.steerGroup)

    this.frontWheelGroup = this.buildWheel(tireMat, chromeMat)
    this.frontWheelGroup.position.set(0, this.wheelRadius, 0)
    this.steerGroup.add(this.frontWheelGroup)

    const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.35, 6, 12), frameMat)
    tank.rotation.x = Math.PI / 2
    tank.position.set(0, 0.78, 0.05)
    tank.castShadow = true
    this.group.add(tank)

    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.07, 0.5), leatherMat)
    seat.position.set(0, 0.86, 0.4)
    this.group.add(seat)

    const engine = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.35, 0.48),
      this.mat(0x333333, 0.65, 0.45, envMap)
    )
    engine.position.set(0, 0.4, 0.1)
    engine.castShadow = true
    this.group.add(engine)

    ;[-0.1, 0.1].forEach((x) => {
      const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.7, 8), chromeMat)
      fork.position.set(x, 0.45, -0.1)
      fork.rotation.x = 0.18
      this.steerGroup!.add(fork)
    })

    const hbar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.58, 8), chromeMat)
    hbar.rotation.z = Math.PI / 2
    hbar.position.set(0, 0.95, -0.06)
    this.steerGroup!.add(hbar)

    this.riderGroup = this.buildRider(color, envMap)
    this.riderGroup.position.set(0, 0.75, 0.2)
    this.group.add(this.riderGroup)

    this.group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
  }

  private buildWheel(
    tireMat: THREE.MeshStandardMaterial,
    chromeMat: THREE.MeshStandardMaterial
  ): THREE.Group {
    const group = new THREE.Group()
    group.rotation.y = Math.PI / 2
    group.add(new THREE.Mesh(new THREE.TorusGeometry(this.wheelRadius, 0.085, 12, 28), tireMat))
    group.add(new THREE.Mesh(new THREE.TorusGeometry(this.wheelRadius * 0.72, 0.022, 8, 20), chromeMat))
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 12), chromeMat)
    hub.rotation.x = Math.PI / 2
    group.add(hub)
    return group
  }

  update(steerAngle: number, speed: number, deltaTime: number): void {
    const targetLean = -steerAngle * 20
    this.leanAngle += (targetLean - this.leanAngle) * 10 * deltaTime
    this.visualRoot.rotation.z = THREE.MathUtils.degToRad(this.leanAngle)

    this.wheelRotation += (speed / this.wheelRadius) * deltaTime
    if (this.frontWheelGroup) this.frontWheelGroup.rotation.x = this.wheelRotation
    if (this.rearWheelGroup) this.rearWheelGroup.rotation.x = this.wheelRotation
    for (const w of this.wheelMeshes) {
      w.rotation.x = this.wheelRotation
    }
    if (this.steerGroup) this.steerGroup.rotation.y = steerAngle * 0.65

    if (this.riderGroup) {
      const tuck = Math.min(Math.abs(speed) / 55, 0.35)
      this.riderGroup.rotation.x = tuck * (this.usingGltf ? 0.35 : 0.55)

      if (this.attackTimer > 0) {
        this.attackTimer -= deltaTime
        const t = Math.max(0, this.attackTimer / 0.32)
        const swing = Math.sin((1 - t) * Math.PI) * 1.05
        this.riderGroup.rotation.y = this.attackSide * swing * 0.5
        this.riderGroup.rotation.z = this.attackSide * swing * 0.3

        if (this.rightArm && this.attackKind === 'punch') {
          this.rightArm.rotation.x = -1.1 - swing * 1.4
          this.rightArm.rotation.y = -swing * 0.9
          this.rightArm.rotation.z = 0.35 + swing * 0.4
        }
        if (this.punchStick) {
          this.punchStick.visible = this.attackKind === 'punch'
        }
      } else {
        this.riderGroup.rotation.y = THREE.MathUtils.lerp(this.riderGroup.rotation.y, 0, 0.2)
        this.riderGroup.rotation.z = THREE.MathUtils.lerp(this.riderGroup.rotation.z, 0, 0.2)
        if (this.rightArm) {
          this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, -1.1, 0.2)
          this.rightArm.rotation.y = THREE.MathUtils.lerp(this.rightArm.rotation.y, 0, 0.2)
          this.rightArm.rotation.z = THREE.MathUtils.lerp(this.rightArm.rotation.z, 0.35, 0.2)
        }
        if (this.punchStick) this.punchStick.visible = false
        this.attackKind = null
      }
    }
  }

  setRagdoll(active: boolean): void {
    if (active) {
      this.visualRoot.rotation.set(0.25, 0.2, 1.2)
      if (this.riderGroup) {
        this.riderGroup.rotation.set(1.0, 0.4, 0.75)
        this.riderGroup.position.copy(this.riderBasePos)
        this.riderGroup.position.x += 0.4
        this.riderGroup.position.y -= 0.15
      }
      this.attackTimer = 0
      if (this.punchStick) this.punchStick.visible = false
      this.attackKind = null
    } else {
      this.visualRoot.rotation.set(0, 0, 0)
      if (this.riderGroup) {
        this.riderGroup.rotation.set(0, 0, 0)
        this.riderGroup.position.copy(this.riderBasePos)
      }
    }
  }

  playAttack(side: number, kind: 'punch' | 'kick' = 'punch'): void {
    this.attackTimer = 0.32
    this.attackSide = side
    this.attackKind = kind
    if (this.punchStick) this.punchStick.visible = kind === 'punch'
  }
}

import * as THREE from 'three'
import { VehicleAssets } from '@entities/VehicleAssets'

export class BikeModel {
  public group: THREE.Group
  private frontWheelGroup: THREE.Group | null = null
  private rearWheelGroup: THREE.Group | null = null
  private steerGroup: THREE.Group | null = null
  private riderGroup: THREE.Group | null = null
  private visualRoot!: THREE.Group

  private leanAngle: number = 0
  private wheelRotation: number = 0
  private readonly wheelRadius = 0.34
  private attackTimer: number = 0
  private attackSide: number = 0
  private readonly usingGltf: boolean

  constructor(color: number, envMap?: THREE.CubeTexture) {
    this.group = new THREE.Group()
    const gltf = VehicleAssets.createBike(color, envMap)
    if (gltf) {
      this.usingGltf = true
      this.visualRoot = gltf
      this.group.add(gltf)
      // Lightweight rider silhouette so Road Rash combat still reads
      this.riderGroup = this.buildRiderOverlay(color, envMap)
      this.group.add(this.riderGroup)
    } else {
      this.usingGltf = false
      this.visualRoot = this.group
      this.buildProcedural(color, envMap)
    }
  }

  private mat(
    color: number,
    metalness: number,
    roughness: number,
    envMap?: THREE.CubeTexture
  ): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color,
      metalness,
      roughness,
      envMap: envMap ?? null,
      envMapIntensity: 1.2,
    })
  }

  private buildRiderOverlay(color: number, envMap?: THREE.CubeTexture): THREE.Group {
    const rider = new THREE.Group()
    const suit = this.mat(0x1c1c1c, 0.05, 0.85)
    const accent = this.mat(color, 0.25, 0.4, envMap)
    const helmet = this.mat(color, 0.35, 0.25, envMap)

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.28, 4, 8), suit)
    torso.position.set(0, 1.05, 0.05)
    torso.rotation.x = -0.45
    torso.castShadow = true
    rider.add(torso)

    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.08), accent)
    chest.position.set(0, 1.12, -0.12)
    chest.rotation.x = -0.45
    rider.add(chest)

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 12), helmet)
    head.position.set(0, 1.42, -0.08)
    head.castShadow = true
    rider.add(head)

    const visor = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.45),
      new THREE.MeshStandardMaterial({
        color: 0x88ccff,
        transparent: true,
        opacity: 0.4,
        roughness: 0.1,
        metalness: 0.2,
        envMap: envMap ?? null,
      })
    )
    visor.position.set(0, 1.4, -0.16)
    visor.rotation.x = 0.25
    rider.add(visor)

    return rider
  }

  private buildProcedural(color: number, envMap?: THREE.CubeTexture): void {
    const chromeMat = this.mat(0xdddddd, 0.95, 0.05, envMap)
    const blackMat = this.mat(0x111111, 0.1, 0.8)
    const tireMat = this.mat(0x1a1a1a, 0.0, 0.95)
    const frameMat = this.mat(color, 0.3, 0.4, envMap)
    const darkFrameMat = this.mat(
      new THREE.Color(color).multiplyScalar(0.4).getHex(),
      0.4, 0.5, envMap
    )
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x88ccff,
      metalness: 0.1,
      roughness: 0.05,
      transparent: true,
      opacity: 0.45,
      envMap: envMap ?? null,
    })
    const exhaustMat = this.mat(0xaaaaaa, 0.9, 0.2, envMap)
    const riderMat = this.mat(0x222222, 0.05, 0.85)
    const helmetMat = this.mat(color, 0.2, 0.3, envMap)
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

    const swingarm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.025, 1.0, 8),
      chromeMat
    )
    swingarm.rotation.z = Math.PI / 2
    swingarm.rotation.y = Math.PI / 2
    swingarm.position.set(0, 0.36, 0.42)
    this.group.add(swingarm)

    const backbone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.9, 8),
      frameMat
    )
    backbone.rotation.x = Math.PI / 2
    backbone.position.set(0, 0.52, 0.0)
    this.group.add(backbone)

    ;[-0.12, 0.12].forEach((x) => {
      const spar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.022, 0.022, 0.72, 6),
        darkFrameMat
      )
      spar.rotation.x = 0.35
      spar.position.set(x, 0.55, 0.18)
      this.group.add(spar)
    })

    const engineBlock = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.38, 0.52),
      this.mat(0x333333, 0.6, 0.5, envMap)
    )
    engineBlock.position.set(0, 0.42, 0.12)
    engineBlock.castShadow = true
    this.group.add(engineBlock)

    const exhaustPipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.022, 1.1, 10),
      exhaustMat
    )
    exhaustPipe.rotation.z = Math.PI / 2
    exhaustPipe.position.set(0.22, 0.28, 0.38)
    this.group.add(exhaustPipe)

    const tankGeometry = new THREE.LatheGeometry(
      [
        new THREE.Vector2(0, -0.32),
        new THREE.Vector2(0.18, -0.18),
        new THREE.Vector2(0.22, 0),
        new THREE.Vector2(0.2, 0.18),
        new THREE.Vector2(0.14, 0.32),
        new THREE.Vector2(0.06, 0.38),
      ],
      16
    )
    const tank = new THREE.Mesh(tankGeometry, frameMat)
    tank.rotation.x = Math.PI / 2
    tank.position.set(0, 0.82, 0.08)
    tank.scale.set(1, 0.55, 1)
    tank.castShadow = true
    this.group.add(tank)

    const fairing = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.32, 0.38), frameMat)
    fairing.position.set(0, 0.78, -0.42)
    fairing.rotation.x = -0.15
    fairing.castShadow = true
    this.group.add(fairing)

    const belly = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.58), frameMat)
    belly.position.set(0, 0.28, -0.08)
    belly.castShadow = true
    this.group.add(belly)

    const windscreen = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.22), glassMat)
    windscreen.position.set(0, 0.96, -0.56)
    windscreen.rotation.x = -0.5
    this.group.add(windscreen)

    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.07, 0.54), leatherMat)
    seat.position.set(0, 0.88, 0.38)
    this.group.add(seat)

    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.32), frameMat)
    tail.position.set(0, 0.78, 0.72)
    tail.rotation.x = 0.2
    this.group.add(tail)

    ;[-0.1, 0.1].forEach((x) => {
      const fork = new THREE.Mesh(
        new THREE.CylinderGeometry(0.026, 0.022, 0.72, 8),
        chromeMat
      )
      fork.position.set(x, 0.46, -0.12)
      fork.rotation.x = 0.18
      this.steerGroup!.add(fork)
    })

    const hbar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 0.62, 8),
      chromeMat
    )
    hbar.rotation.z = Math.PI / 2
    hbar.position.set(0, 0.96, -0.08)
    this.steerGroup!.add(hbar)

    this.riderGroup = new THREE.Group()
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.48, 0.26), riderMat)
    torso.position.set(0, 1.26, 0.06)
    torso.rotation.x = -0.55
    torso.castShadow = true
    this.riderGroup.add(torso)

    const helmetGeo = new THREE.LatheGeometry(
      [
        new THREE.Vector2(0, -0.19),
        new THREE.Vector2(0.1, -0.17),
        new THREE.Vector2(0.18, -0.08),
        new THREE.Vector2(0.2, 0.02),
        new THREE.Vector2(0.19, 0.12),
        new THREE.Vector2(0.14, 0.19),
        new THREE.Vector2(0.06, 0.22),
        new THREE.Vector2(0, 0.22),
      ],
      20
    )
    const helmet = new THREE.Mesh(helmetGeo, helmetMat)
    helmet.position.set(0, 1.62, -0.06)
    helmet.castShadow = true
    this.riderGroup.add(helmet)
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

    const tire = new THREE.Mesh(
      new THREE.TorusGeometry(this.wheelRadius, 0.09, 12, 32),
      tireMat
    )
    group.add(tire)

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(this.wheelRadius * 0.72, 0.025, 8, 24),
      chromeMat
    )
    group.add(rim)

    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.08, 12),
      chromeMat
    )
    hub.rotation.x = Math.PI / 2
    group.add(hub)

    return group
  }

  update(steerAngle: number, speed: number, deltaTime: number): void {
    const targetLean = -steerAngle * 22
    this.leanAngle += (targetLean - this.leanAngle) * 10 * deltaTime
    this.visualRoot.rotation.z = THREE.MathUtils.degToRad(this.leanAngle)

    this.wheelRotation += (speed / this.wheelRadius) * deltaTime
    if (this.frontWheelGroup) this.frontWheelGroup.rotation.x = this.wheelRotation
    if (this.rearWheelGroup) this.rearWheelGroup.rotation.x = this.wheelRotation
    if (this.steerGroup) this.steerGroup.rotation.y = steerAngle * 0.7

    if (this.riderGroup) {
      const lean = Math.min(speed / 60, 0.38)
      this.riderGroup.rotation.x = this.usingGltf ? lean * 0.45 : lean

      if (this.attackTimer > 0) {
        this.attackTimer -= deltaTime
        const t = Math.max(0, this.attackTimer / 0.28)
        const swing = Math.sin((1 - t) * Math.PI) * 1.1
        this.riderGroup.rotation.y = this.attackSide * swing * 0.55
        this.riderGroup.rotation.z = this.attackSide * swing * 0.35
      } else {
        this.riderGroup.rotation.y = 0
        this.riderGroup.rotation.z = 0
      }
    }
  }

  setRagdoll(active: boolean): void {
    if (active) {
      this.visualRoot.rotation.set(0.2, 0.15, 1.15)
      if (this.riderGroup) {
        this.riderGroup.rotation.set(1.1, 0.35, 0.7)
        this.riderGroup.position.set(0.45, 0.05, 0.25)
      }
      this.attackTimer = 0
      this.attackSide = 0
    } else {
      this.visualRoot.rotation.set(0, 0, 0)
      if (this.riderGroup) {
        this.riderGroup.rotation.set(0, 0, 0)
        this.riderGroup.position.set(0, 0, 0)
      }
    }
  }

  playAttack(side: number): void {
    this.attackTimer = 0.28
    this.attackSide = side
  }
}

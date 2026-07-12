import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { Physics } from '@core/Physics'

export interface Waypoint {
  position: THREE.Vector3
  width: number
}

export class Track {
  public mesh: THREE.Group
  public waypoints: Waypoint[] = []
  private physics: Physics
  private readonly trackWidth = 16

  constructor(physics: Physics) {
    this.physics = physics
    this.mesh = new THREE.Group()
    this.setupWaypoints()
    this.build()
  }

  private setupWaypoints(): void {
    // L-shaped circuit — all positions confirmed on track surface
    // Front straight runs along Z axis at X=0
    // L-corner at bottom left, sweeping right side
    this.waypoints = [
      { position: new THREE.Vector3(0, 0, 40), width: this.trackWidth },    // W0  start line
      { position: new THREE.Vector3(0, 0, 0), width: this.trackWidth },     // W1  mid front straight
      { position: new THREE.Vector3(0, 0, -40), width: this.trackWidth },   // W2  front straight end
      { position: new THREE.Vector3(30, 0, -70), width: this.trackWidth },  // W3  right sweeper
      { position: new THREE.Vector3(70, 0, -80), width: this.trackWidth },  // W4  bottom right
      { position: new THREE.Vector3(100, 0, -60), width: this.trackWidth }, // W5  right side entry
      { position: new THREE.Vector3(100, 0, 0), width: this.trackWidth },   // W6  right straight mid
      { position: new THREE.Vector3(100, 0, 60), width: this.trackWidth },  // W7  right straight top
      { position: new THREE.Vector3(70, 0, 80), width: this.trackWidth },   // W8  top right
      { position: new THREE.Vector3(30, 0, 60), width: this.trackWidth },   // W9  top mid
      { position: new THREE.Vector3(0, 0, 50), width: this.trackWidth },    // W10 back to start
    ]
  }

  private build(): void {
    this.buildGround()
    this.buildTrackSurface()
    this.buildWalls()
    this.buildStartFinishLine()
  }

  private buildGround(): void {
    const geo = new THREE.PlaneGeometry(600, 600)
    const mat = new THREE.MeshLambertMaterial({ color: 0x3a5c3a })
    const ground = new THREE.Mesh(geo, mat)
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    this.mesh.add(ground)
    this.physics.createGroundCollider(600, 600)
  }

  private buildTrackSurface(): void {
    const mat = new THREE.MeshLambertMaterial({ color: 0x222222 })
    const points = this.getLoopPoints()

    for (let i = 0; i < points.length - 1; i++) {
      const from = points[i]
      const to = points[i + 1]
      this.buildSegment(from, to, mat, false)

      // Corner patch at each junction
      const patchGeo = new THREE.CircleGeometry(this.trackWidth / 2, 24)
      const patch = new THREE.Mesh(patchGeo, mat)
      patch.rotation.x = -Math.PI / 2
      patch.position.set(from.x, 0.01, from.z)
      this.mesh.add(patch)
    }

    // Final patch
    const last = points[points.length - 1]
    const patchGeo = new THREE.CircleGeometry(this.trackWidth / 2, 24)
    const patch = new THREE.Mesh(patchGeo, mat)
    patch.rotation.x = -Math.PI / 2
    patch.position.set(last.x, 0.01, last.z)
    this.mesh.add(patch)
  }

  private buildSegment(
    from: THREE.Vector3,
    to: THREE.Vector3,
    mat: THREE.Material,
    isWall: boolean
  ): void {
    const dir = new THREE.Vector3().subVectors(to, from)
    const length = dir.length()
    const center = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5)
    const angle = Math.atan2(dir.x, dir.z)

    if (isWall) {
      const wallH = 2
      const geo = new THREE.BoxGeometry(this.trackWidth / 2, wallH, length)
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(center.x, wallH / 2, center.z)
      mesh.rotation.y = angle
      mesh.castShadow = true
      this.mesh.add(mesh)
    } else {
      const geo = new THREE.PlaneGeometry(this.trackWidth, length)
      const mesh = new THREE.Mesh(geo, mat)
      mesh.rotation.x = -Math.PI / 2
      mesh.rotation.z = angle
      mesh.position.set(center.x, 0.01, center.z)
      mesh.receiveShadow = true
      this.mesh.add(mesh)
    }
  }

  private buildWalls(): void {
    const wallMat = new THREE.MeshLambertMaterial({ color: 0xcc2200 })
    const wallH = 2
    const half = this.trackWidth / 2
    const points = this.getLoopPoints()

    for (let i = 0; i < points.length - 1; i++) {
      const from = points[i]
      const to = points[i + 1]

      const dir = new THREE.Vector3().subVectors(to, from).normalize()
      const length = from.distanceTo(to)
      const center = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5)
      const angle = Math.atan2(dir.x, dir.z)
      const perp = new THREE.Vector3(-dir.z, 0, dir.x)

      const outerCenter = center.clone().addScaledVector(perp, half)
      const innerCenter = center.clone().addScaledVector(perp, -half)

      this.addWallSegment(outerCenter, angle, length, wallH, wallMat)
      this.addWallSegment(innerCenter, angle, length, wallH, wallMat)
    }
  }

  private addWallSegment(
    position: THREE.Vector3,
    angle: number,
    length: number,
    height: number,
    mat: THREE.MeshLambertMaterial
  ): void {
    // Visual
    const geo = new THREE.BoxGeometry(0.6, height, length)
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(position.x, height / 2, position.z)
    mesh.rotation.y = angle
    mesh.castShadow = true
    this.mesh.add(mesh)

    // Physics
    const bodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(position.x, height / 2, position.z)
      .setRotation({
        x: 0,
        y: Math.sin(angle / 2),
        z: 0,
        w: Math.cos(angle / 2),
      })
    const body = this.physics.world.createRigidBody(bodyDesc)
    const colliderDesc = RAPIER.ColliderDesc.cuboid(0.3, height / 2, length / 2)
      .setFriction(0.1)
      .setRestitution(0.5)
    this.physics.world.createCollider(colliderDesc, body)
  }

  private buildStartFinishLine(): void {
    const geo = new THREE.PlaneGeometry(this.trackWidth, 3)
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.rotation.x = -Math.PI / 2
    // Place at W0 position
    const w0 = this.waypoints[0].position
    mesh.position.set(w0.x, 0.02, w0.z)
    this.mesh.add(mesh)
  }

  private getLoopPoints(): THREE.Vector3[] {
    const points = this.waypoints.map(w =>
      new THREE.Vector3(w.position.x, 0, w.position.z)
    )
    points.push(points[0].clone()) // close loop
    return points
  }

  getStartPositions(): THREE.Vector3[] {
    // Stagger grid positions ON the track at W0, slightly before start line
    const w0 = this.waypoints[0].position
    return [
      new THREE.Vector3(w0.x - 3, 1, w0.z + 8),
      new THREE.Vector3(w0.x + 3, 1, w0.z + 8),
      new THREE.Vector3(w0.x - 3, 1, w0.z + 16),
      new THREE.Vector3(w0.x + 3, 1, w0.z + 16),
    ]
  }

  getStartDirection(): number {
    // Cars face from W0 toward W1 (negative Z)
    const w0 = this.waypoints[0].position
    const w1 = this.waypoints[1].position
    const dir = new THREE.Vector3().subVectors(w1, w0).normalize()
    return Math.atan2(-dir.x, -dir.z)
  }
}
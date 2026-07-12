import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { Physics } from '@core/Physics'
import { InputState } from '@core/InputManager'
import { clamp, lerp, rapierVectorToThree } from '@utils/MathUtils'

export const CAR_CONFIG = {
  maxSpeed: 28,
  maxReverseSpeed: 10,
  acceleration: 18,
  brakeForce: 30,
  reverseAcceleration: 8,
  steerSpeed: 1.0,
  maxSteerAngle: 0.025,
  lateralDamping: 0.82,
  linearDamping: 0.97,
  collisionRecoveryTime: 800,
}

export class Car {
  public mesh: THREE.Group
  public body: RAPIER.RigidBody
  public position: THREE.Vector3 = new THREE.Vector3()
  public isColliding: boolean = false

  protected heading: number = 0
  protected speed: number = 0
  protected spawnPosition: THREE.Vector3
  protected spawnAngle: number

  private lastCollisionTime: number = 0
  public color: number

  constructor(
    physics: Physics,
    spawnPosition: THREE.Vector3,
    spawnAngle: number = 0,
    color: number = 0xe74c3c
  ) {
    this.spawnPosition = spawnPosition.clone()
    this.spawnAngle = spawnAngle
    this.heading = spawnAngle
    this.color = color

    this.body = physics.createBoxBody(
      2, 0.8, 4,
      { x: spawnPosition.x, y: spawnPosition.y, z: spawnPosition.z },
      50
    )
    this.body.wakeUp()
    this.mesh = this.buildMesh(color)
  }

  protected buildMesh(color: number): THREE.Group {
    const group = new THREE.Group()

    const bodyGeo = new THREE.BoxGeometry(2, 0.5, 4)
    const bodyMat = new THREE.MeshLambertMaterial({ color })
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat)
    bodyMesh.position.y = 0.25
    bodyMesh.castShadow = true
    group.add(bodyMesh)

    const cabinGeo = new THREE.BoxGeometry(1.4, 0.45, 2)
    const cabinMat = new THREE.MeshLambertMaterial({
      color: new THREE.Color(color).multiplyScalar(0.7).getHex()
    })
    const cabin = new THREE.Mesh(cabinGeo, cabinMat)
    cabin.position.set(0, 0.72, -0.2)
    cabin.castShadow = true
    group.add(cabin)

    const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 16)
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a })
    const wheelPositions = [
      { x: -1.1, y: 0, z: 1.3 },
      { x: 1.1, y: 0, z: 1.3 },
      { x: -1.1, y: 0, z: -1.3 },
      { x: 1.1, y: 0, z: -1.3 },
    ]
    wheelPositions.forEach((pos) => {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat)
      wheel.position.set(pos.x, pos.y, pos.z)
      wheel.rotation.z = Math.PI / 2
      wheel.castShadow = true
      group.add(wheel)
    })

    return group
  }

  update(input: InputState, deltaTime: number): void {
    this.body.wakeUp()

    const dt = Math.min(deltaTime, 0.05)

    // Steering — only effective when moving
    const speedFactor = clamp(Math.abs(this.speed) / 4, 0, 1)
    const reverseDir = this.speed < 0 ? -1 : 1

    if (input.left) {
      this.heading += CAR_CONFIG.maxSteerAngle * CAR_CONFIG.steerSpeed * speedFactor * reverseDir * dt * 60
    }
    if (input.right) {
      this.heading -= CAR_CONFIG.maxSteerAngle * CAR_CONFIG.steerSpeed * speedFactor * reverseDir * dt * 60
    }

    // Acceleration / brake / reverse
    if (input.forward) {
      this.speed = lerp(this.speed, CAR_CONFIG.maxSpeed, CAR_CONFIG.acceleration * dt * 0.1)
    } else if (input.brake) {
      if (this.speed > 0.5) {
        // Braking while moving forward
        this.speed = lerp(this.speed, 0, CAR_CONFIG.brakeForce * dt * 0.1)
      } else {
        // Reverse
        this.speed = lerp(this.speed, -CAR_CONFIG.maxReverseSpeed, CAR_CONFIG.reverseAcceleration * dt * 0.1)
      }
    } else {
      // Natural deceleration
      this.speed *= CAR_CONFIG.linearDamping
      if (Math.abs(this.speed) < 0.05) this.speed = 0
    }

    // Compute velocity from heading and speed
    const vx = -Math.sin(this.heading) * this.speed
    const vz = -Math.cos(this.heading) * this.speed

    // Apply to physics body so collisions still work
    this.body.setLinvel({ x: vx, y: this.body.linvel().y, z: vz }, true)
    this.body.setRotation({
      x: 0,
      y: Math.sin(this.heading / 2),
      z: 0,
      w: Math.cos(this.heading / 2),
    }, true)

    this.syncMesh()
  }

  applyCollisionImpulse(direction: THREE.Vector3, force: number): void {
    const now = performance.now()
    if (now - this.lastCollisionTime < CAR_CONFIG.collisionRecoveryTime) return
    this.lastCollisionTime = now
    this.isColliding = true

    // Knock speed down and push sideways
    this.speed *= 0.3
    this.body.applyImpulse({
      x: direction.x * force,
      y: 1,
      z: direction.z * force,
    }, true)

    setTimeout(() => { this.isColliding = false }, CAR_CONFIG.collisionRecoveryTime)
  }

  protected syncMesh(): void {
    const pos = this.body.translation()
    this.position.set(pos.x, pos.y, pos.z)
    this.mesh.position.set(pos.x, pos.y, pos.z)
    this.mesh.rotation.y = this.heading
  }

  getSpeed(): number {
    return Math.abs(this.speed)
  }

  getForwardSpeed(): number {
    return this.speed
  }

  getHeading(): number {
    return this.heading
  }

  reset(): void {
    this.speed = 0
    this.heading = this.spawnAngle
    this.body.setTranslation(
      { x: this.spawnPosition.x, y: this.spawnPosition.y, z: this.spawnPosition.z },
      true
    )
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    this.body.setRotation({
      x: 0,
      y: Math.sin(this.spawnAngle / 2),
      z: 0,
      w: Math.cos(this.spawnAngle / 2),
    }, true)
    this.isColliding = false
  }
}
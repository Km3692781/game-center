import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { Physics } from '@core/Physics'
import { InputState } from '@core/InputManager'
import { clamp, lerp, rapierVectorToThree } from '@utils/MathUtils'
import { BikeModel } from '@entities/Bike'
import { HealthBar } from '@entities/HealthBar'
import { RIDE_HEIGHT, ROAD_SURFACE_Y, Track } from '@entities/Track'

export const CAR_CONFIG = {
  // ~0–100 km/h in ~4.5s, top ~148 km/h
  maxSpeed: 41,
  maxReverseSpeed: 4,
  acceleration: 6.2,        // m/s²
  brakeForce: 11,           // m/s²
  reverseAcceleration: 4,
  engineBraking: 2.8,       // m/s² coast
  steerSpeed: 0.75,
  maxSteerAngle: 0.018,
  lateralDamping: 0.88,
  collisionForceThreshold: 10,
  collisionRecoveryTime: 900,
  punchRange: 3.2,
  kickRange: 3.8,
  punchCooldown: 0.45,
  kickCooldown: 0.65,
  punchForce: 55,
  kickForce: 80,
  /** Health damage values (max health = 100) */
  maxHealth: 100,
  punchDamage: 15,
  kickDamage: 10,
  bikeBumpDamage: 8,
  trafficDamage: 120,
  bodyWidth: 1.0,
  bodyHeight: 0.7,
  bodyDepth: 2.0,
}

export type BikeState = 'riding' | 'crashed' | 'arrested'
export type AttackType = 'punch' | 'kick' | null

export class Car {
  public mesh: THREE.Group
  public body: RAPIER.RigidBody
  public position: THREE.Vector3 = new THREE.Vector3()
  public bikeState: BikeState = 'riding'

  protected heading: number = 0
  protected steerAngle: number = 0
  protected spawnPosition: THREE.Vector3
  protected spawnAngle: number
  public color: number

  protected bikeModel: BikeModel
  protected currentSpeed: number = 0
  private lastCollisionTime: number = 0
  private crashTimer: number = 0
  private readonly crashDisplayTime: number = 2.0
  /** Seconds spent on the ground this crash — cops need this before arresting */
  protected crashDownTime: number = 0
  protected attackCooldown: number = 0
  private pendingAttack: AttackType = null
  /** Signed forward speed along heading (m/s) */
  protected forwardSpeed: number = 0
  /** Places visual wheels on ROAD_SURFACE_Y given physics center height */
  private meshYOffset: number = -RIDE_HEIGHT + ROAD_SURFACE_Y

  public health: number = CAR_CONFIG.maxHealth
  /** Last stable race-curve T — used for road constraint + ranking */
  public raceT: number = 0
  public arrested: boolean = false
  protected healthBar: HealthBar
  private overheadHealthVisible = true
  /** Police / special flag */
  public isPolice: boolean = false
  /** Who this unit is angry at (police chase) */
  public hostileTarget: Car | null = null
  public provoked: boolean = false

  constructor(
    physics: Physics,
    spawnPosition: THREE.Vector3,
    spawnAngle: number = 0,
    color: number = 0xe74c3c,
    envMap?: THREE.Texture
  ) {
    this.spawnPosition = spawnPosition.clone()
    this.spawnPosition.y = RIDE_HEIGHT
    this.spawnAngle = spawnAngle
    this.heading = spawnAngle
    this.color = color

    this.body = physics.createBoxBody(
      CAR_CONFIG.bodyWidth,
      CAR_CONFIG.bodyHeight,
      CAR_CONFIG.bodyDepth,
      { x: this.spawnPosition.x, y: RIDE_HEIGHT, z: this.spawnPosition.z },
      180,
      { lockRotationsXZ: true }
    )
    this.body.setRotation({
      x: 0,
      y: Math.sin(spawnAngle / 2),
      z: 0,
      w: Math.cos(spawnAngle / 2),
    }, true)
    this.body.wakeUp()

    this.bikeModel = new BikeModel(color, envMap)
    this.mesh = this.bikeModel.group
    this.meshYOffset = this.bikeModel.getMeshYOffset(RIDE_HEIGHT)
    this.healthBar = new HealthBar()
    this.mesh.add(this.healthBar.sprite)
    this.syncMesh()
  }

  /** Player uses the HUD bar — hide the floating one above the rider. */
  hideOverheadHealthBar(): void {
    this.overheadHealthVisible = false
    this.healthBar.setVisible(false)
  }

  update(input: InputState, deltaTime: number): void {
    this.body.wakeUp()
    const dt = Math.min(deltaTime, 0.05)

    if (this.attackCooldown > 0) {
      this.attackCooldown -= dt
    }

    if (this.body.translation().y < -5) {
      this.respawn()
      return
    }

    if (this.bikeState === 'crashed' || this.bikeState === 'arrested') {
      if (this.bikeState === 'crashed') {
        this.crashTimer -= dt
        this.crashDownTime += dt
      }
      this.currentSpeed = 0
      this.bikeModel.setRagdoll(true)
      this.lockToGround()
      this.syncMesh()
      return
    }

    const rot = this.body.rotation()
    this.heading = 2 * Math.atan2(rot.y, rot.w)

    const speedFactor = clamp(Math.abs(this.forwardSpeed) / 8, 0.15, 1)
    const reverseDir = this.forwardSpeed >= -0.5 ? 1 : -1

    if (input.left || input.right) {
      const dir = input.left ? 1 : -1
      // Less turn authority at high speed
      const highSpeedPenalty = clamp(1 - Math.abs(this.forwardSpeed) / CAR_CONFIG.maxSpeed * 0.55, 0.35, 1)
      this.heading += dir * CAR_CONFIG.maxSteerAngle * CAR_CONFIG.steerSpeed *
        speedFactor * reverseDir * highSpeedPenalty * dt * 60
      this.steerAngle = lerp(this.steerAngle, dir * CAR_CONFIG.maxSteerAngle * 10, 0.12)
      this.body.setRotation({
        x: 0,
        y: Math.sin(this.heading / 2),
        z: 0,
        w: Math.cos(this.heading / 2),
      }, false)
    } else {
      this.steerAngle = lerp(this.steerAngle, 0, 0.1)
    }

    // Realistic accel / brake along heading (not instant snap-to-top-speed)
    if (input.forward) {
      this.forwardSpeed = Math.min(
        this.forwardSpeed + CAR_CONFIG.acceleration * dt,
        CAR_CONFIG.maxSpeed
      )
    } else if (input.brake) {
      if (this.forwardSpeed > 0.4) {
        this.forwardSpeed = Math.max(0, this.forwardSpeed - CAR_CONFIG.brakeForce * dt)
      } else {
        this.forwardSpeed = Math.max(
          -CAR_CONFIG.maxReverseSpeed,
          this.forwardSpeed - CAR_CONFIG.reverseAcceleration * dt
        )
      }
    } else if (this.forwardSpeed > 0) {
      this.forwardSpeed = Math.max(0, this.forwardSpeed - CAR_CONFIG.engineBraking * dt)
    } else if (this.forwardSpeed < 0) {
      this.forwardSpeed = Math.min(0, this.forwardSpeed + CAR_CONFIG.engineBraking * dt)
    }

    const forwardDir = new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading))
    const desiredVx = forwardDir.x * this.forwardSpeed
    const desiredVz = forwardDir.z * this.forwardSpeed

    // Blend toward desired velocity — keeps momentum without teleporting speed
    const vel = this.body.linvel()
    const blend = 1 - Math.exp(-10 * dt)
    const newVx = lerp(vel.x, desiredVx, blend)
    const newVz = lerp(vel.z, desiredVz, blend)
    this.body.setLinvel({ x: newVx, y: 0, z: newVz }, true)

    this.currentSpeed = Math.sqrt(newVx * newVx + newVz * newVz)

    this.pendingAttack = null
    if (this.attackCooldown <= 0) {
      if (input.kick) {
        this.pendingAttack = 'kick'
        this.attackCooldown = CAR_CONFIG.kickCooldown
        this.bikeModel.playAttack(1, 'kick')
      } else if (input.punch) {
        this.pendingAttack = 'punch'
        this.attackCooldown = CAR_CONFIG.punchCooldown
        this.bikeModel.playAttack(-1, 'punch')
      }
    }

    this.lockToGround()
    this.bikeModel.update(this.steerAngle, this.currentSpeed, dt)
    this.syncMesh()
  }

  /** Keep bike planted on the road surface — no floating / launching. */
  lockToGround(): void {
    const t = this.body.translation()
    this.body.setTranslation({ x: t.x, y: RIDE_HEIGHT, z: t.z }, true)
    const v = this.body.linvel()
    if (v.y !== 0) {
      this.body.setLinvel({ x: v.x, y: 0, z: v.z }, true)
    }
  }

  consumeAttack(): AttackType {
    const attack = this.pendingAttack
    this.pendingAttack = null
    return attack
  }

  tryAttack(type: 'punch' | 'kick'): boolean {
    if (this.bikeState !== 'riding' || this.attackCooldown > 0) return false
    this.pendingAttack = type
    this.attackCooldown = type === 'kick' ? CAR_CONFIG.kickCooldown : CAR_CONFIG.punchCooldown
    this.bikeModel.playAttack(type === 'kick' ? 1 : -1, type)
    return true
  }

  /** Apply damage; crash only when health hits 0. Returns true if this hit caused a crash. */
  applyDamage(amount: number): boolean {
    if (this.bikeState !== 'riding') return false
    this.health = Math.max(0, this.health - amount)
    this.healthBar.setRatio(this.health / CAR_CONFIG.maxHealth)
    if (this.health <= 0) {
      this.triggerCrash()
      return true
    }
    return false
  }

  takeHit(direction: THREE.Vector3, force: number, damage: number): void {
    if (this.bikeState !== 'riding') return

    // Horizontal shove — kick/punch direction
    this.body.applyImpulse({
      x: direction.x * force,
      y: 0,
      z: direction.z * force,
    }, true)
    this.forwardSpeed *= 0.55
    this.lockToGround()
    this.applyDamage(damage)
  }

  applyCollisionImpulse(direction: THREE.Vector3, force: number, relativeSpeed: number, damage: number): void {
    const now = performance.now()
    if (now - this.lastCollisionTime < CAR_CONFIG.collisionRecoveryTime) return
    this.lastCollisionTime = now

    this.body.applyImpulse({
      x: direction.x * force,
      y: 0,
      z: direction.z * force,
    }, true)
    this.forwardSpeed *= 0.7
    this.lockToGround()

    // Scale bump damage with relative speed; traffic uses damage >= 100
    const dmg =
      damage >= CAR_CONFIG.maxHealth
        ? damage
        : Math.max(damage, Math.round(damage * (relativeSpeed / 12)))
    this.applyDamage(dmg)
  }

  triggerCrash(): void {
    if (this.bikeState !== 'riding') return
    this.bikeState = 'crashed'
    this.health = 0
    this.healthBar.setRatio(0)
    this.crashTimer = this.crashDisplayTime
    this.crashDownTime = 0
    this.pendingAttack = null
    this.forwardSpeed = 0
    this.currentSpeed = 0
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    this.bikeModel.setRagdoll(true)
    this.lockToGround()
  }

  arrest(): void {
    if (this.arrested) return
    this.arrested = true
    this.bikeState = 'arrested'
    this.pendingAttack = null
    this.forwardSpeed = 0
    this.currentSpeed = 0
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    this.bikeModel.setRagdoll(true)
    this.healthBar.setVisible(false)
  }

  isCrashTimerDone(): boolean {
    return this.bikeState === 'crashed' && this.crashTimer <= 0
  }

  /**
   * Cops only nab you after you've been down long enough to get up (Press R).
   * Instant arrest-on-contact felt unfair when health was merely low.
   */
  canBeArrested(): boolean {
    return this.bikeState === 'crashed' && this.crashDownTime >= 2.0
  }

  /** Soft clamp onto asphalt after hits / physics steps. */
  constrainToTrack(track: Track): void {
    const t = this.body.translation()
    const margin = this.bikeState === 'crashed' || this.bikeState === 'arrested' ? 1.6 : 1.1
    const result = track.constrainToRoad(
      new THREE.Vector3(t.x, t.y, t.z),
      track.roadHalfWidth - margin,
      this.raceT
    )
    this.raceT = result.t
    this.body.setTranslation(
      { x: result.position.x, y: RIDE_HEIGHT, z: result.position.z },
      true
    )
    const v = this.body.linvel()
    this.body.setLinvel({ x: v.x, y: 0, z: v.z }, true)
    this.syncMesh()
  }

  /** Freeze on the grid facing the start line (countdown). */
  holdSpawnPose(): void {
    this.heading = this.spawnAngle
    this.forwardSpeed = 0
    this.currentSpeed = 0
    this.body.setTranslation(
      { x: this.spawnPosition.x, y: RIDE_HEIGHT, z: this.spawnPosition.z },
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
    this.syncMesh()
  }

  respawn(): void {
    if (this.arrested) return
    this.bikeState = 'riding'
    this.crashTimer = 0
    this.crashDownTime = 0
    this.pendingAttack = null
    this.attackCooldown = 0
    this.forwardSpeed = 0
    this.currentSpeed = 0
    this.health = CAR_CONFIG.maxHealth
    this.healthBar.setRatio(1)
    this.healthBar.setVisible(this.overheadHealthVisible)
    this.bikeModel.setRagdoll(false)
    this.steerAngle = 0
    this.heading = this.spawnAngle
    this.body.setTranslation(
      { x: this.spawnPosition.x, y: RIDE_HEIGHT, z: this.spawnPosition.z },
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
    this.syncMesh()
  }

  updateSpawnPosition(pos: THREE.Vector3, angle: number): void {
    this.spawnPosition.set(pos.x, RIDE_HEIGHT, pos.z)
    this.spawnAngle = angle
  }

  protected syncMesh(): void {
    const pos = this.body.translation()
    const rot = this.body.rotation()
    this.position.set(pos.x, pos.y, pos.z)
    this.mesh.position.copy(rapierVectorToThree(pos))
    this.mesh.position.y = pos.y + this.meshYOffset
    const euler = new THREE.Euler().setFromQuaternion(
      new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w), 'YXZ'
    )
    this.mesh.rotation.y = euler.y
  }

  getSpeed(): number { return this.currentSpeed }
  /** Signed speed along bike heading (negative = reversing). */
  getForwardSpeed(): number { return this.forwardSpeed }
  getHeading(): number { return this.heading }
  getHealthRatio(): number { return this.health / CAR_CONFIG.maxHealth }

  reset(): void {
    this.respawn()
  }
}

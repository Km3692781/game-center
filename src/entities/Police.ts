import * as THREE from 'three'
import { Physics } from '@core/Physics'
import { Car, CAR_CONFIG } from '@entities/Car'
import { Track } from '@entities/Track'
import { clamp } from '@utils/MathUtils'

const POLICE_CONFIG = {
  patrolSpeed: 22,
  chaseSpeed: 38,
  attackRange: 4.0,
  /** Close enough to cuff you — not a huge bubble around the road */
  arrestRange: 5,
  /** Must be down this long before a bust (seconds) */
  arrestDownTime: 2.0,
  attackRate: 2.2,
}

/**
 * Road Rash–style cops: patrol peacefully until a racer hits them,
 * then chase. Arrest any crashed racer who falls nearby.
 */
export class Police extends Car {
  private track: Track
  private cruiseT: number

  constructor(
    physics: Physics,
    track: Track,
    startT: number,
    envMap?: THREE.Texture
  ) {
    const point = track.getCurve().getPointAt(startT)
    const tangent = track.getCurve().getTangentAt(startT).normalize()
    const right = new THREE.Vector3()
      .crossVectors(tangent, new THREE.Vector3(0, 1, 0))
      .normalize()
    const spawn = point
      .clone()
      .addScaledVector(right, (Math.random() > 0.5 ? 1 : -1) * 4.5)
      .setY(0)
    const angle = Math.atan2(-tangent.x, -tangent.z)

    // Police black / blue paint
    super(physics, spawn, angle, 0x1a3a6e, envMap)
    this.isPolice = true
    this.track = track
    this.cruiseT = startT
    this.raceT = startT
  }

  /** Called when any racer lands a hit on this officer. */
  provoke(attacker: Car): void {
    if (this.bikeState !== 'riding') return
    this.provoked = true
    this.hostileTarget = attacker
  }

  updatePolice(deltaTime: number, racers: Car[]): void {
    this.body.wakeUp()
    const dt = Math.min(deltaTime, 0.05)

    if (this.attackCooldown > 0) this.attackCooldown -= dt

    if (this.bikeState === 'crashed' || this.bikeState === 'arrested') {
      this.bikeModel.setRagdoll(true)
      this.syncMesh()
      return
    }

    // Clear dead targets
    if (
      this.hostileTarget &&
      (this.hostileTarget.arrested ||
        this.hostileTarget.bikeState === 'arrested')
    ) {
      this.hostileTarget = null
      this.provoked = false
    }

    const pos = new THREE.Vector3(
      this.body.translation().x,
      0,
      this.body.translation().z
    )

    let targetSpeed = POLICE_CONFIG.patrolSpeed
    let seekPos: THREE.Vector3 | null = null

    if (this.provoked && this.hostileTarget && this.hostileTarget.bikeState === 'riding') {
      seekPos = new THREE.Vector3(
        this.hostileTarget.position.x,
        0,
        this.hostileTarget.position.z
      )
      targetSpeed = POLICE_CONFIG.chaseSpeed
      const dist = pos.distanceTo(seekPos)
      if (dist < POLICE_CONFIG.attackRange && this.attackCooldown <= 0) {
        this.tryAttack(Math.random() < 0.45 ? 'kick' : 'punch')
      }
    } else {
      // Peaceful patrol along the circuit
      this.cruiseT = (this.cruiseT + (POLICE_CONFIG.patrolSpeed * dt) / this.approxTrackLength()) % 1
      const p = this.track.getCurve().getPointAt(this.cruiseT)
      const tangent = this.track.getCurve().getTangentAt(this.cruiseT).normalize()
      const right = new THREE.Vector3()
        .crossVectors(tangent, new THREE.Vector3(0, 1, 0))
        .normalize()
      seekPos = p.clone().addScaledVector(right, 4.2)
      seekPos.y = 0
    }

    if (seekPos) {
      const toTarget = new THREE.Vector3().subVectors(seekPos, pos)
      if (toTarget.lengthSq() > 0.01) {
        toTarget.normalize()
        const targetAngle = Math.atan2(-toTarget.x, -toTarget.z)
        let angleDiff = targetAngle - this.heading
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI
        const steer = clamp(angleDiff * 2.4, -1, 1)
        this.heading += steer * CAR_CONFIG.maxSteerAngle * CAR_CONFIG.steerSpeed * dt * 60
        this.steerAngle = steer * CAR_CONFIG.maxSteerAngle * 10
        this.body.setRotation({
          x: 0,
          y: Math.sin(this.heading / 2),
          z: 0,
          w: Math.cos(this.heading / 2),
        }, false)
      }
    }

    if (this.forwardSpeed < targetSpeed) {
      this.forwardSpeed = Math.min(
        targetSpeed,
        this.forwardSpeed + CAR_CONFIG.acceleration * dt
      )
    } else {
      this.forwardSpeed = Math.max(
        targetSpeed,
        this.forwardSpeed - CAR_CONFIG.brakeForce * dt
      )
    }

    const desiredVx = -Math.sin(this.heading) * this.forwardSpeed
    const desiredVz = -Math.cos(this.heading) * this.forwardSpeed
    const vel = this.body.linvel()
    const blend = 1 - Math.exp(-10 * dt)
    this.body.setLinvel(
      {
        x: vel.x + (desiredVx - vel.x) * blend,
        y: 0,
        z: vel.z + (desiredVz - vel.z) * blend,
      },
      true
    )
    this.currentSpeed = Math.abs(this.forwardSpeed)
    this.lockToGround()
    this.bikeModel.update(this.steerAngle, this.currentSpeed, dt)
    this.syncMesh()

    void racers
  }

  /** Arrest only when a racer is still on the ground after a real crash. */
  tryArrestNearby(racers: Car[]): Car | null {
    if (this.bikeState !== 'riding') return null
    for (const r of racers) {
      if (r.isPolice || r.arrested) continue
      // Riding / low HP alone is never enough — must be crashed & still down
      if (!r.canBeArrested()) continue
      const dist = this.position.distanceTo(r.position)
      if (dist < POLICE_CONFIG.arrestRange) {
        r.arrest()
        return r
      }
    }
    return null
  }

  private approxTrackLength(): number {
    // Stable estimate from curve; length() is cached by three.js
    return Math.max(this.track.getCurve().getLength(), 400)
  }
}

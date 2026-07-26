import * as THREE from 'three'
import { Physics } from '@core/Physics'
import { Car, CAR_CONFIG } from '@entities/Car'
import { Waypoint } from '@entities/Track'
import { clamp } from '@utils/MathUtils'

/** Per-bot racing personality — keeps them from cloning the same perfect line. */
interface BotPersonality {
  /** Preferred lateral offset from waypoint center (meters, + = right). */
  laneBias: number
  /** 0.75–1.05 of max speed. */
  speedMul: number
  /** How aggressively they close on rivals to fight. */
  aggression: number
  /** Chance/sec to throw a punch/kick when in range. */
  attackRate: number
  /** How often they weave to a new lane bias. */
  weaveInterval: number
  /** Willingness to stay near traffic / rivals (lower = safer). */
  risk: number
}

const BOT_CONFIG = {
  lookAheadDistance: 16,
  steerSensitivity: 2.6,
  cornerSlowdownAngle: 0.4,
  cornerSpeedFactor: 0.58,
  huntRange: 16,
  attackRange: 4.5,
  preferKickChance: 0.45,
  crashRespawnDelay: 2.6,
}

function makePersonality(seed: number): BotPersonality {
  // Deterministic-ish from color index / seed
  const r = (n: number) => {
    const x = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453
    return x - Math.floor(x)
  }
  return {
    laneBias: (r(1) - 0.5) * 7,
    speedMul: 0.78 + r(2) * 0.24,
    aggression: 0.55 + r(3) * 0.45,
    attackRate: 1.8 + r(4) * 2.2,
    weaveInterval: 2.5 + r(5) * 4,
    risk: 0.35 + r(6) * 0.55,
  }
}

export class Bot extends Car {
  private waypoints: Waypoint[]
  private currentWaypointIndex: number
  public waypointProgress: number = 0
  private crashRespawnTimer: number = 0
  private readonly personality: BotPersonality
  private laneTarget: number
  private weaveTimer: number = 0

  constructor(
    physics: Physics,
    spawnPosition: THREE.Vector3,
    spawnAngle: number,
    color: number,
    waypoints: Waypoint[],
    envMap?: THREE.Texture,
    startWaypointIndex: number = 0
  ) {
    super(physics, spawnPosition, spawnAngle, color, envMap)
    this.waypoints = waypoints
    this.currentWaypointIndex = startWaypointIndex
    this.personality = makePersonality(color + startWaypointIndex * 17)
    this.laneTarget = this.personality.laneBias
    this.weaveTimer = this.personality.weaveInterval * Math.random()
  }

  updateBot(deltaTime: number, otherCars: Car[]): void {
    this.body.wakeUp()

    const dt = Math.min(deltaTime, 0.05)

    // Was missing — bots could throw at most one attack per race
    if (this.attackCooldown > 0) this.attackCooldown -= dt

    if (this.body.translation().y < -10) {
      this.respawn()
      return
    }

    if (this.bikeState === 'arrested') {
      this.bikeModel.setRagdoll(true)
      this.syncMesh()
      return
    }

    if (this.bikeState === 'crashed') {
      this.crashRespawnTimer += dt
      this.crashDownTime += dt
      this.bikeModel.setRagdoll(true)
      this.syncMesh()
      if (this.crashRespawnTimer >= BOT_CONFIG.crashRespawnDelay) {
        this.crashRespawnTimer = 0
        this.respawn()
      }
      return
    }

    const pos = new THREE.Vector3(
      this.body.translation().x,
      0,
      this.body.translation().z
    )

    // Weave to a new racing line periodically
    this.weaveTimer -= dt
    if (this.weaveTimer <= 0) {
      this.weaveTimer = this.personality.weaveInterval * (0.7 + Math.random() * 0.6)
      this.laneTarget = this.personality.laneBias + (Math.random() - 0.5) * 5
      this.laneTarget = clamp(this.laneTarget, -6.5, 6.5)
    }

    const wp = this.waypoints[this.currentWaypointIndex]
    const nextWp = this.waypoints[(this.currentWaypointIndex + 1) % this.waypoints.length]

    // Build offset target: waypoint + lateral bias along road right-vector
    const along = new THREE.Vector3().subVectors(nextWp.position, wp.position).setY(0)
    if (along.lengthSq() < 1e-6) along.set(0, 0, -1)
    along.normalize()
    const right = new THREE.Vector3(along.z, 0, -along.x)

    let target = new THREE.Vector3()
      .copy(wp.position)
      .addScaledVector(right, this.laneTarget)
    target.y = 0

    if (pos.distanceTo(wp.position) < BOT_CONFIG.lookAheadDistance) {
      this.currentWaypointIndex = (this.currentWaypointIndex + 1) % this.waypoints.length
      this.waypointProgress++
    }

    const rot = this.body.rotation()
    this.heading = 2 * Math.atan2(rot.y, rot.w)

    const vel = this.body.linvel()

    // Find nearest rival ahead / alongside for hunting & combat
    let nearestRival: Car | null = null
    let nearestDist = Infinity
    let rivalSide = 0

    const forward = new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading))
    const rightH = new THREE.Vector3(forward.z, 0, -forward.x)

    for (const other of otherCars) {
      if (other === this) continue
      if (other.bikeState !== 'riding') continue
      // Don't pick fights with peaceful police — only if already provoked
      if (other.isPolice && !other.provoked && other.hostileTarget !== this) continue
      const otherPos = new THREE.Vector3(other.position.x, 0, other.position.z)
      const toOther = new THREE.Vector3().subVectors(otherPos, pos)
      const dist = toOther.length()
      if (dist >= nearestDist || dist < 0.2) continue

      const alongDot = toOther.dot(forward)
      // Prefer rivals roughly nearby (not far behind)
      if (alongDot < -4) continue
      nearestDist = dist
      nearestRival = other
      rivalSide = Math.sign(toOther.dot(rightH) || 1)
    }

    // Hunt: steer toward rival when aggressive and in range
    if (
      nearestRival &&
      nearestDist < BOT_CONFIG.huntRange &&
      Math.random() < this.personality.aggression * 0.9
    ) {
      const rivalPos = new THREE.Vector3(nearestRival.position.x, 0, nearestRival.position.z)
      // Aim slightly beside them (fight line), not into their center
      const sideBias = rivalSide === 0 ? (Math.random() > 0.5 ? 1 : -1) : rivalSide
      target = rivalPos.clone().addScaledVector(rightH, sideBias * 2.2)
    }

    // Angle to target
    const toTarget = new THREE.Vector3().subVectors(target, pos).normalize()
    const targetAngle = Math.atan2(-toTarget.x, -toTarget.z)
    let angleDiff = targetAngle - this.heading
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI

    // Soft separation only when almost overlapping (don't kill combat)
    let avoidOffset = 0
    for (const other of otherCars) {
      if (other.bikeState !== 'riding') continue
      const otherPos = new THREE.Vector3(other.position.x, 0, other.position.z)
      const dist = pos.distanceTo(otherPos)
      if (dist < 2.2 && dist > 0.1) {
        const away = new THREE.Vector3().subVectors(pos, otherPos).normalize()
        const avoidAngle = Math.atan2(-away.x, -away.z)
        let avoidDiff = avoidAngle - this.heading
        while (avoidDiff > Math.PI) avoidDiff -= 2 * Math.PI
        while (avoidDiff < -Math.PI) avoidDiff += 2 * Math.PI
        avoidOffset += avoidDiff * 0.08 * (1 - this.personality.risk)
      }
    }

    // Combat: swing often when alongside
    if (nearestRival && nearestDist < BOT_CONFIG.attackRange) {
      const rate = this.personality.attackRate * (0.7 + this.personality.aggression)
      if (Math.random() < rate * dt) {
        const type = Math.random() < BOT_CONFIG.preferKickChance ? 'kick' : 'punch'
        this.tryAttack(type)
      }
    }

    // Imperfect steering — skilled bots track tighter, risky ones overshoot
    const skill = 0.55 + (1 - this.personality.risk) * 0.4
    const steerAmount = clamp(
      angleDiff * BOT_CONFIG.steerSensitivity * skill,
      -1,
      1
    )
    const speedFactor = clamp(Math.abs(this.forwardSpeed) / 8, 0.25, 1)
    this.heading +=
      steerAmount * CAR_CONFIG.maxSteerAngle * CAR_CONFIG.steerSpeed * speedFactor * dt * 60 +
      avoidOffset
    this.steerAngle = steerAmount * CAR_CONFIG.maxSteerAngle * 10

    this.body.setRotation({
      x: 0,
      y: Math.sin(this.heading / 2),
      z: 0,
      w: Math.cos(this.heading / 2),
    }, false)

    // Speed with personality + messy corners
    const cornerSharpness = Math.abs(angleDiff)
    const cornerMul =
      cornerSharpness > BOT_CONFIG.cornerSlowdownAngle
        ? BOT_CONFIG.cornerSpeedFactor + this.personality.risk * 0.12
        : 1
    const targetSpeed =
      CAR_CONFIG.maxSpeed * this.personality.speedMul * cornerMul

    // Occasional late brake / overspeed mistakes
    const mistake = Math.random() < this.personality.risk * 0.02 ? 1.12 : 1

    if (this.forwardSpeed < targetSpeed * mistake) {
      this.forwardSpeed = Math.min(
        targetSpeed * mistake,
        this.forwardSpeed + CAR_CONFIG.acceleration * dt
      )
    } else {
      this.forwardSpeed = Math.max(
        targetSpeed,
        this.forwardSpeed - CAR_CONFIG.brakeForce * dt * (1.2 - this.personality.risk * 0.5)
      )
    }

    const desiredVx = -Math.sin(this.heading) * this.forwardSpeed
    const desiredVz = -Math.cos(this.heading) * this.forwardSpeed
    const blend = 1 - Math.exp(-10 * dt)
    const newVx = vel.x + (desiredVx - vel.x) * blend
    const newVz = vel.z + (desiredVz - vel.z) * blend
    this.body.setLinvel({ x: newVx, y: 0, z: newVz }, true)

    this.currentSpeed = Math.abs(this.forwardSpeed)
    this.lockToGround()
    this.bikeModel.update(this.steerAngle, this.currentSpeed, dt)
    this.syncMesh()
  }

  getCurrentWaypointIndex(): number {
    return this.currentWaypointIndex
  }
}

import * as THREE from 'three'
import { Physics } from '@core/Physics'
import { Car, CAR_CONFIG } from '@entities/Car'
import { Waypoint } from '@entities/Track'
import { clamp } from '@utils/MathUtils'

const BOT_CONFIG = {
  lookAheadDistance: 15,
  steerSensitivity: 3.5,
  cornerSlowdownAngle: 0.4,
  cornerSpeedFactor: 0.6,
  avoidanceRadius: 5,
  avoidanceStrength: 0.08,
}

export class Bot extends Car {
  private waypoints: Waypoint[]
  private currentWaypointIndex: number
  public waypointProgress: number = 0

  constructor(
    physics: Physics,
    spawnPosition: THREE.Vector3,
    spawnAngle: number,
    color: number,
    waypoints: Waypoint[],
    startWaypointIndex: number = 0
  ) {
    super(physics, spawnPosition, spawnAngle, color)
    this.waypoints = waypoints
    this.currentWaypointIndex = startWaypointIndex
  }

  updateBot(
    deltaTime: number,
    otherCars: Car[]
  ): void {
    this.body.wakeUp()

    const dt = Math.min(deltaTime, 0.05)
    const pos = new THREE.Vector3(
      this.body.translation().x,
      0,
      this.body.translation().z
    )

    const target = new THREE.Vector3(
      this.waypoints[this.currentWaypointIndex].position.x,
      0,
      this.waypoints[this.currentWaypointIndex].position.z
    )

    const distToWaypoint = pos.distanceTo(target)
    if (distToWaypoint < BOT_CONFIG.lookAheadDistance) {
      this.currentWaypointIndex = (this.currentWaypointIndex + 1) % this.waypoints.length
      this.waypointProgress++
    }

    // Angle to target
    const toTarget = new THREE.Vector3().subVectors(target, pos).normalize()
    const targetAngle = Math.atan2(-toTarget.x, -toTarget.z)
    let angleDiff = targetAngle - this.heading

    // Normalize to [-PI, PI]
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI

    // Steer toward waypoint
    const steerAmount = clamp(angleDiff * BOT_CONFIG.steerSensitivity, -1, 1)
    const speedFactor = clamp(Math.abs(this.speed) / 4, 0.3, 1)
    this.heading += steerAmount * CAR_CONFIG.maxSteerAngle * CAR_CONFIG.steerSpeed * speedFactor * dt * 60

    // Avoidance steering
    otherCars.forEach((other) => {
      const otherPos = new THREE.Vector3(other.position.x, 0, other.position.z)
      const dist = pos.distanceTo(otherPos)
      if (dist < BOT_CONFIG.avoidanceRadius && dist > 0.1) {
        const away = new THREE.Vector3().subVectors(pos, otherPos)
        const avoidAngle = Math.atan2(-away.x, -away.z)
        let avoidDiff = avoidAngle - this.heading
        while (avoidDiff > Math.PI) avoidDiff -= 2 * Math.PI
        while (avoidDiff < -Math.PI) avoidDiff += 2 * Math.PI
        this.heading += avoidDiff * BOT_CONFIG.avoidanceStrength
      }
    })

    // Speed control
    const cornerSharpness = Math.abs(angleDiff)
    const targetSpeed = cornerSharpness > BOT_CONFIG.cornerSlowdownAngle
      ? CAR_CONFIG.maxSpeed * BOT_CONFIG.cornerSpeedFactor
      : CAR_CONFIG.maxSpeed

    if (this.speed < targetSpeed) {
      this.speed += CAR_CONFIG.acceleration * dt * 0.1 * (targetSpeed - this.speed)
    } else {
      this.speed *= 0.98
    }
    this.speed = clamp(this.speed, 0, CAR_CONFIG.maxSpeed)

    // Apply to physics body
    const vx = -Math.sin(this.heading) * this.speed
    const vz = -Math.cos(this.heading) * this.speed
    this.body.setLinvel({ x: vx, y: this.body.linvel().y, z: vz }, true)
    this.body.setRotation({
      x: 0,
      y: Math.sin(this.heading / 2),
      z: 0,
      w: Math.cos(this.heading / 2),
    }, true)

    this.syncMesh()
  }

  getCurrentWaypointIndex(): number {
    return this.currentWaypointIndex
  }
}
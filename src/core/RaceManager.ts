import * as THREE from 'three'
import { Car } from '@entities/Car'
import { Bot } from '@entities/Bot'
import { Waypoint } from '@entities/Track'

export type RaceState = 'waiting' | 'countdown' | 'racing' | 'finished'

export interface RacerState {
  id: string
  isPlayer: boolean
  car: Car | Bot
  lap: number
  waypointIndex: number
  waypointProgress: number
  lapTimes: number[]
  bestLap: number | null
  finished: boolean
  position: number
}

const TOTAL_LAPS = 3
const COLLISION_DISTANCE = 4
const COLLISION_FORCE = 80

export class RaceManager {
  public state: RaceState = 'waiting'
  public racers: RacerState[] = []
  public countdown: number = 3
  public totalLaps: number = TOTAL_LAPS

  private waypoints: Waypoint[]
  private countdownInterval: ReturnType<typeof setInterval> | null = null
  private lapStartTimes: Map<string, number> = new Map()
  private onCountdownTick: (n: number) => void
  private onRaceStart: () => void
  private onLapComplete: (id: string, lapTime: number, isPlayer: boolean) => void
  private onRaceFinish: (id: string, isPlayer: boolean) => void

  constructor(
    waypoints: Waypoint[],
    callbacks: {
      onCountdownTick: (n: number) => void
      onRaceStart: () => void
      onLapComplete: (id: string, lapTime: number, isPlayer: boolean) => void
      onRaceFinish: (id: string, isPlayer: boolean) => void
    }
  ) {
    this.waypoints = waypoints
    this.onCountdownTick = callbacks.onCountdownTick
    this.onRaceStart = callbacks.onRaceStart
    this.onLapComplete = callbacks.onLapComplete
    this.onRaceFinish = callbacks.onRaceFinish
  }

  addRacer(id: string, car: Car | Bot, isPlayer: boolean): void {
    this.racers.push({
      id,
      isPlayer,
      car,
      lap: 1,
      waypointIndex: 0,
      waypointProgress: 0,
      lapTimes: [],
      bestLap: null,
      finished: false,
      position: 1,
    })
  }

  startCountdown(): void {
    this.state = 'countdown'
    this.countdown = 3
    this.onCountdownTick(this.countdown)

    this.countdownInterval = setInterval(() => {
      this.countdown--
      if (this.countdown > 0) {
        this.onCountdownTick(this.countdown)
      } else {
        clearInterval(this.countdownInterval!)
        this.countdown = 0
        this.onCountdownTick(0) // GO
        this.state = 'racing'
        const now = performance.now()
        this.racers.forEach(r => this.lapStartTimes.set(r.id, now))
        this.onRaceStart()
      }
    }, 1000)
  }

  update(playerPosition: THREE.Vector3): void {
    if (this.state !== 'racing') return

    this.checkCollisions()
    this.updatePlayerProgress(playerPosition)
    this.updatePositions()
  }

  private updatePlayerProgress(playerPos: THREE.Vector3): void {
    const player = this.racers.find(r => r.isPlayer)
    if (!player || player.finished) return

    const target = this.waypoints[player.waypointIndex]
    const dist = new THREE.Vector3(playerPos.x, 0, playerPos.z)
      .distanceTo(new THREE.Vector3(target.position.x, 0, target.position.z))

    if (dist < 12) {
      const prevIndex = player.waypointIndex
      player.waypointIndex = (player.waypointIndex + 1) % this.waypoints.length
      player.waypointProgress++

      // Completed a lap when waypoint wraps back to 0
      if (player.waypointIndex === 0 && prevIndex === this.waypoints.length - 1) {
        this.completeLap(player)
      }
    }
  }

  private completeLap(racer: RacerState): void {
    const now = performance.now()
    const lapTime = now - (this.lapStartTimes.get(racer.id) ?? now)
    racer.lapTimes.push(lapTime)

    if (racer.bestLap === null || lapTime < racer.bestLap) {
      racer.bestLap = lapTime
    }

    this.onLapComplete(racer.id, lapTime, racer.isPlayer)
    this.lapStartTimes.set(racer.id, now)

    if (racer.lap >= TOTAL_LAPS) {
      racer.finished = true
      racer.lap = TOTAL_LAPS
      this.onRaceFinish(racer.id, racer.isPlayer)

      const allFinished = this.racers.every(r => r.finished)
      if (allFinished) this.state = 'finished'
    } else {
      racer.lap++
    }
  }

  updateBotProgress(botId: string, waypointProgress: number, waypointIndex: number): void {
    const racer = this.racers.find(r => r.id === botId)
    if (!racer || racer.finished) return

    const prev = racer.waypointProgress
    racer.waypointProgress = waypointProgress
    racer.waypointIndex = waypointIndex

    // Check if bot completed a lap
    if (waypointProgress > prev && waypointIndex === 0 && prev % this.waypoints.length === this.waypoints.length - 1) {
      this.completeLap(racer)
    }
  }

  private checkCollisions(): void {
    const cars = this.racers.map(r => r.car)

    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i]
        const b = cars[j]
        const dist = a.position.distanceTo(b.position)

        if (dist < COLLISION_DISTANCE && dist > 0.1) {
          const dir = new THREE.Vector3()
            .subVectors(b.position, a.position)
            .normalize()

          const force = COLLISION_FORCE * (1 - dist / COLLISION_DISTANCE)
          a.applyCollisionImpulse(dir.clone().negate(), force)
          b.applyCollisionImpulse(dir, force)
        }
      }
    }
  }

  private updatePositions(): void {
    const sorted = [...this.racers].sort((a, b) => {
      if (a.lap !== b.lap) return b.lap - a.lap
      return b.waypointProgress - a.waypointProgress
    })
    sorted.forEach((r, i) => { r.position = i + 1 })
  }

  getPlayerState(): RacerState | undefined {
    return this.racers.find(r => r.isPlayer)
  }

  isRacing(): boolean {
    return this.state === 'racing'
  }
}
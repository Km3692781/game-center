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
  /** Curve parameter 0–1 for ranking / finish detection */
  trackT: number
  /** Must pass mid-track before a finish crossing counts */
  armedForLap: boolean
}

const TOTAL_LAPS = 3
/** Intermediate checkpoints only — finish uses line crossing */
const WAYPOINT_HIT_RADIUS = 9

export class RaceManager {
  public state: RaceState = 'waiting'
  public racers: RacerState[] = []
  public countdown: number = 3
  public totalLaps: number = TOTAL_LAPS

  private waypoints: Waypoint[]
  private countdownInterval: ReturnType<typeof setInterval> | null = null
  private countdownPausedAt: number | null = null
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
      trackT: 0,
      armedForLap: false,
    })
  }

  startCountdown(): void {
    this.state = 'countdown'
    this.countdown = 3
    this.countdownPausedAt = null
    this.onCountdownTick(this.countdown)
    this.armCountdownTick()
  }

  private armCountdownTick(): void {
    if (this.countdownInterval) clearInterval(this.countdownInterval)
    this.countdownInterval = setInterval(() => {
      if (this.countdownPausedAt !== null) return
      this.countdown--
      if (this.countdown > 0) {
        this.onCountdownTick(this.countdown)
      } else {
        clearInterval(this.countdownInterval!)
        this.countdownInterval = null
        this.countdown = 0
        this.onCountdownTick(0)
        this.state = 'racing'
        const now = performance.now()
        this.racers.forEach(r => {
          this.lapStartTimes.set(r.id, now)
          r.armedForLap = false
          r.trackT = 0
        })
        this.onRaceStart()
      }
    }, 1000)
  }

  setPaused(paused: boolean): void {
    if (this.state !== 'countdown') return
    if (paused) {
      this.countdownPausedAt = performance.now()
    } else {
      this.countdownPausedAt = null
    }
  }

  /** Shift lap clocks forward so paused wall-time is not counted. */
  addPausedDuration(ms: number): void {
    if (ms <= 0) return
    for (const [id, start] of this.lapStartTimes) {
      this.lapStartTimes.set(id, start + ms)
    }
  }

  /**
   * Update ranking waypoints + finish-line crossing from curve T.
   * Lap only counts when crossing t≈0 after arming past mid-lap.
   */
  updateTrackProgress(id: string, trackT: number, position: THREE.Vector3): void {
    if (this.state !== 'racing') return
    const racer = this.racers.find(r => r.id === id)
    if (!racer || racer.finished || racer.car.arrested) return

    const prevT = racer.trackT
    racer.trackT = trackT

    // Intermediate waypoints (ranking only — never awards a lap)
    this.advanceWaypoints(racer, position)

    // Arm after leaving the start zone
    if (trackT > 0.22 && trackT < 0.92) {
      racer.armedForLap = true
    }

    // Crossed finish: was near end of loop, now just past start
    if (
      racer.armedForLap &&
      prevT > 0.9 &&
      trackT < 0.1
    ) {
      racer.armedForLap = false
      this.completeLap(racer)
    }
  }

  /** Recompute places from lap + trackT (call once per frame after all progress updates). */
  refreshPositions(): void {
    if (this.state !== 'racing' && this.state !== 'finished') return
    this.updatePositions()
  }

  /** @deprecated Prefer updateTrackProgress for all racers */
  update(playerPosition: THREE.Vector3): void {
    const player = this.racers.find(r => r.isPlayer)
    if (!player || this.state !== 'racing') return
    // Fallback if Engine still calls update without T — no lap from this path
    this.advanceWaypoints(player, playerPosition)
    this.updatePositions()
  }

  private advanceWaypoints(racer: RacerState, position: THREE.Vector3): void {
    const target = this.waypoints[racer.waypointIndex]
    const dist = new THREE.Vector3(position.x, 0, position.z)
      .distanceTo(new THREE.Vector3(target.position.x, 0, target.position.z))

    if (dist < WAYPOINT_HIT_RADIUS) {
      racer.waypointIndex = (racer.waypointIndex + 1) % this.waypoints.length
      racer.waypointProgress++
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
    // Pathing index from AI — keep for debug; ranking uses trackT + lap
    racer.waypointProgress = Math.max(racer.waypointProgress, waypointProgress)
    racer.waypointIndex = waypointIndex
  }

  private updatePositions(): void {
    const sorted = [...this.racers].sort((a, b) => {
      const aArrest = a.car.arrested
      const bArrest = b.car.arrested
      if (aArrest !== bArrest) return aArrest ? 1 : -1

      // Race finishers stay ahead of still-racing riders
      const aDone = a.finished && !aArrest
      const bDone = b.finished && !bArrest
      if (aDone !== bDone) return aDone ? -1 : 1
      if (aDone && bDone) return a.position - b.position

      return (b.lap + b.trackT) - (a.lap + a.trackT)
    })
    sorted.forEach((r, i) => { r.position = i + 1 })
  }

  markArrested(id: string): void {
    const racer = this.racers.find(r => r.id === id)
    if (!racer) return
    racer.finished = true
    this.updatePositions()
  }

  getPlayerState(): RacerState | undefined {
    return this.racers.find(r => r.isPlayer)
  }

  isRacing(): boolean {
    return this.state === 'racing'
  }
}

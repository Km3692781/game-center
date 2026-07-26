import * as THREE from 'three'
import { Renderer } from '@core/Renderer'
import { Physics } from '@core/Physics'
import { InputManager, InputState } from '@core/InputManager'
import { RaceManager } from '@core/RaceManager'
import { Car, CAR_CONFIG } from '@entities/Car'
import { Bot } from '@entities/Bot'
import { Police } from '@entities/Police'
import { Track } from '@entities/Track'
import { Traffic } from '@entities/Traffic'
import { HUD } from '@ui/HUD'
import { VehicleAssets } from '@entities/VehicleAssets'
import { NatureAssets } from '@entities/NatureAssets'

const BOT_COLORS = [
  0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6,
  0x1abc9c, 0xe67e22, 0x34495e,
]
const TOTAL_RACERS = 8 // player + 7 rivals
const TOTAL_LAPS = 3
const POLICE_COUNT = 3
/** Half-extents for traffic OBB vs bike (meters) — must nearly touch */
const TRAFFIC_HIT_ALONG = 2.15
const TRAFFIC_HIT_SIDE = 1.15

const IDLE_INPUT: InputState = {
  forward: false,
  brake: false,
  left: false,
  right: false,
  reset: false,
  punch: false,
  kick: false,
  pause: false,
}

export class Engine {
  private renderer: Renderer
  private physics: Physics
  private input: InputManager
  private hud: HUD
  private raceManager!: RaceManager

  private player!: Car
  private bots: Bot[] = []
  private police: Police[] = []
  private track!: Track
  private traffic!: Traffic
  private playerGameOver = false

  private lastTime: number = 0
  private animFrameId: number = 0
  private running: boolean = false
  private lapStartTime: number = 0
  private raceStarted: boolean = false
  private playerBestLap: number | null = null
  /** Ignore crash-inducing collisions briefly after green light */
  private collisionGraceUntil: number = 0
  private paused = false
  /** Accumulated pause duration so lap timer freezes while paused */
  private pausedTotalMs = 0
  private pauseStartedAt = 0
  private reverseWarnTimer = 0

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas)
    this.physics = new Physics()
    this.input = new InputManager()
    this.hud = new HUD()
  }

  async init(): Promise<void> {
    await this.physics.init()
    await Promise.all([
      VehicleAssets.preload(),
      NatureAssets.preload(),
      this.renderer.initEnvironment(),
    ])

    this.track = new Track(this.physics)
    this.renderer.scene.add(this.track.mesh)

    this.traffic = new Traffic(
      this.renderer.scene,
      this.physics,
      this.track,
      this.renderer.envMap
    )

    const startPositions = this.track.getStartPositions(TOTAL_RACERS)
    const spawnAngle = this.track.getStartDirection()
    const envMap = this.renderer.envMap

    this.player = new Car(
      this.physics, startPositions[0], spawnAngle, 0xe74c3c, envMap
    )
    this.player.hideOverheadHealthBar()
    this.renderer.scene.add(this.player.mesh)

    BOT_COLORS.forEach((color, i) => {
      const bot = new Bot(
        this.physics,
        startPositions[i + 1],
        spawnAngle,
        color,
        this.track.waypoints,
        envMap,
        0
      )
      this.bots.push(bot)
      this.renderer.scene.add(bot.mesh)
    })

    for (let i = 0; i < POLICE_COUNT; i++) {
      const cop = new Police(
        this.physics,
        this.track,
        0.18 + i * (0.7 / POLICE_COUNT),
        envMap
      )
      this.police.push(cop)
      this.renderer.scene.add(cop.mesh)
    }

    this.raceManager = new RaceManager(
      this.track.waypoints,
      {
        onCountdownTick: (n) => this.hud.showCountdown(n),
        onRaceStart: () => {
          this.raceStarted = true
          this.playerGameOver = false
          this.pausedTotalMs = 0
          this.lapStartTime = performance.now()
          this.collisionGraceUntil = performance.now() + 2500
          // Clear any pre-start tumble from physics settling
          this.player.respawn()
          this.bots.forEach((bot) => bot.respawn())
          this.hud.showCrash(false)
          this.hud.showArrested(false)
          this.hud.showReverse(false)
          this.hud.updateHealth(1)
        },
        onLapComplete: (_id, lapTime, isPlayer) => {
          if (isPlayer) {
            const isBest = this.playerBestLap === null || lapTime < this.playerBestLap
            if (isBest) this.playerBestLap = lapTime
            this.hud.updateBestLap(this.playerBestLap)
            this.hud.showMessage(isBest ? 'BEST LAP!' : 'LAP COMPLETE', 2000)
            this.pausedTotalMs = 0
            this.lapStartTime = performance.now()
          }
        },
        onRaceFinish: (_id, isPlayer) => {
          if (isPlayer) {
            this.hud.showMessage('FINISH!', 99999)
            this.raceStarted = false
          }
        },
      }
    )

    this.raceManager.addRacer('player', this.player, true)
    this.bots.forEach((bot, i) => {
      this.raceManager.addRacer(`bot_${i}`, bot, false)
    })

    this.hud.updateLap(1, TOTAL_LAPS)
    this.hud.updateBestLap(null)
    this.hud.updatePosition(1, TOTAL_RACERS)
    this.hud.updateHealth(1)

    setTimeout(() => this.raceManager.startCountdown(), 600)
  }

  start(): void {
    this.running = true
    this.lastTime = performance.now()
    this.animFrameId = requestAnimationFrame(this.loop)
  }

  private loop = (timestamp: number): void => {
    if (!this.running) return
    const deltaTime = Math.min((timestamp - this.lastTime) / 1000, 0.05)
    this.lastTime = timestamp

    if (this.input.consumePauseToggle()) {
      this.setPaused(!this.paused)
    }

    if (!this.paused) {
      this.update(deltaTime)
    } else {
      this.hud.showPause(true)
    }

    this.renderer.render()
    this.animFrameId = requestAnimationFrame(this.loop)
  }

  private setPaused(paused: boolean): void {
    if (paused === this.paused) return
    this.paused = paused
    this.raceManager.setPaused(paused)
    this.hud.showPause(paused)

    if (paused) {
      this.pauseStartedAt = performance.now()
      // Freeze bikes so they don't drift while paused
      this.player.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
      this.player.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
      this.bots.forEach((b) => {
        b.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
        b.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
      })
      this.police.forEach((p) => {
        p.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
        p.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
      })
    } else {
      const pausedMs = performance.now() - this.pauseStartedAt
      this.pausedTotalMs += pausedMs
      this.raceManager.addPausedDuration(pausedMs)
    }
  }

  private update(deltaTime: number): void {
    const input = this.input.getState()
    const now = performance.now()

    this.physics.step(deltaTime)

    // Hold the grid during countdown so Rapier settling can't tumble bikes
    if (!this.raceStarted) {
      this.holdOnGrid()
    }

    if (this.playerGameOver || this.player.arrested) {
      this.hud.showArrested(true)
      this.hud.showCrash(false)
      this.player.update(IDLE_INPUT, deltaTime)
      this.updateCamera()
      this.renderer.followTarget(this.player.position)
      return
    }

    const isCrashed = this.player.bikeState === 'crashed'
    this.hud.showCrash(isCrashed && this.player.isCrashTimerDone())

    if (input.reset) {
      if (isCrashed && !this.player.arrested) {
        this.player.respawn()
        this.hud.showCrash(false)
      } else if (this.raceStarted && this.player.bikeState === 'riding') {
        this.player.reset()
      }
    }

    if (this.raceStarted && this.player.bikeState === 'riding') {
      this.player.update(input, deltaTime)
    } else {
      this.player.update(IDLE_INPUT, deltaTime)
    }

    // Checkpoint-style respawn using race T (not global closest)
    if (this.raceStarted && this.player.bikeState === 'riding') {
      const t = this.player.raceT
      const checkpointPos = this.track.getCurve().getPointAt(t)
      const tangent = this.track.getCurve().getTangentAt(t)
      const angle = Math.atan2(-tangent.x, -tangent.z)
      this.player.updateSpawnPosition(
        new THREE.Vector3(checkpointPos.x, 0, checkpointPos.z),
        angle
      )
    }

    const racers: Car[] = [this.player, ...this.bots]
    const combatants: Car[] = [...racers, ...this.police]

    if (this.raceStarted) {
      this.bots.forEach((bot, i) => {
        // Bots fight each other + player; may engage provoked police
        bot.updateBot(deltaTime, combatants)
        this.raceManager.updateBotProgress(
          `bot_${i}`,
          bot.waypointProgress,
          bot.getCurrentWaypointIndex()
        )
      })

      this.police.forEach((cop) => {
        cop.updatePolice(deltaTime, racers)
        const arrested = cop.tryArrestNearby(racers)
        if (arrested) {
          if (arrested === this.player) {
            this.playerGameOver = true
            this.raceStarted = false
            this.hud.showArrested(true)
            this.hud.showMessage('BUSTED!', 4000)
          } else {
            const idx = this.bots.indexOf(arrested as Bot)
            if (idx >= 0) this.raceManager.markArrested(`bot_${idx}`)
            this.hud.showMessage('RIVAL ARRESTED!', 1200)
          }
        }
      })

      const grace = now < this.collisionGraceUntil
      if (!grace) {
        this.checkBikeCollisions(combatants)
        this.checkTrafficCollisions(racers)
        this.resolveAttacks(combatants)
      }
      this.traffic.update(this.player.position, deltaTime)

      // Race T first, then constrain with that hint — prevents corner teleport
      for (const bike of combatants) {
        bike.raceT = this.track.getRaceT(bike.position, bike.raceT)
        bike.constrainToTrack(this.track)
        bike.lockToGround()
      }

      for (const bike of racers) {
        const id = bike === this.player
          ? 'player'
          : `bot_${this.bots.indexOf(bike as Bot)}`
        this.raceManager.updateTrackProgress(id, bike.raceT, bike.position)
      }
      this.raceManager.refreshPositions()
    }

    this.updateCamera()
    this.renderer.followTarget(this.player.position)

    this.hud.updateSpeed(this.player.getSpeed() * 3.6)
    this.hud.updateHealth(this.player.getHealthRatio())
    if (this.raceStarted && !isCrashed) {
      this.hud.updateTimer(now - this.lapStartTime - this.pausedTotalMs)
    }
    const ps = this.raceManager.getPlayerState()
    if (ps) {
      this.hud.updatePosition(ps.position, TOTAL_RACERS)
      this.hud.updateLap(Math.min(ps.lap, TOTAL_LAPS), TOTAL_LAPS)
    }

    // Wrong-way warning
    if (this.raceStarted && !isCrashed) {
      const speed = this.player.getSpeed()
      const alongFace = this.track.getAlongTrackDot(
        this.player.position,
        this.player.getHeading(),
        this.player.raceT
      )
      const vel = this.player.body.linvel()
      const tangent = this.track.getCurve().getTangentAt(this.player.raceT)
      const trackSpeed = vel.x * tangent.x + vel.z * tangent.z
      const reversing =
        trackSpeed < -3.2 ||
        this.player.getForwardSpeed() < -3.2 ||
        (speed > 5 && alongFace < -0.4)
      if (reversing) {
        this.reverseWarnTimer += deltaTime
        if (this.reverseWarnTimer > 0.25) this.hud.showReverse(true)
      } else {
        this.reverseWarnTimer = 0
        this.hud.showReverse(false)
      }
    } else {
      this.hud.showReverse(false)
    }
  }

  private holdOnGrid(): void {
    const bikes = [this.player, ...this.bots]
    for (const bike of bikes) {
      if (bike.bikeState === 'crashed') {
        bike.respawn()
      } else {
        bike.holdSpawnPose()
      }
    }
  }

  private resolveAttacks(bikes: Car[]): void {
    for (const attacker of bikes) {
      const attack = attacker.consumeAttack()
      if (!attack || attacker.bikeState !== 'riding') continue

      const range = attack === 'kick' ? CAR_CONFIG.kickRange : CAR_CONFIG.punchRange
      const force = attack === 'kick' ? CAR_CONFIG.kickForce : CAR_CONFIG.punchForce
      const damage = attack === 'kick' ? CAR_CONFIG.kickDamage : CAR_CONFIG.punchDamage

      const forward = new THREE.Vector3(
        -Math.sin(attacker.getHeading()),
        0,
        -Math.cos(attacker.getHeading())
      )
      // Kick pushes mainly sideways in the kick direction
      const right = new THREE.Vector3(-Math.cos(attacker.getHeading()), 0, Math.sin(attacker.getHeading()))
      const kickSide = attacker === this.player
        ? (this.input.getState().right ? 1 : this.input.getState().left ? -1 : 0)
        : 0

      let best: Car | null = null
      let bestDist = range

      for (const target of bikes) {
        if (target === attacker || target.bikeState !== 'riding') continue
        // Peaceful police: only take hits (which provoke them), still valid targets
        const toTarget = new THREE.Vector3().subVectors(target.position, attacker.position)
        const dist = toTarget.length()
        if (dist > range || dist < 0.1) continue

        const dir = toTarget.clone().normalize()
        const forwardDot = dir.dot(forward)
        const side = Math.abs(dir.x * forward.z - dir.z * forward.x)
        if (forwardDot < -0.35 && side < 0.4) continue

        if (dist < bestDist) {
          bestDist = dist
          best = target
        }
      }

      if (!best) continue

      let hitDir = new THREE.Vector3()
        .subVectors(best.position, attacker.position)
        .setY(0)
      if (hitDir.lengthSq() < 1e-6) hitDir.copy(right)
      hitDir.normalize()

      if (attack === 'kick') {
        const sideSign = kickSide !== 0
          ? kickSide
          : Math.sign(hitDir.dot(right) || 1)
        hitDir = right.clone().multiplyScalar(sideSign).addScaledVector(forward, 0.25).normalize()
      } else {
        hitDir.addScaledVector(right, Math.sign(hitDir.dot(right) || 1) * 0.45).normalize()
      }

      best.takeHit(hitDir, force, damage)

      // Hitting a cop turns them hostile
      if (best.isPolice) {
        ;(best as Police).provoke(attacker)
        if (attacker === this.player) this.hud.showMessage('COPS ANGERED!', 1000)
      }

      if (attacker === this.player) {
        this.hud.showMessage(attack === 'kick' ? 'KICK!' : 'CLUB!', 600)
      } else if (best === this.player) {
        this.hud.showMessage('YOU GOT HIT!', 900)
      }
    }
  }

  private checkBikeCollisions(allBikes: Car[]): void {
    for (let i = 0; i < allBikes.length; i++) {
      for (let j = i + 1; j < allBikes.length; j++) {
        const a = allBikes[i]
        const b = allBikes[j]
        if (a.bikeState !== 'riding' || b.bikeState !== 'riding') continue

        const dist = a.position.distanceTo(b.position)
        if (dist < 3.5 && dist > 0.1) {
          const dir = new THREE.Vector3()
            .subVectors(b.position, a.position)
            .normalize()

          const velA = a.body.linvel()
          const velB = b.body.linvel()
          const relSpeed = new THREE.Vector3(
            velA.x - velB.x, 0, velA.z - velB.z
          ).length()

          const force = 60 * (1 - dist / 3.5)
          a.applyCollisionImpulse(dir.clone().negate(), force, relSpeed, CAR_CONFIG.bikeBumpDamage)
          b.applyCollisionImpulse(dir, force, relSpeed, CAR_CONFIG.bikeBumpDamage)

          // Bumping peaceful police doesn't provoke — only attacks do
        }
      }
    }
  }

  private checkTrafficCollisions(bikes: Car[]): void {
    const cars = this.traffic.getActiveCars()
    if (cars.length === 0) return

    for (const bike of bikes) {
      if (bike.bikeState !== 'riding') continue
      const speed = bike.getSpeed()
      const bikePos = bike.position

      for (const car of cars) {
        if (!this.bikeHitsTraffic(bikePos, car.position, car.heading)) continue

        const dir = new THREE.Vector3()
          .subVectors(bikePos, car.position)
          .setY(0)
        if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0)
        dir.normalize()

        // Oncoming traffic = lethal (damage > 100)
        bike.applyCollisionImpulse(dir, 120, Math.max(speed, 14), CAR_CONFIG.trafficDamage)
        if (bike === this.player) {
          this.hud.showMessage('TRAFFIC HIT!', 1000)
        }
        break
      }
    }
  }

  /** Oriented box test — ignores side grazes that never touch the car body. */
  private bikeHitsTraffic(
    bikePos: THREE.Vector3,
    carPos: THREE.Vector3,
    carHeading: number
  ): boolean {
    const forward = new THREE.Vector3(-Math.sin(carHeading), 0, -Math.cos(carHeading))
    const right = new THREE.Vector3(forward.z, 0, -forward.x)
    const delta = new THREE.Vector3().subVectors(bikePos, carPos).setY(0)
    const along = Math.abs(delta.dot(forward))
    const side = Math.abs(delta.dot(right))
    return along < TRAFFIC_HIT_ALONG && side < TRAFFIC_HIT_SIDE
  }

  private updateCamera(): void {
    const pos = this.player.position
    const heading = this.player.getHeading()

    // Chase cam for 3D bikes — further back so the mesh sits in the world
    const camDist = this.player.bikeState === 'crashed' ? 7.5 : 6.8
    const camHeight = this.player.bikeState === 'crashed' ? 3.4 : 2.9

    const offsetX = Math.sin(heading) * camDist
    const offsetZ = Math.cos(heading) * camDist

    const targetPos = new THREE.Vector3(
      pos.x + offsetX,
      pos.y + camHeight,
      pos.z + offsetZ
    )

    this.renderer.camera.position.lerp(targetPos, 0.18)
    this.renderer.camera.lookAt(pos.x, pos.y + 1.05, pos.z)
  }

  /** Dev-only probe for movement / race state checks. */
  getDebugState(): {
    raceStarted: boolean
    x: number
    z: number
    speed: number
    heading: number
  } {
    const p = this.player.position
    return {
      raceStarted: this.raceStarted,
      x: p.x,
      z: p.z,
      speed: this.player.getSpeed(),
      heading: this.player.getHeading(),
    }
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.animFrameId)
  }

  destroy(): void {
    this.stop()
    this.renderer.destroy()
    this.physics.destroy()
    this.input.destroy()
    this.traffic.dispose()
  }
}

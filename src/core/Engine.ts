import * as THREE from 'three'
import { Renderer } from '@core/Renderer'
import { Physics } from '@core/Physics'
import { InputManager } from '@core/InputManager'
import { RaceManager } from '@core/RaceManager'
import { Car } from '@entities/Car'
import { Bot } from '@entities/Bot'
import { Track } from '@entities/Track'
import { HUD } from '@ui/HUD'

const BOT_COLORS = [0x3498db, 0x2ecc71, 0xf39c12]

export class Engine {
  private renderer: Renderer
  private physics: Physics
  private input: InputManager
  private hud: HUD
  private raceManager!: RaceManager

  private player!: Car
  private bots: Bot[] = []
  private track!: Track

  private lastTime: number = 0
  private animFrameId: number = 0
  private running: boolean = false
  private lapStartTime: number = 0
  private elapsedLapTime: number = 0
  private raceStarted: boolean = false

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas)
    this.physics = new Physics()
    this.input = new InputManager()
    this.hud = new HUD()
  }

  async init(): Promise<void> {
    await this.physics.init()

    this.track = new Track(this.physics)
    this.renderer.scene.add(this.track.mesh)

    const startPositions = this.track.getStartPositions()
    const spawnAngle = this.track.getStartDirection()

    // Player car
    this.player = new Car(this.physics, startPositions[0], spawnAngle, 0xe74c3c)
    this.renderer.scene.add(this.player.mesh)

    // Bot cars
    BOT_COLORS.forEach((color, i) => {
      const bot = new Bot(
        this.physics,
        startPositions[i + 1],
        spawnAngle,
        color,
        this.track.waypoints,
        0
      )
      this.bots.push(bot)
      this.renderer.scene.add(bot.mesh)
    })

    // Race manager
    this.raceManager = new RaceManager(
      this.track.waypoints,
      {
        onCountdownTick: (n) => this.hud.showCountdown(n),
        onRaceStart: () => {
          this.raceStarted = true
          this.lapStartTime = performance.now()
        },
        onLapComplete: (id, lapTime, isPlayer) => {
          if (isPlayer) {
            const player = this.raceManager.getPlayerState()
            this.hud.updateLap(player?.lap ?? 1, this.raceManager.totalLaps)
            this.hud.updateBestLap(player?.bestLap ?? null)
            this.hud.showMessage(
              player?.bestLap === lapTime ? 'BEST LAP! 🏆' : `LAP COMPLETE`,
              2000
            )
            this.lapStartTime = performance.now()
          }
        },
        onRaceFinish: (_id, isPlayer) => {
          if (isPlayer) {
            this.hud.showMessage('RACE COMPLETE! 🏁', 99999)
            this.raceStarted = false
          }
        },
      }
    )

    this.raceManager.addRacer('player', this.player, true)
    this.bots.forEach((bot, i) => this.raceManager.addRacer(`bot_${i}`, bot, false))

    this.hud.updateLap(1, this.raceManager.totalLaps)
    this.hud.updateBestLap(null)
    this.hud.updatePosition(1, 4)

    // Start countdown after short delay
    setTimeout(() => this.raceManager.startCountdown(), 500)
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
    this.update(deltaTime, timestamp)
    this.renderer.render()
    this.animFrameId = requestAnimationFrame(this.loop)
  }

  private update(deltaTime: number, _timestamp: number): void {
    const input = this.input.getState()

    // Reset car
    if (input.reset) this.player.reset()

    // Physics step
    this.physics.step(deltaTime)

    // Player update — only allow input when racing
    if (this.raceStarted) {
      this.player.update(input, deltaTime)
    } else {
      this.player.update({ forward: false, brake: false, left: false, right: false, reset: false }, deltaTime)
    }

    // Bot updates
    const allCars = [this.player, ...this.bots]
    this.bots.forEach((bot, i) => {
      if (this.raceStarted) {
        const others = allCars.filter((_, j) => j !== i + 1)
        bot.updateBot(deltaTime, others)
        this.raceManager.updateBotProgress(`bot_${i}`, bot.waypointProgress, bot.getCurrentWaypointIndex())
      }
    })

    // Race manager update
    this.raceManager.update(this.player.position)

    // Camera follow
    this.updateCamera()

    // HUD
    const speedKmh = this.player.getSpeed() * 3.6
    this.hud.updateSpeed(speedKmh)

    if (this.raceStarted) {
      this.elapsedLapTime = performance.now() - this.lapStartTime
      this.hud.updateTimer(this.elapsedLapTime)
    }

    const playerState = this.raceManager.getPlayerState()
    if (playerState) {
      this.hud.updatePosition(playerState.position, 4)
    }
  }

  private updateCamera(): void {
    const carPos = this.player.position
    const carQuat = this.player.mesh.quaternion

    const offset = new THREE.Vector3(0, 6, 12)
    offset.applyQuaternion(carQuat)

    const targetPos = carPos.clone().add(offset)
    this.renderer.camera.position.lerp(targetPos, 0.08)
    this.renderer.camera.lookAt(carPos.clone().add(new THREE.Vector3(0, 1, 0)))
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
  }
}
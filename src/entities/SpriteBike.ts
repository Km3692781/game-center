import * as THREE from 'three'
import { SpriteFrameId, SpriteSheet } from '@entities/SpriteSheet'
import { ROAD_SURFACE_Y } from '@entities/Track'

/** World height of the sprite (meters) — rear-view bike + rider. */
const SPRITE_HEIGHT = 2.45

/**
 * Road Rash–style bike+rider as a camera-facing sprite.
 * Keeps a ground blob so the unit still feels planted.
 */
export class SpriteBike {
  readonly group: THREE.Group
  private readonly sprite: THREE.Sprite
  private readonly material: THREE.SpriteMaterial
  private readonly sheet: SpriteSheet
  private readonly shadow: THREE.Mesh

  private leanAngle = 0
  private attackTimer = 0
  private attackSide = 0
  private crashed = false
  private currentFrame: SpriteFrameId = 'center'
  private readonly localMinY: number

  constructor(color: number) {
    this.group = new THREE.Group()
    this.sheet = SpriteSheet.create(color)

    this.material = new THREE.SpriteMaterial({
      map: this.sheet.texture,
      transparent: true,
      depthWrite: false,
      sizeAttenuation: true,
    })
    this.sheet.applyFrame(this.material, 'center')

    this.sprite = new THREE.Sprite(this.material)
    // Aspect matches atlas frame (128x160)
    const aspect = this.sheet.frameWidth / this.sheet.frameHeight
    this.sprite.scale.set(SPRITE_HEIGHT * aspect, SPRITE_HEIGHT, 1)
    // Center of sprite sits above ground; bottom ~ at y=0
    this.sprite.center.set(0.5, 0)
    this.sprite.position.y = 0
    this.sprite.renderOrder = 3
    this.group.add(this.sprite)

    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    })
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20), shadowMat)
    this.shadow.rotation.x = -Math.PI / 2
    this.shadow.position.y = 0.02
    this.shadow.renderOrder = 1
    this.group.add(this.shadow)

    this.localMinY = 0
  }

  getMeshYOffset(rideHeight: number): number {
    return ROAD_SURFACE_Y - rideHeight - this.localMinY
  }

  update(steerAngle: number, _speed: number, deltaTime: number): void {
    if (this.crashed) {
      this.setFrame('crash')
      return
    }

    const targetLean = -steerAngle * 18
    this.leanAngle += (targetLean - this.leanAngle) * 10 * deltaTime

    if (this.attackTimer > 0) {
      this.attackTimer -= deltaTime
      this.setFrame(this.attackSide > 0 ? 'kick' : 'punch')
      return
    }

    if (this.leanAngle > 6) this.setFrame('leanLeft')
    else if (this.leanAngle < -6) this.setFrame('leanRight')
    else this.setFrame('center')
  }

  playAttack(side: number): void {
    if (this.crashed) return
    this.attackTimer = 0.28
    this.attackSide = side
  }

  setRagdoll(active: boolean): void {
    this.crashed = active
    if (active) this.setFrame('crash')
    else {
      this.attackTimer = 0
      this.setFrame('center')
    }
  }

  private setFrame(id: SpriteFrameId): void {
    if (this.currentFrame === id) return
    this.currentFrame = id
    this.sheet.applyFrame(this.material, id)
  }
}

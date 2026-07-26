import * as THREE from 'three'

/** Billboard HP bar floating above a bike. */
export class HealthBar {
  readonly sprite: THREE.Sprite
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly texture: THREE.CanvasTexture
  private lastRatio = -1

  constructor(private readonly yOffset = 2.35) {
    this.canvas = document.createElement('canvas')
    this.canvas.width = 128
    this.canvas.height = 20
    this.ctx = this.canvas.getContext('2d')!

    this.texture = new THREE.CanvasTexture(this.canvas)
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.texture.minFilter = THREE.LinearFilter
    this.texture.magFilter = THREE.LinearFilter

    const mat = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    })
    this.sprite = new THREE.Sprite(mat)
    this.sprite.scale.set(1.6, 0.25, 1)
    this.sprite.position.y = this.yOffset
    this.sprite.renderOrder = 10
    this.setRatio(1)
  }

  setRatio(ratio: number): void {
    const r = Math.max(0, Math.min(1, ratio))
    if (Math.abs(r - this.lastRatio) < 0.005) return
    this.lastRatio = r

    const ctx = this.ctx
    const w = this.canvas.width
    const h = this.canvas.height
    ctx.clearRect(0, 0, w, h)

    ctx.fillStyle = 'rgba(0,0,0,0.65)'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'
    ctx.lineWidth = 2
    ctx.strokeRect(1, 1, w - 2, h - 2)

    const fill = r > 0.45 ? '#2ecc71' : r > 0.2 ? '#f1c40f' : '#e74c3c'
    ctx.fillStyle = fill
    ctx.fillRect(4, 4, (w - 8) * r, h - 8)

    this.texture.needsUpdate = true
    this.sprite.visible = r > 0 || true
  }

  setVisible(v: boolean): void {
    this.sprite.visible = v
  }

  dispose(): void {
    this.texture.dispose()
    ;(this.sprite.material as THREE.SpriteMaterial).dispose()
  }
}

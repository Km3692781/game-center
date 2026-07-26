import * as THREE from 'three'

export type SpriteFrameId = 'center' | 'leanLeft' | 'leanRight' | 'punch' | 'kick' | 'crash'

const FRAME_ORDER: SpriteFrameId[] = [
  'center', 'leanLeft', 'leanRight', 'punch', 'kick', 'crash',
]

/** Painted rear-view frames — denser than the old stick silhouettes. */
const FRAME_W = 192
const FRAME_H = 240

type RGB = { r: number; g: number; b: number }

/**
 * Runtime rear-view bike+rider atlas (chase-cam angle).
 */
export class SpriteSheet {
  readonly texture: THREE.CanvasTexture
  readonly frameCount = FRAME_ORDER.length
  readonly frameWidth = FRAME_W
  readonly frameHeight = FRAME_H

  private constructor(texture: THREE.CanvasTexture) {
    this.texture = texture
  }

  static create(teamColor: number): SpriteSheet {
    const canvas = document.createElement('canvas')
    canvas.width = FRAME_W * FRAME_ORDER.length
    canvas.height = FRAME_H
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = true
    const team = SpriteSheet.hexToRgb(teamColor)

    FRAME_ORDER.forEach((id, i) => {
      ctx.save()
      ctx.translate(i * FRAME_W, 0)
      ctx.beginPath()
      ctx.rect(0, 0, FRAME_W, FRAME_H)
      ctx.clip()
      SpriteSheet.drawFrame(ctx, id, team)
      ctx.restore()
    })

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.magFilter = THREE.LinearFilter
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.generateMipmaps = true
    texture.needsUpdate = true
    return new SpriteSheet(texture)
  }

  frameIndex(id: SpriteFrameId): number {
    return FRAME_ORDER.indexOf(id)
  }

  applyFrame(material: THREE.SpriteMaterial, id: SpriteFrameId): void {
    const i = this.frameIndex(id)
    if (!material.userData.frameMap) {
      material.userData.frameMap = this.texture.clone()
      material.userData.frameMap.needsUpdate = true
    }
    const map = material.userData.frameMap as THREE.Texture
    map.repeat.set(1 / this.frameCount, 1)
    map.offset.set(i / this.frameCount, 0)
    material.map = map
    material.needsUpdate = true
  }

  private static hexToRgb(hex: number): RGB {
    return { r: (hex >> 16) & 255, g: (hex >> 8) & 255, b: hex & 255 }
  }

  private static rgb(c: RGB, a = 1): string {
    return `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${a})`
  }

  private static shade(c: RGB, mul: number): RGB {
    return {
      r: Math.min(255, Math.max(0, c.r * mul)),
      g: Math.min(255, Math.max(0, c.g * mul)),
      b: Math.min(255, Math.max(0, c.b * mul)),
    }
  }

  private static drawFrame(
    ctx: CanvasRenderingContext2D,
    id: SpriteFrameId,
    team: RGB
  ): void {
    ctx.clearRect(0, 0, FRAME_W, FRAME_H)

    let lean = 0
    let punch = false
    let kick = false
    let wipe = false
    if (id === 'leanLeft') lean = -1
    if (id === 'leanRight') lean = 1
    if (id === 'punch') punch = true
    if (id === 'kick') kick = true
    if (id === 'crash') wipe = true

    const teamDark = SpriteSheet.shade(team, 0.45)
    const teamMid = SpriteSheet.shade(team, 0.8)
    const teamLite = SpriteSheet.shade(team, 1.3)

    ctx.save()
    ctx.translate(FRAME_W / 2 + lean * 14, FRAME_H - 6)
    ctx.rotate(lean * 0.2 + (wipe ? 1.12 : 0))
    ctx.scale(wipe ? 0.9 : 0.88, wipe ? 0.78 : 0.88)

    // Contact shadow
    ctx.fillStyle = 'rgba(0,0,0,0.32)'
    ctx.beginPath()
    ctx.ellipse(0, 4, 48, 10, 0, 0, Math.PI * 2)
    ctx.fill()

    // ===== REAR WHEEL (big, planted) =====
    const tire = ctx.createRadialGradient(-8, -32, 6, 2, -30, 40)
    tire.addColorStop(0, '#5a5a62')
    tire.addColorStop(0.35, '#222228')
    tire.addColorStop(0.75, '#0c0c10')
    tire.addColorStop(1, '#000')
    ctx.fillStyle = tire
    ctx.beginPath()
    ctx.ellipse(0, -30, 40, 34, 0, 0, Math.PI * 2)
    ctx.fill()
    // Sidewall groove
    ctx.strokeStyle = 'rgba(80,80,90,0.7)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.ellipse(0, -30, 34, 28, 0, 0, Math.PI * 2)
    ctx.stroke()
    // Rim
    const rim = ctx.createRadialGradient(-4, -34, 2, 0, -30, 22)
    rim.addColorStop(0, '#d0d4da')
    rim.addColorStop(0.5, '#8a9098')
    rim.addColorStop(1, '#3a3e44')
    ctx.fillStyle = rim
    ctx.beginPath()
    ctx.ellipse(0, -30, 20, 17, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#1c2026'
    ctx.beginPath()
    ctx.ellipse(0, -30, 11, 9, 0, 0, Math.PI * 2)
    ctx.fill()
    // Spokes hint
    ctx.strokeStyle = 'rgba(180,186,194,0.55)'
    ctx.lineWidth = 1.2
    for (let s = 0; s < 6; s++) {
      const a = (s / 6) * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(Math.cos(a) * 3, -30 + Math.sin(a) * 2.5)
      ctx.lineTo(Math.cos(a) * 18, -30 + Math.sin(a) * 15)
      ctx.stroke()
    }
    ctx.fillStyle = '#c8ccd2'
    ctx.beginPath()
    ctx.ellipse(0, -30, 4.5, 3.8, 0, 0, Math.PI * 2)
    ctx.fill()

    // Dual chrome exhausts
    for (const side of [-1, 1] as const) {
      const ex = ctx.createLinearGradient(side * 30, -28, side * 52, -12)
      ex.addColorStop(0, '#eee')
      ex.addColorStop(0.4, '#9aa2aa')
      ex.addColorStop(1, '#4a5058')
      ctx.fillStyle = ex
      ctx.beginPath()
      ctx.ellipse(side * 44, -20, 13, 7, side * 0.25, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#2a2e34'
      ctx.beginPath()
      ctx.ellipse(side * 48, -20, 6, 3.5, side * 0.25, 0, Math.PI * 2)
      ctx.fill()
    }

    // Swingarm
    ctx.strokeStyle = '#2e3238'
    ctx.lineWidth = 7
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(-32, -26)
    ctx.lineTo(-12, -48)
    ctx.moveTo(32, -26)
    ctx.lineTo(12, -48)
    ctx.stroke()
    ctx.strokeStyle = '#6a7078'
    ctx.lineWidth = 2
    ctx.stroke()

    // ===== TAIL FAIRING =====
    const body = ctx.createLinearGradient(-36, -90, 36, -24)
    body.addColorStop(0, SpriteSheet.rgb(teamLite))
    body.addColorStop(0.35, SpriteSheet.rgb(team))
    body.addColorStop(0.7, SpriteSheet.rgb(teamMid))
    body.addColorStop(1, SpriteSheet.rgb(teamDark))
    ctx.fillStyle = body
    ctx.beginPath()
    ctx.moveTo(-32, -38)
    ctx.quadraticCurveTo(-38, -70, -22, -92)
    ctx.lineTo(22, -92)
    ctx.quadraticCurveTo(38, -70, 32, -38)
    ctx.quadraticCurveTo(0, -30, -32, -38)
    ctx.closePath()
    ctx.fill()
    // Panel seam
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(0, -90)
    ctx.lineTo(0, -40)
    ctx.stroke()
    // Highlight
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    ctx.beginPath()
    ctx.ellipse(-10, -72, 10, 18, -0.3, 0, Math.PI * 2)
    ctx.fill()

    // Tail light cluster
    ctx.fillStyle = '#1a0808'
    ctx.beginPath()
    ctx.ellipse(0, -58, 14, 8, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ff1e1e'
    ctx.beginPath()
    ctx.ellipse(0, -58, 11, 6, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,200,160,0.75)'
    ctx.beginPath()
    ctx.ellipse(-2, -60, 5, 2.5, 0, 0, Math.PI * 2)
    ctx.fill()

    // Number plate
    ctx.fillStyle = '#f0f0e8'
    ctx.fillRect(-14, -50, 28, 12)
    ctx.strokeStyle = '#222'
    ctx.lineWidth = 1
    ctx.strokeRect(-14, -50, 28, 12)
    ctx.fillStyle = '#111'
    ctx.font = 'bold 9px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('07', 0, -44)

    // Seat
    const seat = ctx.createLinearGradient(0, -100, 0, -80)
    seat.addColorStop(0, '#4a4650')
    seat.addColorStop(1, '#1a1820')
    ctx.fillStyle = seat
    ctx.beginPath()
    ctx.ellipse(0, -98, 26, 14, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#5a5660'
    ctx.beginPath()
    ctx.ellipse(0, -102, 18, 7, 0, 0, Math.PI * 2)
    ctx.fill()

    // Front tire peek (3/4)
    if (!wipe) {
      ctx.fillStyle = '#0a0a0c'
      ctx.beginPath()
      ctx.ellipse(lean * 8, -52, 12, 10, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#777'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.ellipse(lean * 8, -52, 6, 5, 0, 0, Math.PI * 2)
      ctx.stroke()
    }

    // ===== RIDER (leather racing suit) =====
    const leather = '#2c2a32'
    const leatherLite = '#4a4652'
    const leatherDark = '#16141a'
    const boot = '#0e0e12'

    // Boots
    if (!kick) {
      ctx.fillStyle = boot
      ctx.beginPath()
      ctx.ellipse(-34, -28, 14, 8, -0.2, 0, Math.PI * 2)
      ctx.ellipse(34, -28, 14, 8, 0.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#3a3a42'
      ctx.beginPath()
      ctx.ellipse(-34, -30, 8, 3, -0.2, 0, Math.PI * 2)
      ctx.ellipse(34, -30, 8, 3, 0.2, 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.fillStyle = boot
      ctx.beginPath()
      ctx.ellipse(-34, -28, 14, 8, -0.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = leather
      ctx.lineWidth = 13
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(14, -62)
      ctx.lineTo(54, -42)
      ctx.stroke()
      ctx.fillStyle = boot
      ctx.beginPath()
      ctx.ellipse(58, -40, 15, 9, 0.35, 0, Math.PI * 2)
      ctx.fill()
    }

    // Thighs / lower legs
    ctx.fillStyle = leatherDark
    ctx.beginPath()
    ctx.ellipse(-16, -64, 13, 26, 0.18, 0, Math.PI * 2)
    ctx.ellipse(16, -64, 13, 26, -0.18, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = leather
    ctx.beginPath()
    ctx.ellipse(-14, -70, 9, 16, 0.18, 0, Math.PI * 2)
    ctx.ellipse(14, -70, 9, 16, -0.18, 0, Math.PI * 2)
    ctx.fill()

    // Torso jacket
    const jacket = ctx.createLinearGradient(-34, -150, 34, -90)
    jacket.addColorStop(0, leatherLite)
    jacket.addColorStop(0.45, leather)
    jacket.addColorStop(1, leatherDark)
    ctx.fillStyle = jacket
    ctx.beginPath()
    ctx.moveTo(-32, -96)
    ctx.quadraticCurveTo(-38, -130, -20, -156)
    ctx.lineTo(20, -156)
    ctx.quadraticCurveTo(38, -130, 32, -96)
    ctx.quadraticCurveTo(0, -88, -32, -96)
    ctx.closePath()
    ctx.fill()

    // Team racing stripe
    ctx.fillStyle = SpriteSheet.rgb(teamDark)
    ctx.beginPath()
    if (typeof ctx.roundRect === 'function') ctx.roundRect(-9, -154, 18, 56, 5)
    else ctx.rect(-9, -154, 18, 56)
    ctx.fill()
    ctx.fillStyle = SpriteSheet.rgb(team)
    ctx.fillRect(-5, -152, 10, 50)
    ctx.fillStyle = SpriteSheet.rgb(teamLite, 0.55)
    ctx.fillRect(-2, -150, 4, 44)

    // Shoulder armor
    ctx.fillStyle = leatherDark
    ctx.beginPath()
    ctx.ellipse(-28, -142, 14, 12, -0.45, 0, Math.PI * 2)
    ctx.ellipse(28, -142, 14, 12, 0.45, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = SpriteSheet.rgb(teamMid, 0.85)
    ctx.beginPath()
    ctx.ellipse(-28, -142, 8, 6, -0.45, 0, Math.PI * 2)
    ctx.ellipse(28, -142, 8, 6, 0.45, 0, Math.PI * 2)
    ctx.fill()

    // Arms
    ctx.lineCap = 'round'
    ctx.lineWidth = 12
    if (punch) {
      ctx.strokeStyle = leather
      ctx.beginPath()
      ctx.moveTo(-12, -132)
      ctx.lineTo(-56, -152)
      ctx.stroke()
      ctx.fillStyle = boot
      ctx.beginPath()
      ctx.arc(-58, -154, 9, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = leather
      ctx.beginPath()
      ctx.moveTo(16, -132)
      ctx.lineTo(38, -112)
      ctx.stroke()
      ctx.fillStyle = boot
      ctx.beginPath()
      ctx.arc(40, -110, 8, 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.strokeStyle = leather
      ctx.beginPath()
      ctx.moveTo(-20, -134)
      ctx.lineTo(-42, -112)
      ctx.moveTo(20, -134)
      ctx.lineTo(42, -112)
      ctx.stroke()
      ctx.fillStyle = boot
      ctx.beginPath()
      ctx.arc(-44, -110, 8, 0, Math.PI * 2)
      ctx.arc(44, -110, 8, 0, Math.PI * 2)
      ctx.fill()
    }

    // Clip-ons / bars
    ctx.strokeStyle = '#3a3e44'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(-46, -108)
    ctx.lineTo(46, -108)
    ctx.stroke()
    ctx.strokeStyle = '#8a9098'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(-46, -108)
    ctx.lineTo(46, -108)
    ctx.stroke()
    ctx.fillStyle = '#5a6068'
    ctx.beginPath()
    ctx.arc(-48, -108, 5.5, 0, Math.PI * 2)
    ctx.arc(48, -108, 5.5, 0, Math.PI * 2)
    ctx.fill()
    // Mirrors
    ctx.fillStyle = '#3a3e44'
    ctx.fillRect(-52, -122, 4, 12)
    ctx.fillRect(48, -122, 4, 12)
    const mir = ctx.createLinearGradient(0, -128, 0, -118)
    mir.addColorStop(0, '#c8e0f0')
    mir.addColorStop(1, '#406080')
    ctx.fillStyle = mir
    ctx.beginPath()
    ctx.ellipse(-50, -126, 7, 5, 0, 0, Math.PI * 2)
    ctx.ellipse(50, -126, 7, 5, 0, 0, Math.PI * 2)
    ctx.fill()

    // ===== FULL-FACE HELMET =====
    const hx = wipe ? 12 : lean * 4
    const hy = -178
    const helm = ctx.createRadialGradient(hx - 6, hy - 8, 2, hx, hy, 26)
    helm.addColorStop(0, SpriteSheet.rgb(teamLite))
    helm.addColorStop(0.4, SpriteSheet.rgb(teamMid))
    helm.addColorStop(0.85, SpriteSheet.rgb(teamDark))
    helm.addColorStop(1, '#0a0a0c')
    ctx.fillStyle = helm
    ctx.beginPath()
    ctx.ellipse(hx, hy, 24, 26, 0, 0, Math.PI * 2)
    ctx.fill()
    // Visor
    ctx.fillStyle = 'rgba(12,18,28,0.95)'
    ctx.beginPath()
    ctx.ellipse(hx, hy + 4, 20, 9, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(100,170,220,0.28)'
    ctx.beginPath()
    ctx.ellipse(hx + 3, hy + 2, 12, 4, 0.1, 0, Math.PI * 2)
    ctx.fill()
    // Vent / ridge
    ctx.strokeStyle = SpriteSheet.rgb(teamDark)
    ctx.lineWidth = 3.5
    ctx.beginPath()
    ctx.moveTo(hx, hy - 24)
    ctx.lineTo(hx, hy + 10)
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.15)'
    ctx.beginPath()
    ctx.ellipse(hx - 8, hy - 10, 6, 4, -0.5, 0, Math.PI * 2)
    ctx.fill()
    // Collar / neck
    ctx.fillStyle = leatherDark
    ctx.beginPath()
    ctx.ellipse(hx, hy + 24, 14, 8, 0, 0, Math.PI * 2)
    ctx.fill()

    if (wipe) {
      ctx.fillStyle = 'rgba(255,90,30,0.6)'
      ctx.beginPath()
      ctx.arc(-32, -70, 12, 0, Math.PI * 2)
      ctx.arc(22, -120, 9, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(210,210,210,0.5)'
      ctx.beginPath()
      ctx.ellipse(0, -22, 36, 10, 0.15, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.restore()
  }
}

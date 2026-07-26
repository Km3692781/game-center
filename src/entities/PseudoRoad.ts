import * as THREE from 'three'
import { Track, ROAD_SURFACE_Y } from '@entities/Track'

const SEGMENTS = 80
const BEHIND_T = 0.015
const AHEAD_T = 0.2
const CURVE_BOOST = 1.4

/**
 * Perspective road ribbon rebuilt each frame from the track curve
 * around the player — Road Rash–style segmented asphalt whip.
 */
export class PseudoRoad {
  readonly group: THREE.Group
  private readonly roadMesh: THREE.Mesh
  private readonly stripeMesh: THREE.Mesh
  private readonly leftEdge: THREE.Mesh
  private readonly rightEdge: THREE.Mesh

  private readonly roadPos: Float32Array
  private readonly stripePos: Float32Array
  private readonly leftPos: Float32Array
  private readonly rightPos: Float32Array

  private readonly roadGeo: THREE.BufferGeometry
  private readonly stripeGeo: THREE.BufferGeometry
  private readonly leftGeo: THREE.BufferGeometry
  private readonly rightGeo: THREE.BufferGeometry

  private readonly up = new THREE.Vector3(0, 1, 0)
  private readonly _p = new THREE.Vector3()
  private readonly _t = new THREE.Vector3()
  private readonly _r = new THREE.Vector3()
  private readonly _prevT = new THREE.Vector3()

  constructor() {
    this.group = new THREE.Group()

    const vertCount = (SEGMENTS + 1) * 2
    this.roadPos = new Float32Array(vertCount * 3)
    this.stripePos = new Float32Array(vertCount * 3)
    this.leftPos = new Float32Array(vertCount * 3)
    this.rightPos = new Float32Array(vertCount * 3)

    const indices: number[] = []
    for (let i = 0; i < SEGMENTS; i++) {
      const a = i * 2
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }

    // Dashed center: only odd segments
    const stripeIdx: number[] = []
    for (let i = 0; i < SEGMENTS; i++) {
      if (i % 2 !== 0) continue
      const a = i * 2
      stripeIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }

    this.roadGeo = this.makeGeo(this.roadPos, indices)
    this.stripeGeo = this.makeGeo(this.stripePos, stripeIdx)
    this.leftGeo = this.makeGeo(this.leftPos, indices)
    this.rightGeo = this.makeGeo(this.rightPos, indices)

    this.roadMesh = new THREE.Mesh(
      this.roadGeo,
      new THREE.MeshBasicMaterial({ color: 0x3a3d42, side: THREE.DoubleSide })
    )
    this.stripeMesh = new THREE.Mesh(
      this.stripeGeo,
      new THREE.MeshBasicMaterial({ color: 0xffdd33, side: THREE.DoubleSide })
    )
    this.leftEdge = new THREE.Mesh(
      this.leftGeo,
      new THREE.MeshBasicMaterial({ color: 0xe8e8e0, side: THREE.DoubleSide })
    )
    this.rightEdge = new THREE.Mesh(
      this.rightGeo,
      new THREE.MeshBasicMaterial({ color: 0xe8e8e0, side: THREE.DoubleSide })
    )

    for (const m of [this.roadMesh, this.stripeMesh, this.leftEdge, this.rightEdge]) {
      m.frustumCulled = false
      this.group.add(m)
    }
    this.stripeMesh.position.y = 0.018
    this.leftEdge.position.y = 0.014
    this.rightEdge.position.y = 0.014
  }

  private makeGeo(pos: Float32Array, indices: number[]): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setIndex(indices)
    return geo
  }

  update(track: Track, playerPos: THREE.Vector3): void {
    const curve = track.getCurve()
    const playerT = track.getClosestT(playerPos)
    const half = track.roadHalfWidth
    const y = ROAD_SURFACE_Y + 0.025

    let curveVel = 0
    let curveAcc = 0

    for (let i = 0; i <= SEGMENTS; i++) {
      const u = i / SEGMENTS
      const ease = u * u
      const t = ((playerT - BEHIND_T + (BEHIND_T + AHEAD_T) * ease) % 1 + 1) % 1

      curve.getPointAt(t, this._p)
      curve.getTangentAt(t, this._t).normalize()
      this._r.crossVectors(this._t, this.up).normalize()

      if (i > 0) {
        const cross = this._prevT.x * this._t.z - this._prevT.z * this._t.x
        curveVel += cross * CURVE_BOOST
        curveAcc += curveVel * 0.14
        curveVel *= 0.9
      }
      this._prevT.copy(this._t)

      const whip = curveAcc * (1 - u) * 2.8
      const px = this._p.x + this._r.x * whip
      const pz = this._p.z + this._r.z * whip
      const widthScale = THREE.MathUtils.lerp(1.02, 0.78, ease)
      const hw = half * widthScale

      const li = i * 2
      this.write(this.roadPos, li, px - this._r.x * hw, y, pz - this._r.z * hw)
      this.write(this.roadPos, li + 1, px + this._r.x * hw, y, pz + this._r.z * hw)

      const sh = 0.14
      this.write(this.stripePos, li, px - this._r.x * sh, y, pz - this._r.z * sh)
      this.write(this.stripePos, li + 1, px + this._r.x * sh, y, pz + this._r.z * sh)

      const e0 = hw - 0.25
      const e1 = hw - 0.45
      this.write(this.leftPos, li, px - this._r.x * e0, y, pz - this._r.z * e0)
      this.write(this.leftPos, li + 1, px - this._r.x * e1, y, pz - this._r.z * e1)
      this.write(this.rightPos, li, px + this._r.x * e1, y, pz + this._r.z * e1)
      this.write(this.rightPos, li + 1, px + this._r.x * e0, y, pz + this._r.z * e0)
    }

    ;(this.roadGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
    ;(this.stripeGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
    ;(this.leftGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
    ;(this.rightGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
  }

  private write(arr: Float32Array, index: number, x: number, y: number, z: number): void {
    const o = index * 3
    arr[o] = x
    arr[o + 1] = y
    arr[o + 2] = z
  }

  dispose(): void {
    for (const geo of [this.roadGeo, this.stripeGeo, this.leftGeo, this.rightGeo]) {
      geo.dispose()
    }
    for (const mesh of [this.roadMesh, this.stripeMesh, this.leftEdge, this.rightEdge]) {
      ;(mesh.material as THREE.Material).dispose()
    }
  }
}

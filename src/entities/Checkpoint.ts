import * as THREE from 'three'

export interface CheckpointData {
  position: THREE.Vector3
  width: number
  index: number
}

export class Checkpoint {
  public mesh: THREE.Mesh
  public position: THREE.Vector3
  public width: number
  public index: number
  public triggered: boolean = false

  constructor(data: CheckpointData) {
    this.position = data.position
    this.width = data.width
    this.index = data.index

    const geo = new THREE.BoxGeometry(data.width, 3, 0.5)
    const mat = new THREE.MeshLambertMaterial({
      color: data.index === 0 ? 0x00ff00 : 0xffff00,
      transparent: true,
      opacity: 0.4,
    })
    this.mesh = new THREE.Mesh(geo, mat)
    this.mesh.position.copy(data.position)
    this.mesh.position.y = 1.5
  }

  check(carPosition: THREE.Vector3): boolean {
    if (this.triggered) return false

    const dx = Math.abs(carPosition.x - this.position.x)
    const dz = Math.abs(carPosition.z - this.position.z)

    if (dx < this.width / 2 && dz < 3) {
      this.triggered = true
      this.hide()
      return true
    }

    return false
  }

  reset(): void {
    this.triggered = false
    this.show()
  }

  private hide(): void {
    this.mesh.visible = false
  }

  private show(): void {
    this.mesh.visible = true
  }
}
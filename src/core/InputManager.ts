export interface InputState {
  forward: boolean
  brake: boolean
  left: boolean
  right: boolean
  reset: boolean
}

export class InputManager {
  private keys: Set<string> = new Set()

  constructor() {
    window.addEventListener('keydown', (e) => this.keys.add(e.code))
    window.addEventListener('keyup', (e) => this.keys.delete(e.code))
  }

  getState(): InputState {
    return {
      forward: this.keys.has('ArrowUp') || this.keys.has('KeyW'),
      brake: this.keys.has('ArrowDown') || this.keys.has('KeyS'),
      left: this.keys.has('ArrowLeft') || this.keys.has('KeyA'),
      right: this.keys.has('ArrowRight') || this.keys.has('KeyD'),
      reset: this.keys.has('KeyR'),
    }
  }

  destroy(): void {
    window.removeEventListener('keydown', (e) => this.keys.add(e.code))
    window.removeEventListener('keyup', (e) => this.keys.delete(e.code))
  }
}
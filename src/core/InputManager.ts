export interface InputState {
  forward: boolean
  brake: boolean
  left: boolean
  right: boolean
  reset: boolean
  punch: boolean
  kick: boolean
  pause: boolean
}

export class InputManager {
  private keys: Set<string> = new Set()
  private pausePressed = false
  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (!this.keys.has(e.code)) this.pausePressed = true
      e.preventDefault()
    }
    this.keys.add(e.code)
    if (
      e.code === 'Space' ||
      e.code === 'ArrowUp' ||
      e.code === 'ArrowDown' ||
      e.code === 'ArrowLeft' ||
      e.code === 'ArrowRight'
    ) {
      e.preventDefault()
    }
  }
  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code)
  }

  constructor() {
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
  }

  getState(): InputState {
    return {
      forward: this.keys.has('ArrowUp') || this.keys.has('KeyW'),
      brake: this.keys.has('ArrowDown') || this.keys.has('KeyS'),
      left: this.keys.has('ArrowLeft') || this.keys.has('KeyA'),
      right: this.keys.has('ArrowRight') || this.keys.has('KeyD'),
      reset: this.keys.has('KeyR'),
      punch: this.keys.has('Space') || this.keys.has('KeyF'),
      kick: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.keys.has('KeyE'),
      pause: false,
    }
  }

  /** Edge-triggered pause toggle (P / Esc). */
  consumePauseToggle(): boolean {
    if (!this.pausePressed) return false
    this.pausePressed = false
    return true
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
  }
}

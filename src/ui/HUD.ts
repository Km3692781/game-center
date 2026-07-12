export class HUD {
  private container: HTMLElement
  private speedEl!: HTMLElement
  private lapEl!: HTMLElement
  private timerEl!: HTMLElement
  private bestLapEl!: HTMLElement
  private positionEl!: HTMLElement
  private messageEl!: HTMLElement
  private countdownEl!: HTMLElement

  constructor() {
    this.container = document.getElementById('hud')!
    this.build()
  }

  private build(): void {
    this.container.innerHTML = `
      <div style="
        position: absolute;
        bottom: 32px;
        left: 32px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      ">
        <div id="hud-speed" style="
          font-size: 52px;
          font-weight: bold;
          color: #fff;
          text-shadow: 0 2px 8px rgba(0,0,0,0.9);
          line-height: 1;
        ">0 <span style="font-size: 18px; font-weight: normal;">km/h</span></div>

        <div id="hud-lap" style="
          font-size: 20px;
          color: #ffffffcc;
          text-shadow: 0 2px 6px rgba(0,0,0,0.8);
        ">LAP 1 / 3</div>

        <div id="hud-timer" style="
          font-size: 20px;
          color: #ffffffcc;
          text-shadow: 0 2px 6px rgba(0,0,0,0.8);
        ">00:00.000</div>

        <div id="hud-best" style="
          font-size: 16px;
          color: #aaffaa;
          text-shadow: 0 2px 6px rgba(0,0,0,0.8);
        ">BEST --:--.---</div>
      </div>

      <div id="hud-position" style="
        position: absolute;
        top: 24px;
        left: 32px;
        font-size: 42px;
        font-weight: bold;
        color: #fff;
        text-shadow: 0 2px 10px rgba(0,0,0,0.9);
      ">P1</div>

      <div style="
        position: absolute;
        top: 24px;
        right: 32px;
        font-size: 13px;
        color: #ffffffaa;
        text-align: right;
        line-height: 1.9;
        text-shadow: 0 1px 4px rgba(0,0,0,0.8);
      ">
        W / ↑ &nbsp;&nbsp; Accelerate<br/>
        S / ↓ &nbsp;&nbsp; Brake / Reverse<br/>
        A / ← &nbsp;&nbsp; Steer Left<br/>
        D / → &nbsp;&nbsp; Steer Right<br/>
        R &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Reset Car
      </div>

      <div id="hud-countdown" style="
        position: absolute;
        top: 35%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 120px;
        font-weight: bold;
        color: #fff;
        text-shadow: 0 4px 24px rgba(0,0,0,0.95);
        text-align: center;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.15s ease;
      "></div>

      <div id="hud-message" style="
        position: absolute;
        top: 42%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 38px;
        font-weight: bold;
        color: #fff;
        text-shadow: 0 2px 12px rgba(0,0,0,0.9);
        text-align: center;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.2s ease;
      "></div>
    `

    this.speedEl = document.getElementById('hud-speed')!
    this.lapEl = document.getElementById('hud-lap')!
    this.timerEl = document.getElementById('hud-timer')!
    this.bestLapEl = document.getElementById('hud-best')!
    this.positionEl = document.getElementById('hud-position')!
    this.messageEl = document.getElementById('hud-message')!
    this.countdownEl = document.getElementById('hud-countdown')!
  }

  updateSpeed(kmh: number): void {
    this.speedEl.innerHTML = `${Math.round(kmh)} <span style="font-size: 18px; font-weight: normal;">km/h</span>`
  }

  updateLap(current: number, total: number): void {
    this.lapEl.textContent = `LAP ${current} / ${total}`
  }

  updateTimer(ms: number): void {
    this.timerEl.textContent = this.formatTime(ms)
  }

  updateBestLap(ms: number | null): void {
    this.bestLapEl.textContent = ms === null ? 'BEST --:--.---' : `BEST ${this.formatTime(ms)}`
  }

  updatePosition(pos: number, total: number): void {
    this.positionEl.textContent = `P${pos}/${total}`
  }

  showCountdown(n: number): void {
    this.countdownEl.textContent = n === 0 ? 'GO!' : String(n)
    this.countdownEl.style.color = n === 0 ? '#00ff88' : '#ffffff'
    this.countdownEl.style.opacity = '1'
    setTimeout(() => {
      this.countdownEl.style.opacity = '0'
    }, n === 0 ? 800 : 700)
  }

  showMessage(text: string, durationMs: number = 2000): void {
    this.messageEl.textContent = text
    this.messageEl.style.opacity = '1'
    setTimeout(() => {
      this.messageEl.style.opacity = '0'
    }, durationMs)
  }

  private formatTime(ms: number): string {
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    const millis = ms % 1000
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
  }
}
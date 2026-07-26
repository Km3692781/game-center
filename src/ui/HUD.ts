export class HUD {
  private container: HTMLElement
  private speedEl!: HTMLElement
  private lapEl!: HTMLElement
  private timerEl!: HTMLElement
  private bestLapEl!: HTMLElement
  private positionEl!: HTMLElement
  private messageEl!: HTMLElement
  private countdownEl!: HTMLElement
  private crashEl!: HTMLElement
  private pauseEl!: HTMLElement
  private reverseEl!: HTMLElement
  private healthFillEl!: HTMLElement
  private arrestedEl!: HTMLElement

  constructor() {
    this.container = document.getElementById('hud')!
    this.build()
  }

  private build(): void {
    this.container.innerHTML = `
      <div style="
        position:absolute; bottom:32px; left:32px;
        display:flex; flex-direction:column; gap:5px;
        font-family:'Courier New',monospace;
      ">
        <div id="hud-speed" style="
          font-size:54px; font-weight:900; color:#fff;
          text-shadow:0 2px 12px rgba(0,0,0,0.95);
          line-height:1; letter-spacing:-1px;
        ">0 <span style="font-size:17px;font-weight:400">km/h</span></div>
        <div id="hud-lap" style="
          font-size:19px; color:#ffffffcc;
          text-shadow:0 1px 6px rgba(0,0,0,0.9);
        ">LAP 1 / 3</div>
        <div id="hud-timer" style="
          font-size:19px; color:#ffffffcc;
          text-shadow:0 1px 6px rgba(0,0,0,0.9);
        ">00:00.000</div>
        <div id="hud-best" style="
          font-size:15px; color:#aaffaa;
          text-shadow:0 1px 6px rgba(0,0,0,0.9);
        ">BEST --:--.---</div>
        <div style="margin-top:6px;">
          <div style="font-size:12px;color:#ffffffaa;margin-bottom:3px;
            text-shadow:0 1px 4px rgba(0,0,0,0.8);">HEALTH</div>
          <div style="width:180px;height:14px;background:rgba(0,0,0,0.65);
            border:1px solid rgba(255,255,255,0.55);">
            <div id="hud-health-fill" style="
              width:100%;height:100%;background:#2ecc71;
              transition:width 0.12s linear, background 0.12s linear;
            "></div>
          </div>
        </div>
      </div>

      <div id="hud-position" style="
        position:absolute; top:24px; left:32px;
        font-family:'Courier New',monospace;
        font-size:44px; font-weight:900; color:#fff;
        text-shadow:0 2px 10px rgba(0,0,0,0.95);
      ">P1</div>

      <div style="
        position:absolute; top:24px; right:32px;
        font-family:'Courier New',monospace;
        font-size:12px; color:#ffffffaa;
        text-align:right; line-height:1.85;
        text-shadow:0 1px 4px rgba(0,0,0,0.8);
      ">
        W / ↑ &nbsp; Accelerate<br/>
        S / ↓ &nbsp; Brake<br/>
        A / ← &nbsp; Steer Left<br/>
        D / → &nbsp; Steer Right<br/>
        SPACE / F &nbsp; Punch (club)<br/>
        SHIFT / E &nbsp; Kick<br/>
        R &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Respawn<br/>
        P / Esc &nbsp;&nbsp; Pause
      </div>

      <div id="hud-countdown" style="
        position:absolute; top:32%; left:50%;
        transform:translate(-50%,-50%);
        font-family:'Courier New',monospace;
        font-size:130px; font-weight:900; color:#fff;
        text-shadow:0 4px 32px rgba(0,0,0,0.98);
        text-align:center; pointer-events:none;
        opacity:0; transition:opacity 0.12s ease;
      "></div>

      <div id="hud-message" style="
        position:absolute; top:40%; left:50%;
        transform:translate(-50%,-50%);
        font-family:'Courier New',monospace;
        font-size:36px; font-weight:700; color:#fff;
        text-shadow:0 2px 16px rgba(0,0,0,0.95);
        text-align:center; pointer-events:none;
        opacity:0; transition:opacity 0.2s ease;
      "></div>

      <div id="hud-reverse" style="
        position:absolute; top:18%; left:50%;
        transform:translate(-50%,-50%);
        font-family:'Courier New',monospace;
        font-size:42px; font-weight:900; color:#ff2244;
        letter-spacing:4px;
        text-shadow:0 2px 18px rgba(0,0,0,0.98);
        text-align:center; pointer-events:none;
        opacity:0; transition:opacity 0.15s ease;
      ">WRONG WAY</div>

      <div id="hud-pause" style="
        position:absolute; inset:0;
        background:rgba(0,0,0,0.55);
        display:flex; flex-direction:column;
        align-items:center; justify-content:center;
        font-family:'Courier New',monospace;
        pointer-events:none;
        opacity:0; transition:opacity 0.15s ease;
      ">
        <div style="font-size:64px;font-weight:900;color:#fff;
          text-shadow:0 4px 24px rgba(0,0,0,0.9);">PAUSED</div>
        <div style="font-size:18px;color:#ffffffcc;margin-top:14px;
          text-shadow:0 2px 10px rgba(0,0,0,0.9);">Press P or Esc to resume</div>
      </div>

      <div id="hud-crash" style="
        position:absolute; top:50%; left:50%;
        transform:translate(-50%,-50%);
        font-family:'Courier New',monospace;
        text-align:center; pointer-events:none;
        opacity:0; transition:opacity 0.3s ease;
      ">
        <div style="font-size:42px;font-weight:900;color:#ff3300;
          text-shadow:0 2px 20px rgba(0,0,0,0.98);">CRASHED!</div>
        <div style="font-size:22px;color:#fff;margin-top:12px;
          text-shadow:0 2px 10px rgba(0,0,0,0.9);">Press R to get up — cops will bust you if you stay down!</div>
      </div>

      <div id="hud-arrested" style="
        position:absolute; inset:0;
        background:rgba(0,10,40,0.72);
        display:flex; flex-direction:column;
        align-items:center; justify-content:center;
        font-family:'Courier New',monospace;
        pointer-events:none;
        opacity:0; transition:opacity 0.25s ease;
      ">
        <div style="font-size:56px;font-weight:900;color:#4da3ff;
          text-shadow:0 4px 24px rgba(0,0,0,0.95);">ARRESTED!</div>
        <div style="font-size:20px;color:#ffffffcc;margin-top:14px;
          text-shadow:0 2px 10px rgba(0,0,0,0.9);">Busted by the police — GAME OVER</div>
      </div>
    `

    this.speedEl = document.getElementById('hud-speed')!
    this.lapEl = document.getElementById('hud-lap')!
    this.timerEl = document.getElementById('hud-timer')!
    this.bestLapEl = document.getElementById('hud-best')!
    this.positionEl = document.getElementById('hud-position')!
    this.messageEl = document.getElementById('hud-message')!
    this.countdownEl = document.getElementById('hud-countdown')!
    this.crashEl = document.getElementById('hud-crash')!
    this.pauseEl = document.getElementById('hud-pause')!
    this.reverseEl = document.getElementById('hud-reverse')!
    this.healthFillEl = document.getElementById('hud-health-fill')!
    this.arrestedEl = document.getElementById('hud-arrested')!
  }

  updateSpeed(kmh: number): void {
    this.speedEl.innerHTML = `${Math.round(kmh)} <span style="font-size:17px;font-weight:400">km/h</span>`
  }

  updateLap(current: number, total: number): void {
    this.lapEl.textContent = `LAP ${current} / ${total}`
  }

  updateTimer(ms: number): void {
    this.timerEl.textContent = this.formatTime(ms)
  }

  updateBestLap(ms: number | null): void {
    this.bestLapEl.textContent = ms === null
      ? 'BEST --:--.---'
      : `BEST ${this.formatTime(ms)}`
  }

  updatePosition(pos: number, total: number): void {
    this.positionEl.textContent = `P${pos}/${total}`
  }

  updateHealth(ratio: number): void {
    const r = Math.max(0, Math.min(1, ratio))
    this.healthFillEl.style.width = `${r * 100}%`
    this.healthFillEl.style.background =
      r > 0.45 ? '#2ecc71' : r > 0.2 ? '#f1c40f' : '#e74c3c'
  }

  showCrash(visible: boolean): void {
    this.crashEl.style.opacity = visible ? '1' : '0'
  }

  showArrested(visible: boolean): void {
    this.arrestedEl.style.opacity = visible ? '1' : '0'
  }

  showPause(visible: boolean): void {
    this.pauseEl.style.opacity = visible ? '1' : '0'
  }

  showReverse(visible: boolean): void {
    this.reverseEl.style.opacity = visible ? '1' : '0'
  }

  showCountdown(n: number): void {
    this.countdownEl.textContent = n === 0 ? 'GO!' : String(n)
    this.countdownEl.style.color = n === 0 ? '#00ff88' : '#ffffff'
    this.countdownEl.style.opacity = '1'
    setTimeout(() => { this.countdownEl.style.opacity = '0' }, n === 0 ? 900 : 750)
  }

  showMessage(text: string, durationMs: number = 2000): void {
    this.messageEl.textContent = text
    this.messageEl.style.opacity = '1'
    setTimeout(() => { this.messageEl.style.opacity = '0' }, durationMs)
  }

  private formatTime(ms: number): string {
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    const millis = Math.floor(ms % 1000)
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
  }
}

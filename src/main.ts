import { Engine } from '@core/Engine'

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement

if (!canvas) {
  throw new Error('Canvas element #game-canvas not found in DOM')
}

const engine = new Engine(canvas)

engine.init().then(() => {
  engine.start()
  ;(window as unknown as { __engine: Engine }).__engine = engine
}).catch((err: unknown) => {
  console.error('Failed to initialize game engine:', err)
})
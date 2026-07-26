import * as THREE from 'three'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'

export class Renderer {
  public scene: THREE.Scene
  public camera: THREE.PerspectiveCamera
  public envMap!: THREE.Texture
  private renderer: THREE.WebGLRenderer
  private sunLight!: THREE.DirectionalLight
  private pmrem!: THREE.PMREMGenerator

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene()

    this.camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.1,
      2800
    )

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    this.pmrem = new THREE.PMREMGenerator(this.renderer)
    this.pmrem.compileEquirectangularShader()

    this.loadFallbackSky()
    this.setupLights()
    this.setupResizeHandler()
  }

  /** Outdoor noon sky as background + IBL for vehicles. */
  async initEnvironment(): Promise<void> {
    try {
      const hdr = await new RGBELoader().loadAsync('/assets/textures/hdri/sky.hdr')
      hdr.mapping = THREE.EquirectangularReflectionMapping
      this.scene.background = hdr

      const env = this.pmrem.fromEquirectangular(hdr).texture
      this.scene.environment = env
      this.envMap = env
      this.scene.fog = new THREE.FogExp2(0xb7c8d8, 0.0009)
    } catch (err) {
      console.warn('Outdoor HDRI failed, trying studio:', err)
      try {
        const hdr = await new RGBELoader().loadAsync('/assets/textures/hdri/studio.hdr')
        const env = this.pmrem.fromEquirectangular(hdr).texture
        hdr.dispose()
        this.scene.environment = env
        this.envMap = env
      } catch (err2) {
        console.warn('HDRI env load failed:', err2)
      }
    }
  }

  private loadFallbackSky(): void {
    const loader = new THREE.CubeTextureLoader()
    loader.setPath('/assets/textures/skybox/')
    const cubeMap = loader.load([
      'posx.jpg', 'negx.jpg',
      'posy.jpg', 'negy.jpg',
      'posz.jpg', 'negz.jpg',
    ])
    cubeMap.colorSpace = THREE.SRGBColorSpace
    this.scene.background = cubeMap
    this.scene.environment = cubeMap
    this.envMap = cubeMap
    this.scene.fog = new THREE.FogExp2(0x9bb0c4, 0.0011)
  }

  private setupLights(): void {
    const ambient = new THREE.AmbientLight(0xd8e4f2, 0.4)
    this.scene.add(ambient)

    const hemi = new THREE.HemisphereLight(0xc5d8f0, 0x4a5c32, 0.7)
    this.scene.add(hemi)

    this.sunLight = new THREE.DirectionalLight(0xfff1d6, 2.4)
    this.sunLight.position.set(140, 200, 90)
    this.sunLight.castShadow = true
    this.sunLight.shadow.mapSize.width = 4096
    this.sunLight.shadow.mapSize.height = 4096
    this.sunLight.shadow.camera.near = 1
    this.sunLight.shadow.camera.far = 700
    this.sunLight.shadow.camera.left = -140
    this.sunLight.shadow.camera.right = 140
    this.sunLight.shadow.camera.top = 140
    this.sunLight.shadow.camera.bottom = -140
    this.sunLight.shadow.bias = -0.00015
    this.sunLight.shadow.normalBias = 0.035
    this.scene.add(this.sunLight)

    const fill = new THREE.DirectionalLight(0xa8c0e0, 0.45)
    fill.position.set(-100, 60, -70)
    this.scene.add(fill)
  }

  followTarget(position: THREE.Vector3): void {
    this.sunLight.target.position.copy(position)
    this.sunLight.target.updateMatrixWorld()
    this.sunLight.position.set(
      position.x + 100,
      position.y + 180,
      position.z + 60
    )
  }

  private setupResizeHandler(): void {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight
      this.camera.updateProjectionMatrix()
      this.renderer.setSize(window.innerWidth, window.innerHeight)
    })
  }

  render(): void {
    this.renderer.render(this.scene, this.camera)
  }

  destroy(): void {
    this.pmrem.dispose()
    this.renderer.dispose()
  }
}

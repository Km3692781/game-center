import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'

export class AssetLoader {
  private gltfLoader: GLTFLoader
  private fbxLoader: FBXLoader
  private objLoader: OBJLoader
  private textureLoader: THREE.TextureLoader
  private cache: Map<string, THREE.Object3D | THREE.Texture> = new Map()

  constructor() {
    const draco = new DRACOLoader()
    draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/')

    this.gltfLoader = new GLTFLoader()
    this.gltfLoader.setDRACOLoader(draco)
    this.fbxLoader = new FBXLoader()
    this.objLoader = new OBJLoader()
    this.textureLoader = new THREE.TextureLoader()
  }

  async loadModel(path: string): Promise<THREE.Object3D> {
    if (this.cache.has(path)) {
      return (this.cache.get(path) as THREE.Object3D).clone(true)
    }

    const lower = path.toLowerCase()
    let root: THREE.Object3D

    if (lower.endsWith('.fbx')) {
      root = await this.fbxLoader.loadAsync(path)
    } else if (lower.endsWith('.obj')) {
      root = await this.objLoader.loadAsync(path)
    } else {
      const gltf = await this.gltfLoader.loadAsync(path)
      root = gltf.scene
    }

    root.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((m) => m.clone())
      } else if (mesh.material) {
        mesh.material = mesh.material.clone()
      }
    })

    this.cache.set(path, root)
    return root.clone(true)
  }

  async preloadModel(path: string): Promise<void> {
    if (this.cache.has(path)) return
    await this.loadModel(path)
  }

  hasModel(path: string): boolean {
    return this.cache.has(path)
  }

  cloneModel(path: string): THREE.Object3D | null {
    const cached = this.cache.get(path)
    if (!cached || !(cached instanceof THREE.Object3D)) return null
    return cached.clone(true)
  }

  async loadTexture(path: string): Promise<THREE.Texture> {
    if (this.cache.has(path)) {
      return this.cache.get(path) as THREE.Texture
    }

    return new Promise((resolve, reject) => {
      this.textureLoader.load(
        path,
        (texture) => {
          this.cache.set(path, texture)
          resolve(texture)
        },
        undefined,
        reject
      )
    })
  }

  dispose(): void {
    this.cache.clear()
  }
}

/** Shared loader instance for gameplay systems. */
export const assets = new AssetLoader()

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'

export class AssetLoader {
  private gltfLoader: GLTFLoader
  private textureLoader: THREE.TextureLoader
  private cache: Map<string, THREE.Object3D | THREE.Texture> = new Map()

  constructor() {
    const draco = new DRACOLoader()
    draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/')

    this.gltfLoader = new GLTFLoader()
    this.gltfLoader.setDRACOLoader(draco)

    this.textureLoader = new THREE.TextureLoader()
  }

  async loadModel(path: string): Promise<THREE.Object3D> {
    if (this.cache.has(path)) {
      return (this.cache.get(path) as THREE.Object3D).clone()
    }

    return new Promise((resolve, reject) => {
      this.gltfLoader.load(
        path,
        (gltf) => {
          gltf.scene.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              child.castShadow = true
              child.receiveShadow = true
            }
          })
          this.cache.set(path, gltf.scene)
          resolve(gltf.scene.clone())
        },
        undefined,
        reject
      )
    })
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
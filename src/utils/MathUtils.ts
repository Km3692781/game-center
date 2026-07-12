import * as THREE from 'three'

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function degToRad(degrees: number): number {
  return degrees * (Math.PI / 180)
}

export function radToDeg(radians: number): number {
  return radians * (180 / Math.PI)
}

export function rapierVectorToThree(v: { x: number; y: number; z: number }): THREE.Vector3 {
  return new THREE.Vector3(v.x, v.y, v.z)
}

export function threeVectorToRapier(v: THREE.Vector3): { x: number; y: number; z: number } {
  return { x: v.x, y: v.y, z: v.z }
}
import RAPIER from '@dimforge/rapier3d-compat'

export class Physics {
  public world!: RAPIER.World

  async init(): Promise<void> {
    await RAPIER.init()
    this.world = new RAPIER.World({ x: 0.0, y: -9.81, z: 0.0 })
  }

  step(deltaTime: number): void {
    this.world.timestep = Math.min(deltaTime, 0.05)
    this.world.step()
  }

  createGroundCollider(width: number, depth: number): RAPIER.Collider {
    const bodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(0, 0, 0)
    const body = this.world.createRigidBody(bodyDesc)
    const colliderDesc = RAPIER.ColliderDesc.cuboid(width / 2, 0.1, depth / 2)
    return this.world.createCollider(colliderDesc, body)
  }

  createBoxBody(
    width: number,
    height: number,
    depth: number,
    position: { x: number; y: number; z: number },
    mass: number,
    options?: { sensor?: boolean; lockRotationsXZ?: boolean }
  ): RAPIER.RigidBody {
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setLinearDamping(0.15)
      .setAngularDamping(1.2)
      .setCcdEnabled(true)
    if (options?.lockRotationsXZ) {
      bodyDesc.enabledRotations(false, true, false)
    }
    const body = this.world.createRigidBody(bodyDesc)
    // mass ≈ density * volume; set mass explicitly for predictable feel
    const volume = width * height * depth
    const density = mass / Math.max(volume, 0.01)
    const colliderDesc = RAPIER.ColliderDesc.cuboid(width / 2, height / 2, depth / 2)
      .setDensity(density)
      .setFriction(0.9)
      .setRestitution(0.05)
    if (options?.sensor) {
      colliderDesc.setSensor(true)
    }
    this.world.createCollider(colliderDesc, body)
    return body
  }

  destroy(): void {
    this.world.free()
  }
}
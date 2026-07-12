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
    const body = this.world.createRigidBody(bodyDesc)
    const colliderDesc = RAPIER.ColliderDesc.cuboid(width / 2, 0.1, depth / 2)
    return this.world.createCollider(colliderDesc, body)
  }

  createBoxBody(
    width: number,
    height: number,
    depth: number,
    position: { x: number; y: number; z: number },
    mass: number
  ): RAPIER.RigidBody {
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setLinearDamping(0.5)
      .setAngularDamping(0.5)
    const body = this.world.createRigidBody(bodyDesc)
    const colliderDesc = RAPIER.ColliderDesc.cuboid(width / 2, height / 2, depth / 2)
      .setDensity(mass)
      .setFriction(0.3)
      .setRestitution(0.1)
    this.world.createCollider(colliderDesc, body)
    return body
  }

  destroy(): void {
    this.world.free()
  }
}
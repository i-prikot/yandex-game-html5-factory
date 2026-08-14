import { Vector3 } from "@babylonjs/core/Maths/math.vector";

export interface KinematicBody {
  position: Vector3;
  velocity: Vector3;
  radius: number;
}

export class SimplePhysics3D {
  public constructor(
    private readonly gravity = -18,
    private readonly groundY = 0.6,
  ) {}

  public step(body: KinematicBody, deltaSeconds: number): void {
    body.velocity.y += this.gravity * deltaSeconds;
    body.position.addInPlace(body.velocity.scale(deltaSeconds));
    if (body.position.y < this.groundY) {
      body.position.y = this.groundY;
      body.velocity.y = 0;
    }
  }

  public intersects(left: KinematicBody, right: KinematicBody): boolean {
    return Vector3.DistanceSquared(left.position, right.position) < (left.radius + right.radius) ** 2;
  }
}

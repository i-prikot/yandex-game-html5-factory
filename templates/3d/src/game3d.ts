import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

import { gameLog } from "./logger";
import { SimplePhysics3D } from "./physics3d";

export async function createGame(scene: Scene, canvas: HTMLCanvasElement): Promise<void> {
  const quality: string = "{{GAME_QUALITY}}";
  gameLog("info", "Initializing 3D runner scene", { quality });
  scene.clearColor.set(0.06, 0.1, 0.13, 1);
  const camera = new ArcRotateCamera("camera", -Math.PI / 2, 1.05, 13, new Vector3(0, 1, 7), scene);
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 8;
  camera.upperRadiusLimit = 18;

  const ambient = new HemisphericLight("ambient", new Vector3(0, 1, 0), scene);
  ambient.intensity = 0.75;
  const sun = new DirectionalLight("sun", new Vector3(-0.4, -1, 0.2), scene);
  sun.intensity = quality === "LOW" ? 0.35 : 0.7;

  const ground = MeshBuilder.CreateGround("ground", { width: 14, height: 80, subdivisions: 1 }, scene);
  ground.position.z = 26;
  const groundMaterial = new StandardMaterial("ground-material", scene);
  groundMaterial.diffuseColor = Color3.FromHexString("#28574b");
  ground.material = groundMaterial;

  const player = MeshBuilder.CreateBox("player", { width: 1.3, height: 1.2, depth: 1.8 }, scene);
  player.position.set(0, 0.6, 2);
  const playerMaterial = new StandardMaterial("player-material", scene);
  playerMaterial.diffuseColor = Color3.FromHexString("#f0c94a");
  player.material = playerMaterial;

  const obstacleMaterial = new StandardMaterial("obstacle-material", scene);
  obstacleMaterial.diffuseColor = Color3.FromHexString("#d75355");
  const obstacles: Mesh[] = [];
  for (let index = 0; index < 12; index += 1) {
    const obstacle = MeshBuilder.CreateBox(`obstacle-${index}`, { size: 1.4 }, scene);
    obstacle.position.set(((index * 7) % 3 - 1) * 3.2, 0.7, 9 + index * 5.2);
    obstacle.material = obstacleMaterial;
    obstacles.push(obstacle);
  }

  const physics = new SimplePhysics3D();
  const playerBody = { position: player.position, velocity: Vector3.Zero(), radius: 0.75 };
  const keys = new Set<string>();
  window.addEventListener("keydown", (event) => keys.add(event.code));
  window.addEventListener("keyup", (event) => keys.delete(event.code));
  scene.onBeforeRenderObservable.add(() => {
    const deltaSeconds = Math.min(scene.getEngine().getDeltaTime() / 1_000, 0.05);
    const horizontal = Number(keys.has("ArrowRight") || keys.has("KeyD"))
      - Number(keys.has("ArrowLeft") || keys.has("KeyA"));
    player.position.x = Math.max(-4.2, Math.min(4.2, player.position.x + horizontal * deltaSeconds * 7));
    if ((keys.has("Space") || keys.has("ArrowUp")) && player.position.y <= 0.61) playerBody.velocity.y = 7;
    physics.step(playerBody, deltaSeconds);
    for (const obstacle of obstacles) {
      obstacle.position.z -= deltaSeconds * 7;
      if (obstacle.position.z < -4) obstacle.position.z += 62.4;
      if (physics.intersects(playerBody, { position: obstacle.position, velocity: Vector3.Zero(), radius: 0.7 })) {
        obstacle.position.z += 12;
      }
    }
    camera.target.set(player.position.x * 0.25, 1, 7);
  });
}

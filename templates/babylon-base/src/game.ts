import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";

import { gameLog } from "./logger";

export async function createGame(scene: Scene, canvas: HTMLCanvasElement): Promise<void> {
  gameLog("info", "Initializing default Babylon scene");
  const camera = new ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 3, 9, Vector3.Zero(), scene);
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 5;
  camera.upperRadiusLimit = 14;

  const light = new HemisphericLight("ambient", new Vector3(0, 1, 0), scene);
  light.intensity = 0.9;

  const ground = MeshBuilder.CreateGround("ground", { width: 12, height: 12, subdivisions: 1 }, scene);
  const groundMaterial = new StandardMaterial("ground-material", scene);
  groundMaterial.diffuseColor = Color3.FromHexString("#295f48");
  ground.material = groundMaterial;

  const player = MeshBuilder.CreateBox("player", { size: 1.2 }, scene);
  player.position.y = 0.6;
  const playerMaterial = new StandardMaterial("player-material", scene);
  playerMaterial.diffuseColor = Color3.FromHexString("#f0c94a");
  player.material = playerMaterial;
}

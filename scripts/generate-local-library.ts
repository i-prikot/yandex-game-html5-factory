import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { PNG } from "pngjs";

interface NodeSpec {
  name: string;
  scale?: [number, number, number];
  translation?: [number, number, number];
}

const root = process.cwd();

function align4(value: number): number {
  return (value + 3) & ~3;
}

function createGlb(nodes: readonly NodeSpec[]): Buffer {
  const positions = new Float32Array([
    -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5,
    -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
  ]);
  const indices = new Uint16Array([
    0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1,
    3, 2, 6, 3, 6, 7, 1, 5, 6, 1, 6, 2, 0, 3, 7, 0, 7, 4,
  ]);
  const positionBytes = Buffer.from(positions.buffer);
  const indexOffset = align4(positionBytes.length);
  const binaryLength = align4(indexOffset + indices.byteLength);
  const binary = Buffer.alloc(binaryLength);
  positionBytes.copy(binary, 0);
  Buffer.from(indices.buffer).copy(binary, indexOffset);

  const gltf = {
    asset: { version: "2.0", generator: "Yandex Games AI Factory local library" },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, index) => index) }],
    nodes: nodes.map((node) => ({ name: node.name, mesh: 0, scale: node.scale, translation: node.translation })),
    meshes: [{
      primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }],
    }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.36, 0.68, 0.88, 1], metallicFactor: 0, roughnessFactor: 0.8 } }],
    buffers: [{ byteLength: binary.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength, target: 34962 },
      { buffer: 0, byteOffset: indexOffset, byteLength: indices.byteLength, target: 34963 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 8, type: "VEC3", min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] },
      { bufferView: 1, componentType: 5123, count: indices.length, type: "SCALAR", min: [0], max: [7] },
    ],
  };

  const json = Buffer.from(JSON.stringify(gltf), "utf8");
  const jsonLength = align4(json.length);
  const jsonChunk = Buffer.alloc(jsonLength, 0x20);
  json.copy(jsonChunk);
  const totalLength = 12 + 8 + jsonChunk.length + 8 + binary.length;
  const output = Buffer.alloc(totalLength);
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(totalLength, 8);
  output.writeUInt32LE(jsonChunk.length, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  jsonChunk.copy(output, 20);
  const binaryHeader = 20 + jsonChunk.length;
  output.writeUInt32LE(binary.length, binaryHeader);
  output.writeUInt32LE(0x004e4942, binaryHeader + 4);
  binary.copy(output, binaryHeader + 8);
  return output;
}

function createTexture(kind: string): Buffer {
  const png = new PNG({ width: 512, height: 512 });
  const palette: Record<string, [number, number, number]> = {
    grass: [56, 132, 70],
    stone: [118, 126, 132],
    metal: [104, 125, 142],
    wood: [132, 82, 45],
  };
  const base = palette[kind] ?? [128, 128, 128];
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const index = (y * png.width + x) * 4;
      const variation = ((x * 13 + y * 7 + (x ^ y)) % 31) - 15;
      png.data[index] = Math.max(0, Math.min(255, base[0] + variation));
      png.data[index + 1] = Math.max(0, Math.min(255, base[1] + variation));
      png.data[index + 2] = Math.max(0, Math.min(255, base[2] + variation));
      png.data[index + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

const models: Record<string, readonly NodeSpec[]> = {
  cube: [{ name: "Cube" }],
  sphere: [{ name: "LowPolyOrb", scale: [1, 1, 1] }],
  car: [
    { name: "Body", scale: [1.8, 0.45, 0.9], translation: [0, 0.45, 0] },
    { name: "Cabin", scale: [0.9, 0.4, 0.72], translation: [-0.1, 0.85, 0] },
    { name: "WheelFL", scale: [0.32, 0.32, 0.18], translation: [0.6, 0.2, 0.52] },
    { name: "WheelFR", scale: [0.32, 0.32, 0.18], translation: [0.6, 0.2, -0.52] },
    { name: "WheelBL", scale: [0.32, 0.32, 0.18], translation: [-0.6, 0.2, 0.52] },
    { name: "WheelBR", scale: [0.32, 0.32, 0.18], translation: [-0.6, 0.2, -0.52] },
  ],
  character: [
    { name: "Torso", scale: [0.65, 0.9, 0.35], translation: [0, 1.25, 0] },
    { name: "Head", scale: [0.5, 0.5, 0.5], translation: [0, 2, 0] },
    { name: "ArmL", scale: [0.22, 0.85, 0.22], translation: [-0.52, 1.3, 0] },
    { name: "ArmR", scale: [0.22, 0.85, 0.22], translation: [0.52, 1.3, 0] },
    { name: "LegL", scale: [0.28, 0.95, 0.3], translation: [-0.2, 0.35, 0] },
    { name: "LegR", scale: [0.28, 0.95, 0.3], translation: [0.2, 0.35, 0] },
  ],
};

for (const [name, nodes] of Object.entries(models)) {
  const outputPath = join(root, "assets", "library", "models", `${name}.glb`);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, createGlb(nodes));
  console.log(JSON.stringify({ level: "info", scope: "local-library-generator", asset: name, outputPath }));
}

for (const name of ["grass", "stone", "metal", "wood"]) {
  const outputPath = join(root, "assets", "library", "textures", `${name}.png`);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, createTexture(name));
  console.log(JSON.stringify({ level: "info", scope: "local-library-generator", asset: name, outputPath }));
}

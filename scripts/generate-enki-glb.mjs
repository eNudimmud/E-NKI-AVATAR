import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

class NodeFileReader {
  result = null;
  error = null;
  onloadend = null;
  onerror = null;

  async readAsArrayBuffer(blob) {
    try {
      this.result = await blob.arrayBuffer();
      this.onloadend?.();
    } catch (error) {
      this.error = error;
      this.onerror?.(error);
    }
  }

  async readAsDataURL(blob) {
    try {
      const data = Buffer.from(await blob.arrayBuffer()).toString("base64");
      this.result = `data:${blob.type};base64,${data}`;
      this.onloadend?.();
    } catch (error) {
      this.error = error;
      this.onerror?.(error);
    }
  }
}

globalThis.FileReader ??= NodeFileReader;

const material = (name, color, roughness = 0.76, metalness = 0.02, emissive = 0x000000) => {
  const result = new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive });
  result.name = name;
  return result;
};

const fur = material("Fur_OffWhite", 0xe6dfce, 0.97);
const muzzleMaterial = material("Muzzle_OffWhite", 0xf0eadb, 0.98);
const innerEarMaterial = material("InnerEar_Rose", 0x9e695f, 0.9);
const mustard = material("Parka_Mustard", 0xb77a24, 0.88);
const red = material("Hoodie_DeepRed", 0x771d24, 0.82);
const olive = material("Cargo_Olive", 0x4e5034, 0.9);
const purple = material("Accent_DarkPurple", 0x2b203f, 0.75);
const dark = material("Mechanical_Dark", 0x171719, 0.72, 0.2);
const sclera = material("Eye_Sclera", 0xddd8c9, 0.45);
const mouthMaterial = material("Mouth_Interior", 0x281316, 0.84);
const noseMaterial = material("Nose", 0x2e2524, 0.58);

function mesh(name, geometry, meshMaterial) {
  const result = new THREE.Mesh(geometry, meshMaterial);
  result.name = name;
  result.castShadow = true;
  return result;
}

function createEye(side, x, irisColor) {
  const eye = new THREE.Group();
  eye.name = `Eye_${side}`;
  eye.position.set(x, 1.79, 0.585);
  const globe = mesh(`EyeGlobe_${side}`, new THREE.SphereGeometry(0.16, 28, 18), sclera);
  globe.scale.set(1, 0.78, 0.48);
  const irisMaterial = material(`Iris_${side}`, irisColor, 0.22, 0.02, irisColor);
  irisMaterial.emissiveIntensity = 0.62;
  const iris = mesh(`Iris_${side}`, new THREE.SphereGeometry(0.076, 22, 14), irisMaterial);
  iris.position.z = 0.087;
  const pupil = mesh(`Pupil_${side}`, new THREE.SphereGeometry(0.028, 16, 12), dark);
  pupil.position.z = 0.145;
  pupil.scale.y = 1.45;
  eye.add(globe, iris, pupil);
  return eye;
}

function createEar(side, x, tilt) {
  const pivot = new THREE.Group();
  pivot.name = `Ear_${side}`;
  pivot.position.set(x, 2.17, -0.02);
  pivot.rotation.z = tilt;
  const outer = mesh(`EarOuter_${side}`, new THREE.CapsuleGeometry(0.205, 1.02, 10, 22), fur);
  outer.scale.set(0.88, 1, 0.5);
  outer.position.y = 0.56;
  const inner = mesh(`EarInner_${side}`, new THREE.CapsuleGeometry(0.12, 0.72, 8, 18), innerEarMaterial);
  inner.scale.set(0.72, 1, 0.34);
  inner.position.set(0, 0.57, 0.085);
  pivot.add(outer, inner);
  return pivot;
}

function buildEnki() {
  const root = new THREE.Group();
  root.name = "EnkiRoot";
  root.position.y = -0.9;

  const torso = mesh("Torso", new THREE.CapsuleGeometry(0.72, 1.2, 10, 24), red);
  torso.scale.set(1.25, 1, 0.62);
  torso.position.y = 0.12;
  root.add(torso);

  const collar = mesh("Collar", new THREE.TorusGeometry(0.58, 0.16, 14, 40, Math.PI * 1.65), dark);
  collar.rotation.x = Math.PI / 2;
  collar.rotation.z = Math.PI * 0.17;
  collar.position.set(0, 0.92, 0.1);
  root.add(collar);

  for (const [side, x] of [["L", -0.63], ["R", 0.63]]) {
    const sign = x < 0 ? -1 : 1;
    const coat = mesh(`Parka_${side}`, new THREE.CapsuleGeometry(0.34, 1.02, 8, 18), mustard);
    coat.scale.set(0.94, 1.02, 0.45);
    coat.rotation.z = sign * -0.12;
    coat.position.set(x, 0.06, 0.03);
    const shoulder = mesh(`Shoulder_${side}`, new THREE.SphereGeometry(0.42, 24, 16), mustard);
    shoulder.scale.set(1.2, 0.8, 0.62);
    shoulder.position.set(sign * 0.71, 0.56, 0.02);
    root.add(coat, shoulder);
  }

  const emblem = new THREE.Group();
  emblem.name = "Emblem_ENKI";
  emblem.position.set(0, 0.26, 0.48);
  [-0.19, 0, 0.19].forEach((x, index) => {
    const colors = [0xa94a2c, 0xd2a62e, 0x65653d];
    const bar = mesh(`EmblemPart_${index + 1}`, new THREE.BoxGeometry(0.1, index === 1 ? 0.31 : 0.23, 0.025), material(`Emblem_${index + 1}`, colors[index], 0.8));
    bar.position.x = x;
    bar.rotation.z = index === 0 ? -0.22 : index === 2 ? 0.22 : 0;
    emblem.add(bar);
  });
  root.add(emblem);

  const neck = mesh("Neck", new THREE.CylinderGeometry(0.31, 0.38, 0.62, 24), fur);
  neck.position.y = 1.05;
  root.add(neck);

  const head = new THREE.Group();
  head.name = "HeadRig";
  head.position.y = 0.02;
  root.add(head);
  const skull = mesh("Skull", new THREE.SphereGeometry(0.69, 44, 30), fur);
  skull.scale.set(0.83, 1.06, 0.8);
  skull.position.y = 1.72;
  head.add(skull);

  for (const [side, x] of [["L", -0.22], ["R", 0.22]]) {
    const cheek = mesh(`Cheek_${side}`, new THREE.SphereGeometry(0.31, 30, 22), muzzleMaterial);
    cheek.scale.set(1.15, 0.76, 1.06);
    cheek.position.set(x, 1.47, 0.53);
    head.add(cheek);
  }

  const mouth = mesh("Mouth", new THREE.SphereGeometry(0.19, 24, 16), mouthMaterial);
  mouth.scale.set(1.12, 0.09, 0.38);
  mouth.position.set(0, 1.355, 0.69);
  head.add(mouth);
  const jaw = mesh("Jaw", new THREE.SphereGeometry(0.31, 28, 20), muzzleMaterial);
  jaw.scale.set(0.86, 0.42, 0.82);
  jaw.position.set(0, 1.29, 0.47);
  head.add(jaw);
  const nose = mesh("Nose", new THREE.SphereGeometry(0.115, 24, 16), noseMaterial);
  nose.scale.set(1.18, 0.78, 0.65);
  nose.position.set(0, 1.57, 0.73);
  head.add(nose);
  head.add(createEye("L", -0.255, 0xf05a24), createEye("R", 0.255, 0xe5a928));
  head.add(createEar("L", -0.31, 0.06), createEar("R", 0.31, -0.06));
  const hood = mesh("Hood", new THREE.TorusGeometry(0.69, 0.14, 14, 48, Math.PI * 1.62), red);
  hood.scale.set(0.95, 1.12, 0.92);
  hood.rotation.z = Math.PI * 0.19;
  hood.position.set(0, 1.7, -0.02);
  head.add(hood);

  const belt = mesh("CargoWaist", new THREE.CylinderGeometry(0.71, 0.74, 0.2, 32), olive);
  belt.scale.z = 0.62;
  belt.position.y = -0.52;
  root.add(belt);
  const accent = mesh("PurpleAccent", new THREE.TorusGeometry(0.18, 0.035, 8, 26), purple);
  accent.position.set(0.7, -0.42, 0.47);
  root.add(accent);
  root.traverse((object) => { object.userData.enkiRigVersion = "0.1.0"; });
  return root;
}

const outputPath = path.resolve("public/models/enki-organic-v0.glb");
await mkdir(path.dirname(outputPath), { recursive: true });
const exporter = new GLTFExporter();
const result = await exporter.parseAsync(buildEnki(), { binary: true, onlyVisible: true });
await writeFile(outputPath, Buffer.from(result));
console.log(outputPath);

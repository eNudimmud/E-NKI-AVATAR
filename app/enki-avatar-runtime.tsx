"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { BrainCircuit, Ear, MessageCircleMore, Mic, MicOff, Radio, Send, Unplug, Wifi } from "lucide-react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

type AvatarState = "idle" | "listening" | "thinking" | "speaking";
type AvatarController = {
  setState: (state: AvatarState) => void;
  setViseme: (viseme: string, intensity?: number) => void;
  setGaze: (x: number, y: number) => void;
  setInputLevel: (level: number) => void;
};

type AvatarParts = {
  root: THREE.Object3D;
  head: THREE.Object3D;
  jaw: THREE.Object3D;
  mouth: THREE.Object3D;
  leftEye: THREE.Object3D;
  rightEye: THREE.Object3D;
  leftEar: THREE.Object3D;
  rightEar: THREE.Object3D;
  morphMeshes: THREE.Mesh[];
  rest: {
    rootPosition: THREE.Vector3;
    headRotation: THREE.Euler;
    jawPosition: THREE.Vector3;
    jawRotation: THREE.Euler;
    mouthScale: THREE.Vector3;
    leftEyeScale: THREE.Vector3;
    rightEyeScale: THREE.Vector3;
    leftEarRotation: THREE.Euler;
    rightEarRotation: THREE.Euler;
  };
};

declare global {
  interface Window { enkiAvatar?: AvatarController; }
}

const STATE_COPY: Record<AvatarState, { label: string; caption: string }> = {
  idle: { label: "En veille", caption: "Présence active" },
  listening: { label: "À l’écoute", caption: "Canal entrant ouvert" },
  thinking: { label: "Analyse", caption: "Agent en réflexion" },
  speaking: { label: "En ligne", caption: "Voix synchronisée" },
};

const VISEME_OPENNESS: Record<string, number> = {
  SIL: 0, PP: 0.06, FF: 0.18, TH: 0.28, DD: 0.34, KK: 0.48,
  CH: 0.42, SS: 0.22, NN: 0.32, RR: 0.38, AA: 1,
  E: 0.56, I: 0.34, O: 0.72, U: 0.58,
};

function makeMaterial(color: number, roughness = 0.72, metalness = 0.02) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function createEar(outerMaterial: THREE.Material, innerMaterial: THREE.Material, x: number, tilt: number) {
  const pivot = new THREE.Group();
  pivot.position.set(x, 2.17, -0.02);
  pivot.rotation.z = tilt;
  const outer = new THREE.Mesh(new THREE.CapsuleGeometry(0.205, 1.02, 10, 22), outerMaterial);
  outer.scale.set(0.88, 1, 0.5);
  outer.position.y = 0.56;
  outer.castShadow = true;
  const inner = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.72, 8, 18), innerMaterial);
  inner.scale.set(0.72, 1, 0.34);
  inner.position.set(0, 0.57, 0.085);
  pivot.add(outer, inner);
  return pivot;
}

function createEye(scleraMaterial: THREE.Material, irisColor: number, x: number) {
  const socket = new THREE.Group();
  socket.position.set(x, 1.79, 0.585);
  const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.16, 28, 18), scleraMaterial);
  sclera.scale.set(1, 0.78, 0.48);
  const iris = new THREE.Mesh(
    new THREE.SphereGeometry(0.076, 22, 14),
    new THREE.MeshStandardMaterial({ color: irisColor, roughness: 0.22, emissive: irisColor, emissiveIntensity: 0.62 }),
  );
  iris.position.z = 0.087;
  iris.name = "iris";
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.028, 16, 12), new THREE.MeshBasicMaterial({ color: 0x060504 }));
  pupil.position.z = 0.145;
  pupil.scale.y = 1.45;
  pupil.name = "pupil";
  socket.add(sclera, iris, pupil);
  return socket;
}

function createEnki(scene: THREE.Scene): AvatarParts {
  const root = new THREE.Group();
  root.position.y = -0.9;
  scene.add(root);
  const fur = makeMaterial(0xe6dfce, 0.96);
  const innerEar = makeMaterial(0x9e695f, 0.88);
  const muzzle = makeMaterial(0xf0eadb, 0.98);
  const mustard = makeMaterial(0xb77a24, 0.86);
  const red = makeMaterial(0x771d24, 0.8);
  const olive = makeMaterial(0x4e5034, 0.9);
  const purple = makeMaterial(0x2b203f, 0.75);
  const dark = makeMaterial(0x171719, 0.76, 0.18);
  const sclera = makeMaterial(0xddd8c9, 0.45);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.72, 1.2, 10, 24), red);
  torso.scale.set(1.25, 1, 0.62);
  torso.position.y = 0.12;
  torso.castShadow = true;
  root.add(torso);

  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.16, 14, 40, Math.PI * 1.65), dark);
  collar.rotation.x = Math.PI / 2;
  collar.rotation.z = Math.PI * 0.17;
  collar.position.set(0, 0.92, 0.1);
  root.add(collar);

  for (const side of [-1, 1]) {
    const coat = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 1.02, 8, 18), mustard);
    coat.scale.set(0.94, 1.02, 0.45);
    coat.rotation.z = side * -0.12;
    coat.position.set(side * 0.63, 0.06, 0.03);
    coat.castShadow = true;
    root.add(coat);
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 16), mustard);
    shoulder.scale.set(1.2, 0.8, 0.62);
    shoulder.position.set(side * 0.71, 0.56, 0.02);
    root.add(shoulder);
  }

  const emblem = new THREE.Group();
  emblem.position.set(0, 0.26, 0.48);
  [-0.19, 0, 0.19].forEach((x, index) => {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, index === 1 ? 0.31 : 0.23, 0.025),
      new THREE.MeshStandardMaterial({ color: index === 1 ? 0xd2a62e : index === 0 ? 0xa94a2c : 0x65653d, roughness: 0.78 }),
    );
    bar.position.x = x;
    bar.rotation.z = index === 0 ? -0.22 : index === 2 ? 0.22 : 0;
    emblem.add(bar);
  });
  root.add(emblem);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.38, 0.62, 24), fur);
  neck.position.y = 1.05;
  root.add(neck);
  const head = new THREE.Group();
  head.position.y = 0.02;
  root.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.69, 44, 30), fur);
  skull.scale.set(0.83, 1.06, 0.8);
  skull.position.y = 1.72;
  skull.castShadow = true;
  head.add(skull);

  const cheekLeft = new THREE.Mesh(new THREE.SphereGeometry(0.31, 30, 22), muzzle);
  const cheekRight = cheekLeft.clone();
  cheekLeft.scale.set(1.15, 0.76, 1.06);
  cheekRight.scale.copy(cheekLeft.scale);
  cheekLeft.position.set(-0.22, 1.47, 0.53);
  cheekRight.position.set(0.22, 1.47, 0.53);
  head.add(cheekLeft, cheekRight);

  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.19, 24, 16), new THREE.MeshStandardMaterial({ color: 0x281316, roughness: 0.82 }));
  mouth.scale.set(1.12, 0.09, 0.38);
  mouth.position.set(0, 1.355, 0.69);
  head.add(mouth);
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.31, 28, 20), muzzle);
  jaw.scale.set(0.86, 0.42, 0.82);
  jaw.position.set(0, 1.29, 0.47);
  head.add(jaw);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.115, 24, 16), new THREE.MeshStandardMaterial({ color: 0x2e2524, roughness: 0.58 }));
  nose.scale.set(1.18, 0.78, 0.65);
  nose.position.set(0, 1.57, 0.73);
  head.add(nose);

  const leftEye = createEye(sclera, 0xf05a24, -0.255);
  const rightEye = createEye(sclera, 0xe5a928, 0.255);
  head.add(leftEye, rightEye);
  const leftEar = createEar(fur, innerEar, -0.31, 0.06);
  const rightEar = createEar(fur, innerEar, 0.31, -0.06);
  head.add(leftEar, rightEar);
  const hood = new THREE.Mesh(new THREE.TorusGeometry(0.69, 0.14, 14, 48, Math.PI * 1.62), red);
  hood.scale.set(0.95, 1.12, 0.92);
  hood.rotation.z = Math.PI * 0.19;
  hood.position.set(0, 1.7, -0.02);
  head.add(hood);

  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.71, 0.74, 0.2, 32), olive);
  belt.scale.z = 0.62;
  belt.position.y = -0.52;
  root.add(belt);
  const accent = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.035, 8, 26), purple);
  accent.position.set(0.7, -0.42, 0.47);
  root.add(accent);
  return prepareAvatar({ root, head, jaw, mouth, leftEye, rightEye, leftEar, rightEar });
}

function prepareAvatar(parts: Omit<AvatarParts, "morphMeshes" | "rest">): AvatarParts {
  const morphMeshes: THREE.Mesh[] = [];
  parts.root.traverse((object) => {
    if (
      object instanceof THREE.Mesh
      && object.morphTargetDictionary
      && object.morphTargetInfluences
    ) {
      morphMeshes.push(object);
    }
  });
  return {
    ...parts,
    morphMeshes,
    rest: {
      rootPosition: parts.root.position.clone(),
      headRotation: parts.head.rotation.clone(),
      jawPosition: parts.jaw.position.clone(),
      jawRotation: parts.jaw.rotation.clone(),
      mouthScale: parts.mouth.scale.clone(),
      leftEyeScale: parts.leftEye.scale.clone(),
      rightEyeScale: parts.rightEye.scale.clone(),
      leftEarRotation: parts.leftEar.rotation.clone(),
      rightEarRotation: parts.rightEar.rotation.clone(),
    },
  };
}

function bindAvatar(root: THREE.Object3D): AvatarParts | null {
  const find = (name: string) => root.getObjectByName(name);
  const head = find("HeadRig");
  const jaw = find("Jaw");
  const mouth = find("Mouth");
  const leftEye = find("Eye_L");
  const rightEye = find("Eye_R");
  const leftEar = find("Ear_L");
  const rightEar = find("Ear_R");
  if (!head || !jaw || !mouth || !leftEye || !rightEye || !leftEar || !rightEar) return null;
  return prepareAvatar({ root, head, jaw, mouth, leftEye, rightEye, leftEar, rightEar });
}

function disposeTree(root: THREE.Object3D) {
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => material.dispose());
    }
  });
}

function AvatarCanvas({ state }: { state: AvatarState }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<AvatarState>(state);
  const targetMouthRef = useRef(0);
  const targetVisemeRef = useRef({ name: "SIL", intensity: 0 });
  const inputLevelRef = useRef(0);
  const gazeRef = useRef({ x: 0, y: 0 });
  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090908);
    scene.fog = new THREE.FogExp2(0x090908, 0.065);
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 1.15, 7.3);
    camera.lookAt(0, 1.12, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);

    const key = new THREE.SpotLight(0xffd8ad, 55, 22, 0.52, 0.8, 1.2);
    key.position.set(-3.4, 6.2, 5.2);
    key.target.position.set(0, 1.1, 0);
    key.castShadow = true;
    scene.add(key, key.target);
    const rim = new THREE.PointLight(0xb43a47, 22, 12, 1.6);
    rim.position.set(3.8, 2.6, -2.2);
    scene.add(rim);
    const fill = new THREE.PointLight(0x6b5a2f, 12, 10, 1.8);
    fill.position.set(-3, 0.5, 2.4);
    scene.add(fill, new THREE.HemisphereLight(0x2b3034, 0x080705, 1.6));
    const floor = new THREE.Mesh(new THREE.CircleGeometry(3.1, 64), new THREE.MeshStandardMaterial({ color: 0x11110f, roughness: 0.72, metalness: 0.28 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.56;
    floor.receiveShadow = true;
    scene.add(floor);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(2.15, 0.018, 8, 120), new THREE.MeshBasicMaterial({ color: 0x8f6427, transparent: true, opacity: 0.3 }));
    halo.position.set(0, 1.12, -1.25);
    scene.add(halo);
    let avatar = createEnki(scene);
    let disposed = false;
    const modelCandidates = ["/models/enki-organic-v1.glb", "/models/enki-organic-v0.glb"];
    const loadModel = (candidateIndex: number) => {
      const candidate = modelCandidates[candidateIndex];
      if (!candidate) return;
      new GLTFLoader().load(candidate, (gltf) => {
        if (disposed) return;
        const modelRoot = gltf.scene.getObjectByName("EnkiRoot");
        if (!modelRoot) {
          loadModel(candidateIndex + 1);
          return;
        }
        const loadedAvatar = bindAvatar(modelRoot);
        if (!loadedAvatar) {
          loadModel(candidateIndex + 1);
          return;
        }
        scene.remove(avatar.root);
        disposeTree(avatar.root);
        scene.add(modelRoot);
        avatar = loadedAvatar;
      }, undefined, () => loadModel(candidateIndex + 1));
    };
    loadModel(0);

    let mouthValue = 0;
    let blink = 1;
    let nextBlink = 1.8;
    let elapsed = 0;
    let previous = performance.now();
    let frameId = 0;
    window.enkiAvatar = {
      setState: (next) => window.dispatchEvent(new CustomEvent("enki:state", { detail: next })),
      setViseme: (viseme, intensity = 1) => {
        const normalized = viseme.toUpperCase();
        const clampedIntensity = THREE.MathUtils.clamp(intensity, 0, 1);
        targetMouthRef.current = (VISEME_OPENNESS[normalized] ?? 0.35) * clampedIntensity;
        targetVisemeRef.current = { name: normalized, intensity: clampedIntensity };
      },
      setGaze: (x, y) => { gazeRef.current = { x: THREE.MathUtils.clamp(x, -1, 1), y: THREE.MathUtils.clamp(y, -1, 1) }; },
      setInputLevel: (level) => { inputLevelRef.current = THREE.MathUtils.clamp(level, 0, 1); },
    };

    const resize = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const animate = (now: number) => {
      const delta = Math.min((now - previous) / 1000, 0.05);
      previous = now;
      elapsed += delta;
      const currentState = stateRef.current;
      if (elapsed >= nextBlink) {
        const phase = elapsed - nextBlink;
        blink = phase < 0.085 ? 1 - phase / 0.085 : phase < 0.17 ? (phase - 0.085) / 0.085 : 1;
        if (phase >= 0.17) { blink = 1; nextBlink = elapsed + 2.4 + Math.random() * 3.7; }
      }
      avatar.leftEye.scale.y = avatar.rest.leftEyeScale.y * Math.max(0.05, blink);
      avatar.rightEye.scale.y = avatar.rest.rightEyeScale.y * Math.max(0.05, blink);
      const speechPulse = currentState === "speaking" ? 0.2 + Math.abs(Math.sin(elapsed * 10.7) * Math.sin(elapsed * 4.1)) * 0.65 : 0;
      const requested = Math.max(targetMouthRef.current, speechPulse, inputLevelRef.current * 0.75);
      mouthValue = THREE.MathUtils.damp(mouthValue, requested, 20, delta);
      targetMouthRef.current = THREE.MathUtils.damp(targetMouthRef.current, 0, 8, delta);
      inputLevelRef.current = THREE.MathUtils.damp(inputLevelRef.current, 0, 12, delta);
      avatar.mouth.scale.y = avatar.rest.mouthScale.y * (1 + mouthValue * 1.18);
      avatar.mouth.scale.x = avatar.rest.mouthScale.x * (1 - mouthValue * 0.18);
      avatar.jaw.position.y = avatar.rest.jawPosition.y - mouthValue * 0.115;
      avatar.jaw.rotation.x = avatar.rest.jawRotation.x + mouthValue * 0.13;

      const visemeSignal = targetVisemeRef.current;
      for (const morphMesh of avatar.morphMeshes) {
        const dictionary = morphMesh.morphTargetDictionary;
        const influences = morphMesh.morphTargetInfluences;
        if (!dictionary || !influences) continue;
        for (const [targetName, index] of Object.entries(dictionary)) {
          if (!targetName.startsWith("viseme_")) continue;
          const requestedInfluence = targetName === `viseme_${visemeSignal.name}` ? visemeSignal.intensity : 0;
          influences[index] = THREE.MathUtils.damp(influences[index] ?? 0, requestedInfluence, 24, delta);
        }
      }
      targetVisemeRef.current.intensity = THREE.MathUtils.damp(targetVisemeRef.current.intensity, 0, 9, delta);

      const look = gazeRef.current;
      const irisX = look.x * 0.026;
      const irisY = look.y * 0.022;
      for (const eye of [avatar.leftEye, avatar.rightEye]) {
        const iris = eye.getObjectByName("iris") ?? eye.children.find((child) => child.name.startsWith("Iris_"));
        const pupil = eye.getObjectByName("pupil") ?? eye.children.find((child) => child.name.startsWith("Pupil_"));
        if (iris) iris.position.set(irisX, irisY, 0.087);
        if (pupil) pupil.position.set(irisX * 1.1, irisY * 1.1, 0.145);
      }
      const attention = currentState === "listening" ? 1 : currentState === "thinking" ? -0.45 : 0;
      avatar.leftEar.rotation.z = avatar.rest.leftEarRotation.z - attention * 0.055 + Math.sin(elapsed * 0.8) * 0.008;
      avatar.rightEar.rotation.z = avatar.rest.rightEarRotation.z + attention * 0.055 - Math.sin(elapsed * 0.72) * 0.008;
      avatar.leftEar.rotation.x = avatar.rest.leftEarRotation.x + (currentState === "thinking" ? -0.09 : 0);
      avatar.rightEar.rotation.x = avatar.rest.rightEarRotation.x + (currentState === "thinking" ? 0.06 : 0);
      avatar.root.position.y = avatar.rest.rootPosition.y + Math.sin(elapsed * 1.18) * 0.016;
      avatar.head.rotation.y = avatar.rest.headRotation.y + Math.sin(elapsed * 0.42) * 0.025 + look.x * 0.045;
      avatar.head.rotation.x = avatar.rest.headRotation.x + Math.sin(elapsed * 0.55) * 0.012 - look.y * 0.025;
      avatar.head.rotation.z = avatar.rest.headRotation.z + (currentState === "thinking" ? -0.035 : Math.sin(elapsed * 0.31) * 0.008);
      halo.rotation.z = elapsed * 0.035;
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);
    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      observer.disconnect();
      delete window.enkiAvatar;
      renderer.dispose();
      renderer.domElement.remove();
      disposeTree(scene);
    };
  }, []);
  return <div ref={hostRef} className="avatar-canvas" aria-label="Avatar 3D d’E*NKI" />;
}

export default function EnkiAvatarRuntime() {
  const [state, setState] = useState<AvatarState>("idle");
  const [micActive, setMicActive] = useState(false);
  const [socketUrl, setSocketUrl] = useState("");
  const [socketConnected, setSocketConnected] = useState(false);
  const [testLine, setTestLine] = useState("Je suis E*NKI. Le canal est ouvert.");
  const socketRef = useRef<WebSocket | null>(null);
  const micCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const onExternalState = (event: Event) => {
      const next = (event as CustomEvent<AvatarState>).detail;
      if (next && next in STATE_COPY) setState(next);
    };
    window.addEventListener("enki:state", onExternalState);
    return () => window.removeEventListener("enki:state", onExternalState);
  }, []);

  const disconnect = () => {
    socketRef.current?.close();
    socketRef.current = null;
    setSocketConnected(false);
  };
  const connectSocket = () => {
    disconnect();
    if (!socketUrl.trim()) return;
    const socket = new WebSocket(socketUrl.trim());
    socketRef.current = socket;
    socket.addEventListener("open", () => setSocketConnected(true));
    socket.addEventListener("close", () => setSocketConnected(false));
    socket.addEventListener("error", () => setSocketConnected(false));
    socket.addEventListener("message", (message) => {
      try {
        const payload = JSON.parse(String(message.data));
        if (payload.state && payload.state in STATE_COPY) setState(payload.state);
        if (payload.viseme) window.enkiAvatar?.setViseme(payload.viseme, payload.intensity ?? 1);
        if (payload.gaze) window.enkiAvatar?.setGaze(payload.gaze.x ?? 0, payload.gaze.y ?? 0);
        if (typeof payload.level === "number") window.enkiAvatar?.setInputLevel(payload.level);
      } catch { /* Rendering continues if an external packet is malformed. */ }
    });
  };

  const toggleMic = async () => {
    if (micActive) {
      micCleanupRef.current?.();
      micCleanupRef.current = null;
      setMicActive(false);
      setState("idle");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.frequencyBinCount);
      let active = true;
      const sample = () => {
        if (!active) return;
        analyser.getByteFrequencyData(samples);
        const level = samples.reduce((sum, value) => sum + value, 0) / samples.length / 128;
        window.enkiAvatar?.setInputLevel(Math.min(level, 1));
        requestAnimationFrame(sample);
      };
      sample();
      micCleanupRef.current = () => {
        active = false;
        stream.getTracks().forEach((track) => track.stop());
        void context.close();
      };
      setMicActive(true);
      setState("listening");
    } catch { setMicActive(false); }
  };

  const speakTest = (event: FormEvent) => {
    event.preventDefault();
    if (!testLine.trim()) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(testLine.trim());
    utterance.lang = "fr-FR";
    utterance.rate = 0.9;
    utterance.pitch = 0.72;
    utterance.onstart = () => setState("speaking");
    utterance.onend = () => setState("idle");
    utterance.onerror = () => setState("idle");
    window.speechSynthesis.speak(utterance);
  };

  return (
    <main className="runtime-shell">
      <header className="runtime-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <div><strong>E*NKI</strong><span>Avatar Runtime / prototype 0.1</span></div>
        </div>
        <div className={`live-state state-${state}`}><span className="live-state-dot" /><span>{STATE_COPY[state].label}</span></div>
      </header>

      <section className="stage">
        <AvatarCanvas state={state} />
        <div className="stage-grid" aria-hidden="true" />
        <div className="stage-caption"><span>IDENTITÉ VERROUILLÉE</span><strong>{STATE_COPY[state].caption}</strong></div>
        <div className={`signal signal-${state}`} aria-hidden="true">{Array.from({ length: 18 }, (_, index) => <i key={index} />)}</div>
      </section>

      <aside className="control-deck" aria-label="Contrôles de l’avatar">
        <section className="control-section">
          <div className="section-heading"><span>État</span><small>moteur local</small></div>
          <div className="state-buttons">
            <button className={state === "idle" ? "selected" : ""} onClick={() => setState("idle")}><Radio size={18} /> Veille</button>
            <button className={state === "listening" ? "selected" : ""} onClick={() => setState("listening")}><Ear size={18} /> Écoute</button>
            <button className={state === "thinking" ? "selected" : ""} onClick={() => setState("thinking")}><BrainCircuit size={18} /> Analyse</button>
            <button className={state === "speaking" ? "selected" : ""} onClick={() => setState("speaking")}><MessageCircleMore size={18} /> Parole</button>
          </div>
        </section>

        <section className="control-section">
          <div className="section-heading"><span>Entrée directe</span><small>{micActive ? "niveau audio actif" : "micro arrêté"}</small></div>
          <button className={`mic-button ${micActive ? "active" : ""}`} onClick={toggleMic}>{micActive ? <MicOff size={20} /> : <Mic size={20} />}{micActive ? "Couper l’écoute" : "Ouvrir le micro"}</button>
        </section>

        <section className="control-section">
          <div className="section-heading"><span>Phrase de test</span><small>voix navigateur</small></div>
          <form className="test-form" onSubmit={speakTest}>
            <input value={testLine} onChange={(event) => setTestLine(event.target.value)} aria-label="Phrase à faire prononcer" />
            <button type="submit" aria-label="Faire parler E*NKI"><Send size={18} /></button>
          </form>
        </section>

        <section className="control-section socket-section">
          <div className="section-heading"><span>Agent WebSocket</span><small>{socketConnected ? "connecté" : "hors ligne"}</small></div>
          <div className="socket-row">
            <input value={socketUrl} onChange={(event) => setSocketUrl(event.target.value)} placeholder="wss://agent.example/avatar" aria-label="Adresse WebSocket de l’agent" />
            <button onClick={socketConnected ? disconnect : connectSocket} aria-label={socketConnected ? "Déconnecter l’agent" : "Connecter l’agent"}>{socketConnected ? <Unplug size={18} /> : <Wifi size={18} />}</button>
          </div>
        </section>
      </aside>
    </main>
  );
}

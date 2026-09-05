"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { BrainCircuit, Ear, MessageCircleMore, Mic, MicOff, Radio, Send, Unplug, Wifi } from "lucide-react";

type AvatarState = "idle" | "listening" | "thinking" | "speaking";
type MouthShape = "aa" | "e" | "o";
type TextureName = "base" | "blink" | MouthShape;
type AvatarController = {
  setState: (state: AvatarState) => void;
  setViseme: (viseme: string, intensity?: number) => void;
  setGaze: (x: number, y: number) => void;
  setInputLevel: (level: number) => void;
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

const AVATAR_TEXTURES: Record<TextureName, string> = {
  base: "/avatar2d/enki-base.webp",
  blink: "/avatar2d/enki-blink.webp",
  aa: "/avatar2d/enki-mouth-aa.webp",
  e: "/avatar2d/enki-mouth-e.webp",
  o: "/avatar2d/enki-mouth-o.webp",
};

const VISEME_SHAPES: Record<string, MouthShape | null> = {
  SIL: null,
  PP: null,
  FF: "e",
  TH: "aa",
  DD: "aa",
  KK: "aa",
  CH: "e",
  SS: "e",
  NN: "aa",
  RR: "o",
  AA: "aa",
  E: "e",
  I: "e",
  O: "o",
  U: "o",
};

const VERTEX_SHADER = `
  attribute vec2 aPosition;
  varying vec2 vUv;
  uniform vec2 uScale;
  uniform vec2 uTranslate;
  uniform vec2 uLook;
  uniform float uRotation;
  uniform float uTime;
  uniform float uBreath;

  void main() {
    vUv = aPosition * 0.5 + 0.5;
    vec2 p = aPosition;
    float head = smoothstep(0.39, 0.62, vUv.y);
    float chest = 1.0 - smoothstep(0.20, 0.55, vUv.y);
    p.x += head * (uLook.x * 0.012 + sin(uTime * 0.47) * 0.0028);
    p.y += head * uLook.y * 0.006 + chest * uBreath * 0.0032;
    p.x *= 1.0 + chest * uBreath * 0.0016;
    float c = cos(uRotation);
    float s = sin(uRotation);
    p = mat2(c, -s, s, c) * p;
    p = p * uScale + uTranslate;
    gl_Position = vec4(p, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  precision mediump float;
  varying vec2 vUv;
  uniform sampler2D uTexture;
  uniform float uOpacity;
  uniform float uMaskMode;

  float ellipseMask(vec2 center, vec2 radius) {
    vec2 q = (vUv - center) / radius;
    return 1.0 - smoothstep(0.64, 1.0, dot(q, q));
  }

  void main() {
    vec4 color = texture2D(uTexture, vUv);
    float mask = 1.0;
    if (uMaskMode > 0.5 && uMaskMode < 1.5) {
      float leftEye = ellipseMask(vec2(0.405, 0.606), vec2(0.108, 0.052));
      float rightEye = ellipseMask(vec2(0.602, 0.606), vec2(0.108, 0.052));
      mask = max(leftEye, rightEye);
    } else if (uMaskMode >= 1.5) {
      mask = ellipseMask(vec2(0.500, 0.492), vec2(0.145, 0.067));
    }
    gl_FragColor = vec4(color.rgb, color.a * mask * uOpacity);
  }
`;

type ProgramLocations = {
  position: number;
  texture: WebGLUniformLocation | null;
  opacity: WebGLUniformLocation | null;
  maskMode: WebGLUniformLocation | null;
  scale: WebGLUniformLocation | null;
  translate: WebGLUniformLocation | null;
  look: WebGLUniformLocation | null;
  rotation: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
  breath: WebGLUniformLocation | null;
};

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("WebGL shader allocation failed");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "Unknown shader error";
    gl.deleteShader(shader);
    throw new Error(log);
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!program) throw new Error("WebGL program allocation failed");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? "Unknown link error";
    gl.deleteProgram(program);
    throw new Error(log);
  }
  return program;
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load ${url}`));
    image.src = url;
  });
}

function createTexture(gl: WebGLRenderingContext, image: HTMLImageElement) {
  const texture = gl.createTexture();
  if (!texture) throw new Error("WebGL texture allocation failed");
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  return texture;
}

function damp(current: number, target: number, speed: number, delta: number) {
  return target + (current - target) * Math.exp(-speed * delta);
}

function visemeForCharacter(character: string) {
  const normalized = character.toLowerCase();
  if (/[aàâä]/.test(normalized)) return "AA";
  if (/[eéèêëiîïy]/.test(normalized)) return "E";
  if (/[oôöuùûü]/.test(normalized)) return "O";
  if (/[bmp]/.test(normalized)) return "PP";
  if (/[fvsxz]/.test(normalized)) return "FF";
  return "DD";
}

function AvatarCanvas({ state }: { state: AvatarState }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<AvatarState>(state);
  const targetVisemeRef = useRef<{ shape: MouthShape | null; intensity: number; until: number }>({ shape: null, intensity: 0, until: 0 });
  const inputLevelRef = useRef(0);
  const gazeRef = useRef({ x: 0, y: 0 });
  const [ready, setReady] = useState(false);

  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    host.appendChild(canvas);
    const gl = (canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: true })
      ?? canvas.getContext("experimental-webgl", { alpha: true, antialias: true })) as WebGLRenderingContext | null;
    if (!gl) return () => canvas.remove();

    let disposed = false;
    let frameId = 0;
    let program: WebGLProgram | null = null;
    let vertexBuffer: WebGLBuffer | null = null;
    const textures = {} as Record<TextureName, WebGLTexture>;
    const mouthWeights: Record<MouthShape, number> = { aa: 0, e: 0, o: 0 };
    let elapsed = 0;
    let previous = performance.now();
    let nextBlink = 1.8;
    let blinkStart = -1;
    let lookX = 0;
    let lookY = 0;
    let scaleValue = 1;
    let rotation = 0;

    const onPointerMove = (event: PointerEvent) => {
      const bounds = host.getBoundingClientRect();
      gazeRef.current = {
        x: Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width - 0.5) * 1.25)),
        y: Math.max(-1, Math.min(1, (0.5 - (event.clientY - bounds.top) / bounds.height) * 1.1)),
      };
    };
    const onPointerLeave = () => { gazeRef.current = { x: 0, y: 0 }; };
    host.addEventListener("pointermove", onPointerMove);
    host.addEventListener("pointerleave", onPointerLeave);

    window.enkiAvatar = {
      setState: (next) => window.dispatchEvent(new CustomEvent("enki:state", { detail: next })),
      setViseme: (viseme, intensity = 1) => {
        const normalized = viseme.toUpperCase();
        targetVisemeRef.current = {
          shape: VISEME_SHAPES[normalized] ?? "aa",
          intensity: Math.max(0, Math.min(1, intensity)),
          until: performance.now() + 170,
        };
      },
      setGaze: (x, y) => {
        gazeRef.current = {
          x: Math.max(-1, Math.min(1, x)),
          y: Math.max(-1, Math.min(1, y)),
        };
      },
      setInputLevel: (level) => { inputLevelRef.current = Math.max(0, Math.min(1, level)); },
    };

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio, 2);
      const width = Math.max(1, Math.round(host.clientWidth * ratio));
      const height = Math.max(1, Math.round(host.clientHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const draw = (
      locations: ProgramLocations,
      texture: WebGLTexture,
      opacity: number,
      maskMode: number,
      scaleX: number,
      scaleY: number,
      translateY: number,
      breath: number,
    ) => {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(locations.texture, 0);
      gl.uniform1f(locations.opacity, opacity);
      gl.uniform1f(locations.maskMode, maskMode);
      gl.uniform2f(locations.scale, scaleX, scaleY);
      gl.uniform2f(locations.translate, 0, translateY);
      gl.uniform2f(locations.look, lookX, lookY);
      gl.uniform1f(locations.rotation, rotation);
      gl.uniform1f(locations.time, elapsed);
      gl.uniform1f(locations.breath, breath);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    void Promise.all((Object.entries(AVATAR_TEXTURES) as [TextureName, string][]).map(async ([name, url]) => {
      const image = await loadImage(url);
      return [name, createTexture(gl, image)] as const;
    })).then((loadedTextures) => {
      if (disposed) {
        loadedTextures.forEach(([, texture]) => gl.deleteTexture(texture));
        return;
      }
      loadedTextures.forEach(([name, texture]) => { textures[name] = texture; });
      program = createProgram(gl);
      vertexBuffer = gl.createBuffer();
      if (!vertexBuffer) throw new Error("WebGL buffer allocation failed");
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1, 1, -1, -1, 1,
        -1, 1, 1, -1, 1, 1,
      ]), gl.STATIC_DRAW);
      gl.useProgram(program);
      const locations: ProgramLocations = {
        position: gl.getAttribLocation(program, "aPosition"),
        texture: gl.getUniformLocation(program, "uTexture"),
        opacity: gl.getUniformLocation(program, "uOpacity"),
        maskMode: gl.getUniformLocation(program, "uMaskMode"),
        scale: gl.getUniformLocation(program, "uScale"),
        translate: gl.getUniformLocation(program, "uTranslate"),
        look: gl.getUniformLocation(program, "uLook"),
        rotation: gl.getUniformLocation(program, "uRotation"),
        time: gl.getUniformLocation(program, "uTime"),
        breath: gl.getUniformLocation(program, "uBreath"),
      };
      gl.enableVertexAttribArray(locations.position);
      gl.vertexAttribPointer(locations.position, 2, gl.FLOAT, false, 0, 0);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(0, 0, 0, 0);

      const animate = (now: number) => {
        const delta = Math.min((now - previous) / 1000, 0.05);
        previous = now;
        elapsed += delta;
        const currentState = stateRef.current;
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        if (elapsed >= nextBlink && blinkStart < 0) blinkStart = elapsed;
        let blinkOpacity = 0;
        if (blinkStart >= 0) {
          const phase = (elapsed - blinkStart) / 0.18;
          if (phase < 1) blinkOpacity = Math.sin(phase * Math.PI);
          else {
            blinkStart = -1;
            nextBlink = elapsed + 2.5 + Math.random() * 3.8;
          }
        }

        const targets: Record<MouthShape, number> = { aa: 0, e: 0, o: 0 };
        const explicit = targetVisemeRef.current;
        const inputLevel = inputLevelRef.current;
        if (performance.now() < explicit.until && explicit.shape) {
          targets[explicit.shape] = explicit.intensity;
        } else if (inputLevel > 0.035) {
          const level = Math.min(0.92, inputLevel * 1.25);
          targets[inputLevel > 0.38 ? "aa" : inputLevel > 0.18 ? "e" : "o"] = level;
        } else if (currentState === "speaking") {
          const cadence = ["aa", "e", "o", "e", "aa", "o"] as MouthShape[];
          const envelope = 0.28 + Math.abs(Math.sin(elapsed * 7.7) * Math.cos(elapsed * 3.1)) * 0.54;
          targets[cadence[Math.floor(elapsed * 8.2) % cadence.length]] = envelope;
        }
        inputLevelRef.current = damp(inputLevelRef.current, 0, 9, delta);
        (Object.keys(mouthWeights) as MouthShape[]).forEach((shape) => {
          mouthWeights[shape] = damp(mouthWeights[shape], targets[shape], 22, delta);
        });

        lookX = damp(lookX, gazeRef.current.x, 4.8, delta);
        lookY = damp(lookY, gazeRef.current.y, 4.8, delta);
        scaleValue = damp(scaleValue, currentState === "listening" ? 1.006 : currentState === "speaking" ? 1.003 : 1, 3.5, delta);
        rotation = reducedMotion ? 0 : damp(rotation, currentState === "thinking" ? -0.008 : Math.sin(elapsed * 0.35) * 0.0025, 3.6, delta);
        const breath = reducedMotion ? 0 : (Math.sin(elapsed * 1.28) + 1) * 0.5;
        const canvasAspect = canvas.width / canvas.height;
        const imageAspect = 2 / 3;
        const fitX = canvasAspect > imageAspect ? imageAspect / canvasAspect : 1;
        const fitY = canvasAspect > imageAspect ? 1 : canvasAspect / imageAspect;
        const scaleX = fitX * 0.985 * scaleValue;
        const scaleY = fitY * 0.985 * scaleValue;
        const translateY = reducedMotion ? 0 : Math.sin(elapsed * 1.28) * 0.0024;

        resize();
        gl.clear(gl.COLOR_BUFFER_BIT);
        draw(locations, textures.base, 1, 0, scaleX, scaleY, translateY, breath);
        draw(locations, textures.blink, blinkOpacity, 1, scaleX, scaleY, translateY, breath);
        draw(locations, textures.aa, mouthWeights.aa, 2, scaleX, scaleY, translateY, breath);
        draw(locations, textures.e, mouthWeights.e, 2, scaleX, scaleY, translateY, breath);
        draw(locations, textures.o, mouthWeights.o, 2, scaleX, scaleY, translateY, breath);
        frameId = requestAnimationFrame(animate);
      };

      setReady(true);
      frameId = requestAnimationFrame(animate);
    }).catch(() => {
      // The static poster remains visible if WebGL cannot initialize.
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      observer.disconnect();
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerleave", onPointerLeave);
      delete window.enkiAvatar;
      (Object.values(textures) as WebGLTexture[]).forEach((texture) => gl.deleteTexture(texture));
      if (vertexBuffer) gl.deleteBuffer(vertexBuffer);
      if (program) gl.deleteProgram(program);
      canvas.remove();
    };
  }, []);

  return (
    <div ref={hostRef} className={ready ? "avatar-canvas is-ready" : "avatar-canvas"} aria-label="Portrait animé d’E*NKI">
      {/* A plain image is the intentional zero-JavaScript/WebGL fallback. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="avatar-poster" src={AVATAR_TEXTURES.base} alt="E*NKI face caméra" />
      <span className="avatar-loading" role="status">Initialisation du portrait local</span>
    </div>
  );
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

  useEffect(() => () => micCleanupRef.current?.(), []);

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
      } catch {
        // Rendering continues if an external packet is malformed.
      }
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
    } catch {
      setMicActive(false);
    }
  };

  const speakTest = (event: FormEvent) => {
    event.preventDefault();
    if (!testLine.trim()) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(testLine.trim());
    utterance.lang = "fr-FR";
    utterance.rate = 0.94;
    utterance.pitch = 0.72;
    utterance.onstart = () => setState("speaking");
    utterance.onboundary = (boundary) => {
      const character = testLine.trim()[boundary.charIndex] ?? "a";
      window.enkiAvatar?.setViseme(visemeForCharacter(character), 0.82);
    };
    utterance.onend = () => {
      window.enkiAvatar?.setViseme("SIL", 0);
      setState("idle");
    };
    utterance.onerror = () => setState("idle");
    window.speechSynthesis.speak(utterance);
  };

  return (
    <main className="runtime-shell">
      <header className="runtime-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <div><strong>E*NKI</strong><span>Avatar Runtime / portrait 0.2</span></div>
        </div>
        <div className={`live-state state-${state}`}><span className="live-state-dot" /><span>{STATE_COPY[state].label}</span></div>
      </header>

      <section className="stage">
        <AvatarCanvas state={state} />
        <div className="stage-grid" aria-hidden="true" />
        <div className="stage-caption"><span>PORTRAIT 2.5D / LOCAL</span><strong>{STATE_COPY[state].caption}</strong></div>
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

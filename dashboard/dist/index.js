/* eslint-disable react-hooks/exhaustive-deps, @typescript-eslint/no-unused-vars */
(function () {
  "use strict";

  const SDK = window.__HERMES_PLUGIN_SDK__;
  const registry = window.__HERMES_PLUGINS__;
  if (!SDK || !registry) return;

  const React = SDK.React;
  const h = React.createElement;
  const { useEffect, useRef, useState } = SDK.hooks;
  const script = document.currentScript || Array.from(document.scripts).find(function (node) {
    return node.src && node.src.includes("/dashboard-plugins/enki-avatar/");
  });
  const assetUrl = function (name) {
    const source = script && script.src ? script.src : window.location.href;
    const marker = "/dashboard-plugins/";
    const markerIndex = source.indexOf(marker);
    const dashboardBase = markerIndex >= 0 ? source.slice(0, markerIndex) : window.location.origin;
    return dashboardBase + "/api/plugins/enki-avatar/avatar/" + encodeURIComponent(name);
  };

  const TEXTURES = {
    base: assetUrl("enki-base.webp"),
    blink: assetUrl("enki-blink.webp"),
    aa: assetUrl("enki-mouth-aa.webp"),
    e: assetUrl("enki-mouth-e.webp"),
    o: assetUrl("enki-mouth-o.webp"),
  };

  const STATE_COPY = {
    idle: { label: "En veille", caption: "Présence active" },
    listening: { label: "À l'écoute", caption: "Je t'écoute" },
    thinking: { label: "Analyse", caption: "E*NKI réfléchit" },
    speaking: { label: "En ligne", caption: "E*NKI répond" },
  };

  const VERTEX_SHADER = [
    "attribute vec2 aPosition;",
    "varying vec2 vUv;",
    "uniform vec2 uScale;",
    "uniform vec2 uTranslate;",
    "uniform vec2 uLook;",
    "uniform float uRotation;",
    "uniform float uTime;",
    "uniform float uBreath;",
    "void main() {",
    "  vUv = aPosition * 0.5 + 0.5;",
    "  vec2 p = aPosition;",
    "  float head = smoothstep(0.39, 0.62, vUv.y);",
    "  float chest = 1.0 - smoothstep(0.20, 0.55, vUv.y);",
    "  p.x += head * (uLook.x * 0.012 + sin(uTime * 0.47) * 0.0028);",
    "  p.y += head * uLook.y * 0.006 + chest * uBreath * 0.0032;",
    "  p.x *= 1.0 + chest * uBreath * 0.0016;",
    "  float c = cos(uRotation);",
    "  float s = sin(uRotation);",
    "  p = mat2(c, -s, s, c) * p;",
    "  p = p * uScale + uTranslate;",
    "  gl_Position = vec4(p, 0.0, 1.0);",
    "}",
  ].join("\n");

  const FRAGMENT_SHADER = [
    "precision mediump float;",
    "varying vec2 vUv;",
    "uniform sampler2D uTexture;",
    "uniform float uOpacity;",
    "uniform float uMaskMode;",
    "float ellipseMask(vec2 center, vec2 radius) {",
    "  vec2 q = (vUv - center) / radius;",
    "  return 1.0 - smoothstep(0.64, 1.0, dot(q, q));",
    "}",
    "void main() {",
    "  vec4 color = texture2D(uTexture, vUv);",
    "  float mask = 1.0;",
    "  if (uMaskMode > 0.5 && uMaskMode < 1.5) {",
    "    float leftEye = ellipseMask(vec2(0.405, 0.606), vec2(0.108, 0.052));",
    "    float rightEye = ellipseMask(vec2(0.602, 0.606), vec2(0.108, 0.052));",
    "    mask = max(leftEye, rightEye);",
    "  } else if (uMaskMode >= 1.5) {",
    "    mask = ellipseMask(vec2(0.500, 0.492), vec2(0.145, 0.067));",
    "  }",
    "  gl_FragColor = vec4(color.rgb, color.a * mask * uOpacity);",
    "}",
  ].join("\n");

  function damp(current, target, speed, delta) {
    return target + (current - target) * Math.exp(-speed * delta);
  }

  function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("WebGL shader allocation failed");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader) || "WebGL shader error";
      gl.deleteShader(shader);
      throw new Error(log);
    }
    return shader;
  }

  function createProgram(gl) {
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
      const log = gl.getProgramInfoLog(program) || "WebGL link error";
      gl.deleteProgram(program);
      throw new Error(log);
    }
    return program;
  }

  function loadImage(url) {
    return new Promise(function (resolve, reject) {
      const image = new Image();
      image.decoding = "async";
      image.onload = function () { resolve(image); };
      image.onerror = function () { reject(new Error("Unable to load " + url)); };
      image.src = url;
    });
  }

  function createTexture(gl, image) {
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

  function AvatarCanvas(props) {
    const hostRef = useRef(null);
    const stateRef = useRef(props.state);
    const [ready, setReady] = useState(false);

    useEffect(function () { stateRef.current = props.state; }, [props.state]);

    useEffect(function () {
      const host = hostRef.current;
      if (!host) return undefined;
      const canvas = document.createElement("canvas");
      canvas.setAttribute("aria-hidden", "true");
      host.appendChild(canvas);
      const gl = canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: true });
      if (!gl) return function () { canvas.remove(); };

      let disposed = false;
      let frameId = 0;
      let program = null;
      let vertexBuffer = null;
      const textures = {};
      const mouthWeights = { aa: 0, e: 0, o: 0 };
      const control = {
        viseme: null,
        visemeLevel: 0,
        visemeUntil: 0,
        audioLevel: 0,
        gazeX: 0,
        gazeY: 0,
      };
      let elapsed = 0;
      let previous = performance.now();
      let nextBlink = 1.8;
      let blinkStart = -1;
      let lookX = 0;
      let lookY = 0;
      let scaleValue = 1;
      let rotation = 0;

      const controller = {
        setState: function (next) {
          window.dispatchEvent(new CustomEvent("enki:state", { detail: next }));
        },
        setViseme: function (shape, intensity) {
          const normalized = String(shape || "").toLowerCase();
          control.viseme = normalized === "e" || normalized === "i" ? "e" : normalized === "o" || normalized === "u" ? "o" : normalized === "sil" ? null : "aa";
          control.visemeLevel = Math.max(0, Math.min(1, intensity == null ? 1 : Number(intensity)));
          control.visemeUntil = performance.now() + 170;
        },
        setGaze: function (x, y) {
          control.gazeX = Math.max(-1, Math.min(1, Number(x) || 0));
          control.gazeY = Math.max(-1, Math.min(1, Number(y) || 0));
        },
        setInputLevel: function (level) {
          control.audioLevel = Math.max(0, Math.min(1, Number(level) || 0));
        },
      };
      props.controllerRef.current = controller;
      window.enkiAvatar = controller;

      const onPointerMove = function (event) {
        const bounds = host.getBoundingClientRect();
        control.gazeX = Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width - 0.5) * 1.15));
        control.gazeY = Math.max(-1, Math.min(1, (0.5 - (event.clientY - bounds.top) / bounds.height) * 1.05));
      };
      const onPointerLeave = function () { control.gazeX = 0; control.gazeY = 0; };
      host.addEventListener("pointermove", onPointerMove);
      host.addEventListener("pointerleave", onPointerLeave);

      const resize = function () {
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
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

      Promise.all(Object.keys(TEXTURES).map(function (name) {
        return loadImage(TEXTURES[name]).then(function (image) { return [name, createTexture(gl, image)]; });
      })).then(function (loaded) {
        if (disposed) {
          loaded.forEach(function (entry) { gl.deleteTexture(entry[1]); });
          return;
        }
        loaded.forEach(function (entry) { textures[entry[0]] = entry[1]; });
        program = createProgram(gl);
        vertexBuffer = gl.createBuffer();
        if (!vertexBuffer) throw new Error("WebGL buffer allocation failed");
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
          -1, -1, 1, -1, -1, 1,
          -1, 1, 1, -1, 1, 1,
        ]), gl.STATIC_DRAW);
        gl.useProgram(program);
        const locations = {
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

        const draw = function (texture, opacity, maskMode, scaleX, scaleY, translateY, breath) {
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

        const animate = function (now) {
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

          const targets = { aa: 0, e: 0, o: 0 };
          if (performance.now() < control.visemeUntil && control.viseme) {
            targets[control.viseme] = control.visemeLevel;
          } else if (control.audioLevel > 0.025) {
            const level = Math.min(0.94, control.audioLevel * 1.32);
            targets[control.audioLevel > 0.38 ? "aa" : control.audioLevel > 0.17 ? "e" : "o"] = level;
          } else if (currentState === "speaking") {
            const cadence = ["aa", "e", "o", "e", "aa", "o"];
            targets[cadence[Math.floor(elapsed * 8.2) % cadence.length]] = 0.24 + Math.abs(Math.sin(elapsed * 7.7) * Math.cos(elapsed * 3.1)) * 0.48;
          }
          control.audioLevel = damp(control.audioLevel, 0, 9, delta);
          Object.keys(mouthWeights).forEach(function (shape) {
            mouthWeights[shape] = damp(mouthWeights[shape], targets[shape], 22, delta);
          });

          lookX = damp(lookX, control.gazeX, 4.8, delta);
          lookY = damp(lookY, control.gazeY, 4.8, delta);
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
          draw(textures.base, 1, 0, scaleX, scaleY, translateY, breath);
          draw(textures.blink, blinkOpacity, 1, scaleX, scaleY, translateY, breath);
          draw(textures.aa, mouthWeights.aa, 2, scaleX, scaleY, translateY, breath);
          draw(textures.e, mouthWeights.e, 2, scaleX, scaleY, translateY, breath);
          draw(textures.o, mouthWeights.o, 2, scaleX, scaleY, translateY, breath);
          frameId = requestAnimationFrame(animate);
        };

        setReady(true);
        frameId = requestAnimationFrame(animate);
      }).catch(function () {
        setReady(false);
      });

      return function () {
        disposed = true;
        cancelAnimationFrame(frameId);
        observer.disconnect();
        host.removeEventListener("pointermove", onPointerMove);
        host.removeEventListener("pointerleave", onPointerLeave);
        if (props.controllerRef.current === controller) props.controllerRef.current = null;
        if (window.enkiAvatar === controller) delete window.enkiAvatar;
        Object.keys(textures).forEach(function (name) { gl.deleteTexture(textures[name]); });
        if (vertexBuffer) gl.deleteBuffer(vertexBuffer);
        if (program) gl.deleteProgram(program);
        canvas.remove();
      };
    }, []);

    return h("div", {
      ref: hostRef,
      className: "enki-avatar-canvas" + (ready ? " is-ready" : ""),
      role: "img",
      "aria-label": "Portrait animé d'E*NKI face caméra",
    }, h("img", { className: "enki-avatar-poster", src: TEXTURES.base, alt: "E*NKI face caméra" }));
  }

  function EnkiAvatarPage() {
    const [mode, setModeState] = useState("idle");
    const [connection, setConnection] = useState("initialisation");
    const [sessionReady, setSessionReady] = useState(false);
    const [conversation, setConversation] = useState(false);
    const [recording, setRecording] = useState(false);
    const [busy, setBusyState] = useState(false);
    const [input, setInput] = useState("");
    const [userText, setUserText] = useState("");
    const [assistantText, setAssistantText] = useState("");
    const [caption, setCaption] = useState(STATE_COPY.idle.caption);
    const [error, setError] = useState("");

    const mountedRef = useRef(true);
    const modeRef = useRef("idle");
    const busyRef = useRef(false);
    const conversationRef = useRef(false);
    const socketRef = useRef(null);
    const reconnectRef = useRef(0);
    const requestIdRef = useRef(0);
    const pendingRef = useRef(new Map());
    const sessionRef = useRef("");
    const assistantRef = useRef("");
    const controllerRef = useRef(null);
    const audioRef = useRef(null);
    const ttsRef = useRef(null);
    const mediaRef = useRef(null);
    const eventHandlerRef = useRef(null);

    function updateMode(next, customCaption) {
      modeRef.current = next;
      setModeState(next);
      setCaption(customCaption || STATE_COPY[next].caption);
    }

    function updateBusy(next) {
      busyRef.current = next;
      setBusyState(next);
    }

    function rejectPending(message) {
      pendingRef.current.forEach(function (call) {
        clearTimeout(call.timer);
        call.reject(new Error(message));
      });
      pendingRef.current.clear();
    }

    function rpc(method, params, timeoutMs) {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return Promise.reject(new Error("Le gateway Hermes n'est pas connecté"));
      }
      const id = "enki-" + (++requestIdRef.current);
      return new Promise(function (resolve, reject) {
        const timer = window.setTimeout(function () {
          pendingRef.current.delete(id);
          reject(new Error("Délai Hermes dépassé pour " + method));
        }, timeoutMs || 120000);
        pendingRef.current.set(id, { resolve: resolve, reject: reject, timer: timer });
        socket.send(JSON.stringify({ jsonrpc: "2.0", id: id, method: method, params: params || {} }));
      });
    }

    function ensureAudio() {
      if (!audioRef.current) {
        const AudioCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtor) throw new Error("Audio Web indisponible dans ce navigateur");
        const context = new AudioCtor();
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.72;
        analyser.connect(context.destination);
        audioRef.current = {
          context: context,
          analyser: analyser,
          nextAt: context.currentTime,
          sources: new Set(),
          meterFrame: 0,
          finishTimer: 0,
        };
      }
      const audio = audioRef.current;
      if (audio.context.state === "suspended") audio.context.resume().catch(function () {});
      return audio;
    }

    function startOutputMeter() {
      const audio = audioRef.current;
      if (!audio || audio.meterFrame) return;
      const values = new Uint8Array(audio.analyser.fftSize);
      const sample = function () {
        if (!audioRef.current || audioRef.current !== audio) return;
        audio.analyser.getByteTimeDomainData(values);
        let sum = 0;
        for (let i = 0; i < values.length; i += 1) {
          const value = (values[i] - 128) / 128;
          sum += value * value;
        }
        const rms = Math.sqrt(sum / values.length);
        if (controllerRef.current) controllerRef.current.setInputLevel(Math.min(1, rms * 5.2));
        if (modeRef.current === "speaking" || audio.context.currentTime < audio.nextAt + 0.12) {
          audio.meterFrame = requestAnimationFrame(sample);
        } else {
          audio.meterFrame = 0;
          if (controllerRef.current) controllerRef.current.setInputLevel(0);
        }
      };
      audio.meterFrame = requestAnimationFrame(sample);
    }

    function scheduleAudioBuffer(buffer) {
      const audio = ensureAudio();
      const source = audio.context.createBufferSource();
      source.buffer = buffer;
      source.connect(audio.analyser);
      const startAt = Math.max(audio.context.currentTime + 0.025, audio.nextAt);
      source.start(startAt);
      audio.nextAt = startAt + buffer.duration;
      audio.sources.add(source);
      source.onended = function () { audio.sources.delete(source); };
      updateMode("speaking");
      startOutputMeter();
    }

    function schedulePcm(arrayBuffer, sampleRate) {
      const audio = ensureAudio();
      const samples = new Int16Array(arrayBuffer);
      const buffer = audio.context.createBuffer(1, samples.length, sampleRate || 24000);
      const channel = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i += 1) channel[i] = samples[i] / 32768;
      scheduleAudioBuffer(buffer);
    }

    function armListeningSoon() {
      if (!conversationRef.current || busyRef.current || modeRef.current === "speaking") return;
      window.setTimeout(function () {
        if (conversationRef.current && !busyRef.current && modeRef.current !== "speaking") armListening();
      }, 170);
    }

    function completeSpeech() {
      if (!mountedRef.current) return;
      if (controllerRef.current) controllerRef.current.setInputLevel(0);
      updateMode("idle");
      armListeningSoon();
    }

    function finishWhenDrained() {
      const audio = audioRef.current;
      if (!audio) {
        completeSpeech();
        return;
      }
      clearTimeout(audio.finishTimer);
      const delay = Math.max(50, (audio.nextAt - audio.context.currentTime) * 1000 + 100);
      audio.finishTimer = window.setTimeout(completeSpeech, delay);
    }

    function stopAudioOutput() {
      const audio = audioRef.current;
      if (!audio) return;
      clearTimeout(audio.finishTimer);
      audio.finishTimer = 0;
      if (audio.meterFrame) cancelAnimationFrame(audio.meterFrame);
      audio.meterFrame = 0;
      audio.sources.forEach(function (source) {
        try { source.stop(); } catch (_) {}
      });
      audio.sources.clear();
      audio.nextAt = audio.context.currentTime;
      if (controllerRef.current) controllerRef.current.setInputLevel(0);
    }

    function stopTts() {
      const current = ttsRef.current;
      if (current && current.socket) {
        try {
          if (current.socket.readyState === WebSocket.OPEN) current.socket.send(JSON.stringify({ stop: true }));
          current.socket.close();
        } catch (_) {}
      }
      ttsRef.current = null;
      stopAudioOutput();
    }

    async function speakFallback(current) {
      if (!current || current.fallbackStarted || !current.fullText.trim()) {
        if (current && current.done) finishWhenDrained();
        return;
      }
      current.fallbackStarted = true;
      try {
        const result = await SDK.fetchJSON("/api/audio/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: current.fullText.trim() }),
        });
        if (ttsRef.current !== current) return;
        const response = await fetch(result.data_url);
        const bytes = await response.arrayBuffer();
        const audio = ensureAudio();
        const decoded = await audio.context.decodeAudioData(bytes.slice(0));
        if (ttsRef.current !== current) return;
        scheduleAudioBuffer(decoded);
        finishWhenDrained();
      } catch (reason) {
        if (ttsRef.current === current) {
          setError("Réponse reçue, mais la voix Hermes n'est pas disponible.");
          completeSpeech();
        }
      }
    }

    function startTts() {
      stopTts();
      const current = {
        socket: null,
        open: false,
        pending: [],
        done: false,
        fullText: "",
        fallback: false,
        fallbackStarted: false,
        sampleRate: 24000,
      };
      ttsRef.current = current;
      Promise.resolve().then(function () {
        return SDK.buildWsUrl("/api/audio/speak-stream");
      }).then(function (url) {
        if (ttsRef.current !== current) return;
        const socket = new WebSocket(url);
        current.socket = socket;
        socket.binaryType = "arraybuffer";
        socket.onopen = function () {
          if (ttsRef.current !== current) return;
          current.open = true;
          current.pending.forEach(function (text) { socket.send(JSON.stringify({ text: text })); });
          current.pending = [];
          if (current.done) socket.send(JSON.stringify({ done: true }));
        };
        socket.onmessage = function (event) {
          if (ttsRef.current !== current) return;
          if (typeof event.data === "string") {
            try {
              const frame = JSON.parse(event.data);
              if (frame.type === "start") current.sampleRate = Number(frame.sample_rate) || 24000;
              if (frame.type === "fallback") {
                current.fallback = true;
                if (current.done) speakFallback(current);
              }
              if (frame.type === "end") finishWhenDrained();
            } catch (_) {}
            return;
          }
          if (event.data instanceof ArrayBuffer) schedulePcm(event.data, current.sampleRate);
        };
        socket.onerror = function () { current.fallback = true; };
        socket.onclose = function () {
          current.open = false;
          if (ttsRef.current === current && current.done && current.fallback) speakFallback(current);
        };
      }).catch(function () {
        current.fallback = true;
        if (current.done) speakFallback(current);
      });
    }

    function feedTts(text) {
      const current = ttsRef.current;
      if (!current || !text) return;
      current.fullText += text;
      if (current.open && current.socket && current.socket.readyState === WebSocket.OPEN) {
        current.socket.send(JSON.stringify({ text: text }));
      } else {
        current.pending.push(text);
      }
    }

    function finishTts() {
      const current = ttsRef.current;
      if (!current) {
        completeSpeech();
        return;
      }
      current.done = true;
      if (current.fallback) {
        speakFallback(current);
      } else if (current.open && current.socket && current.socket.readyState === WebSocket.OPEN) {
        current.socket.send(JSON.stringify({ done: true }));
      }
    }

    function eventBelongsToSession(event) {
      return !event.session_id || !sessionRef.current || event.session_id === sessionRef.current;
    }

    function handleGatewayEvent(event) {
      if (!event || !event.type || !eventBelongsToSession(event)) return;
      const payload = event.payload || {};
      if (event.type === "message.start") {
        assistantRef.current = "";
        setAssistantText("");
        updateMode("thinking");
        startTts();
      } else if (event.type === "thinking.delta" || event.type === "reasoning.delta") {
        updateMode("thinking");
      } else if (event.type === "tool.start" || event.type === "tool.progress" || event.type === "tool.generating") {
        updateMode("thinking", "E*NKI agit dans Hermes");
      } else if (event.type === "message.delta") {
        const delta = typeof payload.text === "string" ? payload.text : "";
        if (delta) {
          if (!ttsRef.current) startTts();
          assistantRef.current += delta;
          setAssistantText(assistantRef.current);
          feedTts(delta);
        }
      } else if (event.type === "message.complete") {
        const completed = typeof payload.text === "string" ? payload.text : "";
        if (completed && completed.length >= assistantRef.current.length) {
          if (!assistantRef.current) {
            if (!ttsRef.current) startTts();
            feedTts(completed);
          }
          assistantRef.current = completed;
          setAssistantText(completed);
        }
        updateBusy(false);
        finishTts();
      } else if (event.type.endsWith(".request")) {
        updateMode("thinking", "Validation requise dans Hermes");
      } else if (event.type === "error") {
        updateBusy(false);
        setError(payload.message || payload.error || "Hermes a interrompu la réponse.");
        stopTts();
        updateMode("idle");
        armListeningSoon();
      }
    }
    eventHandlerRef.current = handleGatewayEvent;

    useEffect(function () {
      mountedRef.current = true;
      let disposed = false;

      const connect = async function () {
        setConnection("connexion");
        setSessionReady(false);
        try {
          if (typeof SDK.buildWsUrl !== "function") throw new Error("SDK Hermes 1.1 requis");
          const url = await SDK.buildWsUrl("/api/ws");
          if (disposed) return;
          const socket = new WebSocket(url);
          socketRef.current = socket;
          socket.onopen = async function () {
            if (disposed || socketRef.current !== socket) return;
            setConnection("session");
            try {
              const created = await rpc("session.create", {});
              if (disposed || socketRef.current !== socket) return;
              sessionRef.current = created && created.session_id ? created.session_id : "";
              if (!sessionRef.current) throw new Error("Session Hermes invalide");
              setSessionReady(true);
              setConnection("en ligne");
              setError("");
            } catch (reason) {
              setConnection("erreur");
              setError(reason instanceof Error ? reason.message : String(reason));
            }
          };
          socket.onmessage = function (message) {
            let frame;
            try { frame = JSON.parse(String(message.data)); } catch (_) { return; }
            if (frame.id != null) {
              const pending = pendingRef.current.get(frame.id);
              if (!pending) return;
              pendingRef.current.delete(frame.id);
              clearTimeout(pending.timer);
              if (frame.error) pending.reject(new Error(frame.error.message || "Hermes RPC error"));
              else pending.resolve(frame.result);
              return;
            }
            if (frame.method === "event" && frame.params && eventHandlerRef.current) {
              eventHandlerRef.current(frame.params);
            }
          };
          socket.onerror = function () { setConnection("erreur"); };
          socket.onclose = function () {
            if (socketRef.current !== socket) return;
            socketRef.current = null;
            sessionRef.current = "";
            setSessionReady(false);
            setConnection("reconnexion");
            rejectPending("Connexion Hermes interrompue");
            if (!disposed) reconnectRef.current = window.setTimeout(connect, 1800);
          };
        } catch (reason) {
          setConnection("erreur");
          setError(reason instanceof Error ? reason.message : String(reason));
          if (!disposed) reconnectRef.current = window.setTimeout(connect, 2500);
        }
      };

      connect();
      return function () {
        disposed = true;
        mountedRef.current = false;
        clearTimeout(reconnectRef.current);
        rejectPending("Page E*NKI fermée");
        const socket = socketRef.current;
        socketRef.current = null;
        if (socket) socket.close();
        stopConversation();
        stopTts();
        if (audioRef.current) {
          const audio = audioRef.current;
          audioRef.current = null;
          if (audio.meterFrame) cancelAnimationFrame(audio.meterFrame);
          clearTimeout(audio.finishTimer);
          audio.context.close().catch(function () {});
        }
      };
    }, []);

    useEffect(function () {
      const onExternalState = function (event) {
        const next = event.detail;
        if (next && STATE_COPY[next]) updateMode(next);
      };
      window.addEventListener("enki:state", onExternalState);
      return function () { window.removeEventListener("enki:state", onExternalState); };
    }, []);

    function stopRecorder(discard) {
      const media = mediaRef.current;
      if (!media || !media.recorder) return;
      media.discard = Boolean(discard);
      if (media.vadFrame) cancelAnimationFrame(media.vadFrame);
      media.vadFrame = 0;
      const recorder = media.recorder;
      media.recorder = null;
      setRecording(false);
      if (recorder.state !== "inactive") {
        try { recorder.requestData(); } catch (_) {}
        recorder.stop();
      }
    }

    function blobToDataUrl(blob) {
      return new Promise(function (resolve, reject) {
        const reader = new FileReader();
        reader.onload = function () { resolve(String(reader.result || "")); };
        reader.onerror = function () { reject(reader.error || new Error("Lecture audio impossible")); };
        reader.readAsDataURL(blob);
      });
    }

    async function transcribeAndSubmit(blob) {
      updateBusy(true);
      updateMode("thinking", "Transcription de ta voix");
      try {
        const dataUrl = await blobToDataUrl(blob);
        const result = await SDK.fetchJSON("/api/audio/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data_url: dataUrl, mime_type: blob.type || "audio/webm" }),
        });
        const transcript = String(result.transcript || "").trim();
        if (!transcript) {
          updateBusy(false);
          updateMode("idle", "Aucune parole détectée");
          armListeningSoon();
          return;
        }
        await submitPrompt(transcript, true);
      } catch (reason) {
        updateBusy(false);
        setError(reason instanceof Error ? reason.message : String(reason));
        updateMode("idle");
        armListeningSoon();
      }
    }

    function armListening() {
      const media = mediaRef.current;
      if (!media || !conversationRef.current || busyRef.current || modeRef.current === "speaking" || media.recorder) return;
      if (typeof MediaRecorder === "undefined") {
        setError("L'enregistrement audio n'est pas disponible dans ce navigateur.");
        stopConversation();
        return;
      }
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(function (candidate) {
        return !MediaRecorder.isTypeSupported || MediaRecorder.isTypeSupported(candidate);
      });
      const recorder = mime ? new MediaRecorder(media.stream, { mimeType: mime }) : new MediaRecorder(media.stream);
      const chunks = [];
      media.recorder = recorder;
      media.discard = false;
      media.speechDetected = false;
      media.startedAt = performance.now();
      media.firstVoiceAt = 0;
      media.lastVoiceAt = 0;
      recorder.ondataavailable = function (event) { if (event.data && event.data.size) chunks.push(event.data); };
      recorder.onstop = function () {
        const discard = media.discard;
        const detected = media.speechDetected;
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        if (!conversationRef.current) return;
        if (discard || !detected || blob.size < 900) {
          armListeningSoon();
          return;
        }
        transcribeAndSubmit(blob);
      };
      recorder.start(180);
      setRecording(true);
      updateMode("listening");
      const values = new Uint8Array(media.analyser.fftSize);
      const sample = function () {
        if (!conversationRef.current || media.recorder !== recorder || recorder.state === "inactive") return;
        media.analyser.getByteTimeDomainData(values);
        let sum = 0;
        for (let i = 0; i < values.length; i += 1) {
          const value = (values[i] - 128) / 128;
          sum += value * value;
        }
        const rms = Math.sqrt(sum / values.length);
        const level = Math.min(1, rms * 5.6);
        if (controllerRef.current) controllerRef.current.setInputLevel(level);
        const now = performance.now();
        if (level > 0.085) {
          if (!media.speechDetected) media.firstVoiceAt = now;
          media.speechDetected = true;
          media.lastVoiceAt = now;
        }
        const completedPhrase = media.speechDetected && now - media.lastVoiceAt > 820 && now - media.firstVoiceAt > 380;
        const speechLimit = media.speechDetected && now - media.firstVoiceAt > 16000;
        const emptyLimit = !media.speechDetected && now - media.startedAt > 12000;
        if (completedPhrase || speechLimit) {
          stopRecorder(false);
          return;
        }
        if (emptyLimit) {
          stopRecorder(true);
          return;
        }
        media.vadFrame = requestAnimationFrame(sample);
      };
      media.vadFrame = requestAnimationFrame(sample);
    }

    async function startConversation() {
      setError("");
      try {
        ensureAudio();
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("Microphone indisponible");
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        if (!mountedRef.current) {
          stream.getTracks().forEach(function (track) { track.stop(); });
          return;
        }
        const AudioCtor = window.AudioContext || window.webkitAudioContext;
        const context = new AudioCtor();
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.56;
        context.createMediaStreamSource(stream).connect(analyser);
        mediaRef.current = { stream: stream, context: context, analyser: analyser, recorder: null, vadFrame: 0 };
        conversationRef.current = true;
        setConversation(true);
        armListening();
      } catch (reason) {
        conversationRef.current = false;
        setConversation(false);
        setError(reason instanceof Error ? reason.message : String(reason));
      }
    }

    function stopConversation() {
      conversationRef.current = false;
      setConversation(false);
      stopRecorder(true);
      const media = mediaRef.current;
      mediaRef.current = null;
      if (media) {
        if (media.vadFrame) cancelAnimationFrame(media.vadFrame);
        media.stream.getTracks().forEach(function (track) { track.stop(); });
        media.context.close().catch(function () {});
      }
      setRecording(false);
      if (!busyRef.current && modeRef.current !== "speaking") updateMode("idle");
    }

    async function submitPrompt(text, fromVoice) {
      const clean = String(text || "").trim();
      if (!clean || !sessionRef.current || busyRef.current && !fromVoice) return;
      setError("");
      if (mediaRef.current && mediaRef.current.recorder) stopRecorder(true);
      updateBusy(true);
      updateMode("thinking");
      setUserText(clean);
      assistantRef.current = "";
      setAssistantText("");
      setInput("");
      try {
        await rpc("prompt.submit", { session_id: sessionRef.current, text: clean });
      } catch (reason) {
        updateBusy(false);
        setError(reason instanceof Error ? reason.message : String(reason));
        updateMode("idle");
        armListeningSoon();
      }
    }

    async function interruptTurn() {
      stopTts();
      try {
        if (sessionRef.current) await rpc("session.interrupt", { session_id: sessionRef.current }, 15000);
      } catch (_) {}
      updateBusy(false);
      updateMode("idle", "Interrompu — je t'écoute");
      armListeningSoon();
    }

    function onSubmit(event) {
      event.preventDefault();
      ensureAudio();
      submitPrompt(input, false);
    }

    const showInterrupt = busy || mode === "speaking";
    const connectionOnline = connection === "en ligne";
    const canSend = sessionReady && !busy && input.trim().length > 0;

    return h("section", { className: "enki-plugin enki-state-" + mode },
      h("div", { className: "enki-stage" },
        h(AvatarCanvas, { state: mode, controllerRef: controllerRef }),
        h("div", { className: "enki-stage-grid", "aria-hidden": "true" }),
        h("div", { className: "enki-stage-top" },
          h("div", { className: "enki-brand" },
            h("span", { className: "enki-brand-mark", "aria-hidden": "true" }, h("i"), h("i"), h("i")),
            h("span", { className: "enki-brand-copy" }, h("strong", null, "E*NKI"), h("span", null, "Hermes / portrait temps réel")),
          ),
          h("span", { className: "enki-status" },
            h("i", { className: "enki-status-dot", "aria-hidden": "true" }),
            STATE_COPY[mode].label,
          ),
        ),
        h("div", { className: "enki-stage-bottom" },
          h("div", { className: "enki-caption", "aria-live": "polite" },
            h("span", { className: "enki-kicker" }, recording ? "MICRO OUVERT / DÉTECTION DE VOIX" : "AGENT HERMES / SESSION DIRECTE"),
            h("strong", null, assistantText || caption),
          ),
          h("div", { className: "enki-meter", "aria-hidden": "true" },
            Array.from({ length: 18 }, function (_, index) { return h("i", { key: index }); }),
          ),
        ),
      ),
      h("aside", { className: "enki-console", "aria-label": "Conversation avec E*NKI" },
        h("header", { className: "enki-console-head" },
          h("h2", null, "Conversation"),
          h("span", { className: "enki-connection" + (connectionOnline ? " is-online" : "") }, connection),
        ),
        h("div", { className: "enki-thread", "aria-live": "polite" },
          !userText && !assistantText ? h("p", { className: "enki-empty" }, "Active le mode conversation et parle normalement. E*NKI détecte la fin de ta phrase, répond en streaming et reprend l'écoute.") : null,
          userText ? h("div", { className: "enki-message enki-message-user" }, h("span", { className: "enki-meta" }, "Toi"), h("p", null, userText)) : null,
          assistantText ? h("div", { className: "enki-message enki-message-enki" }, h("span", { className: "enki-meta" }, "E*NKI"), h("p", null, assistantText)) : null,
        ),
        error ? h("p", { className: "enki-error", role: "alert" }, error) : null,
        h("div", { className: "enki-actions" },
          h("div", { className: "enki-conversation-row" },
            h("button", {
              type: "button",
              className: "enki-talk" + (conversation ? " is-active" : ""),
              disabled: !sessionReady,
              onClick: conversation ? stopConversation : startConversation,
            }, conversation ? (recording ? "● Conversation active — parle" : "● Conversation active") : "Activer la conversation"),
            showInterrupt ? h("button", { type: "button", className: "enki-interrupt", onClick: interruptTurn }, "Interrompre") : null,
          ),
          h("form", { className: "enki-composer", onSubmit: onSubmit },
            h("input", {
              value: input,
              onChange: function (event) { setInput(event.target.value); },
              placeholder: sessionReady ? "Ou écris à E*NKI…" : "Connexion à Hermes…",
              disabled: !sessionReady || busy,
              "aria-label": "Message pour E*NKI",
            }),
            h("button", { type: "submit", className: "enki-send", disabled: !canSend, "aria-label": "Envoyer" }, "↗"),
          ),
          h("p", { className: "enki-hint" }, "Même session, mêmes outils et même mémoire qu'Hermes. Aucun secret n'est exposé au navigateur."),
        ),
      ),
    );
  }

  registry.register("enki-avatar", EnkiAvatarPage);
})();

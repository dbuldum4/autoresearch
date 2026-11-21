import { useEffect, useRef, useState } from "react";

import { observeResize } from "../lib/observeResize";
import { cn } from "../lib/utils";

/**
 * The fork's signature: a Clifford strange attractor drawn as light. Seeds are iterated in the
 * vertex shader and accumulated additively, so density becomes brightness, as in a long exposure.
 * The parameters drift while an agent works. An idle field drifts briefly, then rests on its
 * last frame, so a screen nobody is working on costs no GPU time.
 */

const POINT_COUNT = 260_000;
const ITERATIONS = 14;
// Each frame keeps this share of the last one, so the image is a rolling long exposure.
const PERSISTENCE = 0.9;
const WARMUP_FRAMES = 28;
const MAX_PIXEL_RATIO = 1.5;
const FRAME_INTERVAL_MS = 1000 / 30;
// How long an idle field keeps moving after it appears or work ends, and how much of that it
// spends slowing to a stop.
const IDLE_DRIFT_MS = 9000;
const IDLE_SETTLE_MS = 3000;
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|software/i;

const POINT_VERTEX = `#version 300 es
precision highp float;
in vec2 seed;
uniform vec4 params;
uniform vec2 scale;
uniform vec2 jitter;
uniform float pointSize;
out float tone;
void main() {
  // New seeds every frame: fract keeps them inside the seeding square.
  vec2 p = fract(seed + jitter) * 4.0 - 2.0;
  vec2 q = p;
  for (int i = 0; i < ${ITERATIONS}; i++) {
    q = p;
    p = vec2(
      sin(params.x * q.y) + params.z * cos(params.x * q.x),
      sin(params.y * q.x) + params.w * cos(params.y * q.y)
    );
  }
  // How far the last step travelled: fast orbits shift blue, slow ones stay warm.
  tone = clamp(length(p - q) * 0.42, 0.0, 1.0);
  gl_Position = vec4(p * scale, 0.0, 1.0);
  gl_PointSize = pointSize;
}`;

const POINT_FRAGMENT = `#version 300 es
precision highp float;
in float tone;
uniform float energy;
out vec4 color;
void main() {
  color = vec4(energy, energy * tone, 0.0, 1.0);
}`;

const SCREEN_VERTEX = `#version 300 es
in vec2 corner;
out vec2 uv;
void main() {
  uv = corner * 0.5 + 0.5;
  gl_Position = vec4(corner, 0.0, 1.0);
}`;

const SCREEN_FRAGMENT = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D density;
uniform float exposure;
uniform float intensity;
out vec4 color;
void main() {
  vec2 d = texture(density, uv).rg;
  float light = 1.0 - exp(-d.r * exposure);
  float tone = d.r > 0.0 ? d.g / d.r : 0.0;
  vec3 ember = vec3(0.76, 0.34, 0.12);
  vec3 corona = vec3(1.0, 0.70, 0.42);
  vec3 core = vec3(1.0, 0.945, 0.86);
  vec3 blueshift = vec3(0.52, 0.71, 1.0);
  vec3 warm = mix(ember, corona, smoothstep(0.0, 0.55, light));
  warm = mix(warm, core, smoothstep(0.55, 1.0, light));
  vec3 lit = mix(warm, blueshift, smoothstep(0.35, 0.95, tone) * 0.55 * (1.0 - light * 0.6));
  float alpha = pow(light, 0.82) * intensity;
  color = vec4(lit * alpha, alpha);
}`;

type Params = readonly [number, number, number, number];

// Clifford parameter sets with dense, legible structure. Each surface picks one form.
const FORMS: ReadonlyArray<Params> = [
  [-1.4, 1.6, 1.0, 0.7],
  [1.7, 1.7, 0.6, 1.2],
  [-1.8, -2.0, -0.5, -0.9],
  [1.5, -1.8, 1.6, 0.9],
];
// The form wanders within this radius of its set; further out it can collapse to a thin orbit.
const WANDER = 0.11;
const WANDER_RATES: Params = [1, 0.618, 0.414, 0.732];
const IDLE_SPEED = 0.05;
const ACTIVE_SPEED = 0.4;

function paramsAt(form: Params, phase: number): Params {
  return [
    form[0] + WANDER * Math.sin(phase * WANDER_RATES[0]),
    form[1] + WANDER * Math.sin(phase * WANDER_RATES[1] + 1.3),
    form[2] + WANDER * Math.sin(phase * WANDER_RATES[2] + 2.1),
    form[3] + WANDER * Math.sin(phase * WANDER_RATES[3] + 4.2),
  ];
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function link(gl: WebGL2RenderingContext, vertex: string, fragment: string): WebGLProgram | null {
  const vs = compile(gl, gl.VERTEX_SHADER, vertex);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragment);
  const program = gl.createProgram();
  if (!vs || !fs || !program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : null;
}

interface Renderer {
  /** Adds one exposure at this phase to the rolling image and presents it. */
  readonly draw: (phase: number) => void;
  /** Rebuilds the image from nothing, for a first frame or after a resize. */
  readonly develop: (phase: number) => void;
  /** True when the canvas changed size, which also clears the image. */
  readonly resize: () => boolean;
  readonly dispose: () => void;
}

function createRenderer(
  canvas: HTMLCanvasElement,
  form: Params,
  intensity: number,
): Renderer | null {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: false,
    depth: false,
    premultipliedAlpha: true,
    powerPreference: "low-power",
  });
  if (!gl) return null;
  // A software rasterizer runs the point shader on the CPU, which it cannot afford.
  const rendererInfo = gl.getExtension("WEBGL_debug_renderer_info");
  if (
    rendererInfo &&
    SOFTWARE_RENDERER.test(String(gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL)))
  )
    return null;
  // Density needs more than 8 bits, or dim regions band and bright ones clip.
  if (!gl.getExtension("EXT_color_buffer_float") && !gl.getExtension("EXT_color_buffer_half_float"))
    return null;

  const points = link(gl, POINT_VERTEX, POINT_FRAGMENT);
  const screen = link(gl, SCREEN_VERTEX, SCREEN_FRAGMENT);
  if (!points || !screen) return null;

  const seeds = new Float32Array(POINT_COUNT * 2);
  for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
  const seedBuffer = gl.createBuffer();
  const seedArray = gl.createVertexArray();
  gl.bindVertexArray(seedArray);
  gl.bindBuffer(gl.ARRAY_BUFFER, seedBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
  const seedLocation = gl.getAttribLocation(points, "seed");
  gl.enableVertexAttribArray(seedLocation);
  gl.vertexAttribPointer(seedLocation, 2, gl.FLOAT, false, 0, 0);

  const cornerBuffer = gl.createBuffer();
  const cornerArray = gl.createVertexArray();
  gl.bindVertexArray(cornerArray);
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const cornerLocation = gl.getAttribLocation(screen, "corner");
  gl.enableVertexAttribArray(cornerLocation);
  gl.vertexAttribPointer(cornerLocation, 2, gl.FLOAT, false, 0, 0);

  const densityTexture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();
  let width = 0;
  let height = 0;

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    const nextWidth = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const nextHeight = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (nextWidth === width && nextHeight === height) return false;
    width = nextWidth;
    height = nextHeight;
    canvas.width = width;
    canvas.height = height;
    gl.bindTexture(gl.TEXTURE_2D, densityTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, width, height, 0, gl.RG, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, densityTexture, 0);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return true;
  };
  resize();
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) return null;

  const uniform = (program: WebGLProgram, name: string) => gl.getUniformLocation(program, name);
  const pointUniforms = {
    params: uniform(points, "params"),
    jitter: uniform(points, "jitter"),
    scale: uniform(points, "scale"),
    pointSize: uniform(points, "pointSize"),
    energy: uniform(points, "energy"),
  };
  const screenUniforms = {
    density: uniform(screen, "density"),
    exposure: uniform(screen, "exposure"),
    intensity: uniform(screen, "intensity"),
  };

  const expose = (phase: number) => {
    const params = paramsAt(form, phase);
    // The attractor lives in roughly [-2.6, 2.6]; fit it to the short side.
    const extent = 2.75;
    const short = Math.min(width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.viewport(0, 0, width, height);
    gl.enable(gl.BLEND);
    // Fade what is already there, then add this frame's points on top.
    gl.blendColor(PERSISTENCE, PERSISTENCE, PERSISTENCE, PERSISTENCE);
    gl.blendFunc(gl.ZERO, gl.CONSTANT_COLOR);
    gl.useProgram(screen);
    // The fade ignores its source colour, and sampling the bound target is an error.
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindVertexArray(cornerArray);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(points);
    gl.uniform2f(pointUniforms.jitter, Math.random(), Math.random());
    gl.uniform4f(pointUniforms.params, params[0], params[1], params[2], params[3]);
    gl.uniform2f(pointUniforms.scale, short / width / extent, short / height / extent);
    gl.uniform1f(pointUniforms.pointSize, 1);
    // Keeps brightness steady across canvas sizes: fewer pixels collect more points each.
    gl.uniform1f(pointUniforms.energy, ((short * short) / (POINT_COUNT * 9)) * (1 - PERSISTENCE));
    gl.bindVertexArray(seedArray);
    gl.drawArrays(gl.POINTS, 0, POINT_COUNT);
  };

  const present = () => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.BLEND);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(screen);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, densityTexture);
    gl.uniform1i(screenUniforms.density, 0);
    gl.uniform1f(screenUniforms.exposure, 1.7);
    gl.uniform1f(screenUniforms.intensity, intensity);
    gl.bindVertexArray(cornerArray);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  const draw = (phase: number) => {
    expose(phase);
    present();
  };

  const develop = (phase: number) => {
    for (let i = 0; i < WARMUP_FRAMES; i++) expose(phase);
    present();
  };

  const dispose = () => {
    gl.deleteBuffer(seedBuffer);
    gl.deleteBuffer(cornerBuffer);
    gl.deleteVertexArray(seedArray);
    gl.deleteVertexArray(cornerArray);
    gl.deleteTexture(densityTexture);
    gl.deleteFramebuffer(framebuffer);
    gl.deleteProgram(points);
    gl.deleteProgram(screen);
  };

  return { draw, develop, resize, dispose };
}

export function AttractorField({
  className,
  active = false,
  intensity = 1,
  form = 0,
}: {
  className?: string;
  /** An agent is working: the field drifts faster. */
  active?: boolean;
  intensity?: number;
  /** Which attractor to draw, so separate surfaces show separate forms. */
  form?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- owns a WebGL context and its frame loop for the canvas's lifetime
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = createRenderer(canvas, FORMS[form % FORMS.length]!, intensity);
    if (!renderer) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let position = 0;
    let speed = 0;
    let frame = 0;
    let last = 0;
    let visible = true;
    let restAt = 0;

    const tick = (now: number) => {
      // Read from the DOM so a change of pace does not rebuild the WebGL context.
      const working = canvas.dataset.active === "true";
      if (!visible || document.hidden || (!working && now >= restAt)) {
        frame = 0;
        return;
      }
      frame = requestAnimationFrame(tick);
      const elapsed = now - last;
      if (elapsed < FRAME_INTERVAL_MS) return;
      last = now;
      // Ease toward the target speed so starting work is a swell and resting is a glide.
      const target = working ? ACTIVE_SPEED : now < restAt - IDLE_SETTLE_MS ? IDLE_SPEED : 0;
      speed += (target - speed) * 0.04;
      position += (speed * Math.min(elapsed, 100)) / 1000;
      renderer.draw(position);
    };

    const wake = () => {
      if (reducedMotion.matches) return;
      restAt = performance.now() + IDLE_DRIFT_MS;
      if (frame === 0) frame = requestAnimationFrame(tick);
    };

    const start = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      renderer.resize();
      renderer.develop(position);
      setReady(true);
      wake();
    };

    const stopObservingSize = observeResize(canvas, () => {
      if (renderer.resize()) renderer.develop(position);
    });
    const intersectionObserver = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      if (visible) wake();
    });
    intersectionObserver.observe(canvas);
    // Work starting or ending sets the field moving again.
    const activityObserver = new MutationObserver(wake);
    activityObserver.observe(canvas, { attributeFilter: ["data-active"] });
    document.addEventListener("visibilitychange", wake);
    reducedMotion.addEventListener("change", start);
    start();

    return () => {
      cancelAnimationFrame(frame);
      stopObservingSize();
      intersectionObserver.disconnect();
      activityObserver.disconnect();
      document.removeEventListener("visibilitychange", wake);
      reducedMotion.removeEventListener("change", start);
      renderer.dispose();
    };
  }, [intensity, form]);

  return (
    <div aria-hidden="true" className={cn("atr-field", className)} data-ready={ready}>
      <canvas ref={canvasRef} data-active={active} />
    </div>
  );
}

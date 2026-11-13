// Minimal WebGL 1 sphere: one full-size quad, a fragment shader rebuilds the sphere per pixel.
export type Vec3 = [number, number, number]

export function normalize([x, y, z]: Vec3): Vec3 {
  const length = Math.hypot(x, y, z)
  return [x / length, y / length, z / length]
}

/** Planet-fixed direction for a latitude and longitude in radians. +y is north, longitude 0 faces +z. */
export function surfacePoint(latitude: number, longitude: number): Vec3 {
  return [Math.cos(latitude) * Math.sin(longitude), Math.sin(latitude), Math.cos(latitude) * Math.cos(longitude)]
}

/**
 * Column-major mat3 for Ry(longitude) * Rx(-tilt). It maps view-space directions (x right, y up,
 * z towards the viewer) to planet-fixed ones, so the disc centre shows (tilt, longitude).
 */
export function rotationMatrix(longitude: number, tilt: number): Float32Array {
  const cl = Math.cos(longitude), sl = Math.sin(longitude), ct = Math.cos(tilt), st = Math.sin(tilt)
  return new Float32Array([cl, 0, -sl, -sl * st, ct, -cl * st, sl * ct, st, cl * ct])
}

/** Planet-fixed point to view space: the transpose of rotationMatrix. */
export function toView(m: Float32Array, [x, y, z]: Vec3): Vec3 {
  return [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z]
}

const VERTEX = `
attribute vec2 aPosition;
varying vec2 vPosition;
void main() {
  vPosition = aPosition;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`

// No early returns: derivatives (fwidth) must stay defined for every pixel in a quad.
const FRAGMENT = `
uniform sampler2D uTexture;
uniform mat3 uRotation;
uniform vec3 uSun;
uniform float uEdge;
varying vec2 vPosition;
const float PI = 3.14159265;
const float TAU = 6.28318531;

void main() {
  float r2 = dot(vPosition, vPosition);
  float alpha = clamp((1.0 - sqrt(r2)) / uEdge, 0.0, 1.0);
  vec3 normal = vec3(vPosition, sqrt(max(0.0, 1.0 - r2)));
  vec3 planet = uRotation * normal;
  float latitude = asin(clamp(planet.y, -1.0, 1.0));
  float u = atan(planet.x, planet.z) / TAU + 0.5;
  float v = 0.5 - latitude / PI;
#ifdef HAS_DERIVATIVES
  // Tarini's seam fix: use whichever longitude coordinate is continuous here, so mip selection
  // does not jump at the antimeridian. The texture repeats horizontally.
  float shifted = fract(u + 0.5) - 0.5;
  u = fwidth(u) <= fwidth(shifted) ? u : shifted;
#endif
  vec3 albedo = texture2D(uTexture, vec2(u, v)).rgb;

  float sunAngle = dot(normal, uSun);
  float day = smoothstep(-0.18, 0.34, sunAngle);
  float diffuse = 0.45 + 0.55 * clamp(sunAngle, 0.0, 1.0);
  float limb = 0.72 + 0.28 * sqrt(normal.z);
  vec3 color = albedo * (0.03 + 1.06 * day * diffuse) * limb;

  float fresnel = pow(1.0 - normal.z, 3.0);
  float litLimb = smoothstep(-0.05, 0.55, sunAngle);
  color += vec3(1.0, 0.58, 0.36) * fresnel * litLimb * 0.62;

  gl_FragColor = vec4(color * alpha, alpha);
}`

export interface GlobeRenderer {
  setTexture(image: HTMLImageElement): void
  resize(pixels: number): void
  draw(rotation: Float32Array): void
  dispose(): void
}

const isPowerOfTwo = (value: number) => value > 0 && (value & (value - 1)) === 0

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('could not create a shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`the globe shader failed to compile: ${log}`)
  }
  return shader
}

/** Throws when WebGL is unavailable, too slow (software only), or the shader fails to build. */
export function createGlobeRenderer(canvas: HTMLCanvasElement, sun: Vec3): GlobeRenderer {
  const gl = canvas.getContext('webgl', {
    alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
    failIfMajorPerformanceCaveat: true,
  })
  if (!gl) throw new Error('WebGL is unavailable')

  const derivatives = gl.getExtension('OES_standard_derivatives')
  const highPrecision = (gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)?.precision ?? 0) > 0
  const header = (derivatives ? '#extension GL_OES_standard_derivatives : enable\n#define HAS_DERIVATIVES\n' : '')
    + `precision ${highPrecision ? 'highp' : 'mediump'} float;\n`
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX)
  const fragment = compile(gl, gl.FRAGMENT_SHADER, header + FRAGMENT)
  const program = gl.createProgram()
  if (!program) throw new Error('could not create a shader program')
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
    throw new Error(`the globe shader failed to link: ${gl.getProgramInfoLog(program)}`)
  }
  gl.useProgram(program)

  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const position = gl.getAttribLocation(program, 'aPosition')
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

  const rotationUniform = gl.getUniformLocation(program, 'uRotation')
  const edgeUniform = gl.getUniformLocation(program, 'uEdge')
  gl.uniform3fv(gl.getUniformLocation(program, 'uSun'), sun)
  gl.uniform1i(gl.getUniformLocation(program, 'uTexture'), 0)
  gl.uniform1f(edgeUniform, 0.01)

  const texture = gl.createTexture()
  let hasTexture = false

  return {
    setTexture(image) {
      if (!isPowerOfTwo(image.naturalWidth) || !isPowerOfTwo(image.naturalHeight)) {
        throw new Error(`the texture must be power-of-two sized for mipmaps (got ${image.naturalWidth}x${image.naturalHeight})`)
      }
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image)
      gl.generateMipmap(gl.TEXTURE_2D)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      const anisotropic = gl.getExtension('EXT_texture_filter_anisotropic')
      if (anisotropic) {
        const max = gl.getParameter(anisotropic.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number
        gl.texParameterf(gl.TEXTURE_2D, anisotropic.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, max))
      }
      hasTexture = true
    },
    resize(pixels) {
      if (canvas.width === pixels && canvas.height === pixels) return
      canvas.width = pixels
      canvas.height = pixels
      gl.viewport(0, 0, pixels, pixels)
      // About 1.5 device pixels of antialiasing on the limb.
      gl.uniform1f(edgeUniform, 3 / pixels)
    },
    draw(rotation) {
      if (!hasTexture || gl.isContextLost()) return
      gl.uniformMatrix3fv(rotationUniform, false, rotation)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    },
    dispose() {
      gl.deleteTexture(texture)
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
      gl.deleteShader(vertex)
      gl.deleteShader(fragment)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    },
  }
}

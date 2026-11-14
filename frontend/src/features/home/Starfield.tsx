import { useEffect, useRef } from 'react'

/** Small seeded generator (mulberry32), so the starfield is identical on every load. */
function mulberry32(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const random = mulberry32(0x4d617273)
const between = (min: number, max: number) => min + (max - min) * random()
// Mostly neutral white, some warm, a few cool.
const TINTS = ['255, 249, 240', '255, 222, 190', '208, 222, 255']
const pickTint = () => { const value = random(); return value < 0.7 ? 0 : value < 0.88 ? 1 : 2 }

interface Star { x: number; y: number; radius: number; alpha: number; tint: number }
const makeStars = (count: number, radius: [number, number], alpha: [number, number]): Star[] =>
  Array.from({ length: count }, () => ({ x: random(), y: random(), radius: between(...radius), alpha: between(...alpha), tint: pickTint() }))

// Positions are fractions of the layer, so the pattern holds at every size. Smaller screens take a prefix of each list.
const TINY = makeStars(1100, [0.35, 0.7], [0.25, 0.55])
const MEDIUM = makeStars(160, [0.8, 1.2], [0.5, 0.8])
const BRIGHT = makeStars(13, [1.1, 1.5], [0.8, 0.95])
const TWINKLES = Array.from({ length: 7 }, () => ({
  x: between(0.04, 0.96), y: between(0.04, 0.96), size: between(2.6, 3.8), duration: between(7, 11), delay: -between(0, 11),
}))

const MAX_PIXEL_RATIO = 2
const SPRITE_SIZE = 64
// Drawn diameters relative to the star radius: the soft falloff extends past the visible core.
const DOT_SCALE = 2.6
const HALO_SCALE = 16

let sprites: { dots: HTMLCanvasElement[]; halos: HTMLCanvasElement[] } | null = null

function makeSprite(tint: string, stops: [number, number][]) {
  const sprite = document.createElement('canvas')
  sprite.width = sprite.height = SPRITE_SIZE
  const context = sprite.getContext('2d')
  if (!context) return sprite
  const half = SPRITE_SIZE / 2
  const gradient = context.createRadialGradient(half, half, 0, half, half, half)
  stops.forEach(([offset, alpha]) => gradient.addColorStop(offset, `rgba(${tint}, ${alpha})`))
  context.fillStyle = gradient
  context.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE)
  return sprite
}

function getSprites() {
  sprites ??= {
    dots: TINTS.map(tint => makeSprite(tint, [[0, 1], [0.25, 0.85], [0.5, 0.3], [1, 0]])),
    halos: TINTS.map(tint => makeSprite(tint, [[0, 0.32], [0.15, 0.13], [0.45, 0.03], [1, 0]])),
  }
  return sprites
}

function paint(canvas: HTMLCanvasElement, layer: 'far' | 'near') {
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  if (!width || !height) return
  const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)
  canvas.width = Math.round(width * ratio)
  canvas.height = Math.round(height * ratio)
  const context = canvas.getContext('2d')
  if (!context) return
  context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0)
  context.clearRect(0, 0, width, height)
  const { dots, halos } = getSprites()
  const draw = (star: Star, sprite: HTMLCanvasElement, scale: number, alpha: number) => {
    const size = star.radius * scale
    context.globalAlpha = alpha
    context.drawImage(sprite, star.x * width - size / 2, star.y * height - size / 2, size, size)
  }

  if (layer === 'far') {
    const area = width * height
    const tiny = Math.max(300, Math.min(TINY.length, Math.round(area / 1500)))
    const medium = Math.max(90, Math.min(MEDIUM.length, Math.round(area / 11000)))
    TINY.slice(0, tiny).forEach(star => draw(star, dots[star.tint], DOT_SCALE, star.alpha))
    MEDIUM.slice(0, medium).forEach(star => draw(star, dots[star.tint], DOT_SCALE, star.alpha))
  } else {
    BRIGHT.forEach(star => {
      draw(star, halos[star.tint], HALO_SCALE, star.alpha)
      draw(star, dots[star.tint], DOT_SCALE, star.alpha)
    })
  }
  context.globalAlpha = 1
}

/** Two parallax layers of canvas stars at device resolution, plus a few slowly twinkling stars. */
export function Starfield() {
  const farRef = useRef<HTMLCanvasElement>(null)
  const nearRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const far = farRef.current
    const near = nearRef.current
    if (!far || !near) return
    let frame = 0
    const paintAll = () => { frame = 0; paint(far, 'far'); paint(near, 'near') }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(paintAll) }
    paintAll()
    // Resizes repaint; window resize also fires on zoom, which changes the device pixel ratio.
    const observer = new ResizeObserver(schedule)
    observer.observe(far)
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [])

  return <>
    <div className="home-stars home-stars--far" data-parallax="3" aria-hidden="true">
      <canvas ref={farRef} className="home-stars-canvas" />
    </div>
    <div className="home-stars home-stars--near" data-parallax="7" aria-hidden="true">
      <canvas ref={nearRef} className="home-stars-canvas" />
      {TWINKLES.map((star, index) => (
        <span key={index} className="home-twinkle" style={{
          left: `${star.x * 100}%`, top: `${star.y * 100}%`, width: star.size, height: star.size,
          animationDuration: `${star.duration}s`, animationDelay: `${star.delay}s`,
        }} />
      ))}
    </div>
  </>
}

import { useEffect, useRef, useState } from 'react'
import { lockSelection } from './dragSelection'

const TEXTURE_URL = `${import.meta.env.BASE_URL}images/mars-texture.jpg`
const SPIN_MS = 120_000
const SPIN_ANIMATIONS = new Set(['globe-spin', 'globe-marker-window'])

// Jezero Crater on the equirectangular texture: longitude -180° at the left edge, +90° latitude at the top.
const JEZERO = { latitude: 18.38, longitude: 77.58 }
const markerU = (JEZERO.longitude + 180) / 360
const markerV = (90 - JEZERO.latitude) / 180

// The disc shows half the texture width, so at rotation phase p Jezero sits 2 * (p - 1 + u) across the disc.
// The globe opens, and the zoom ends, at this phase, with Jezero just inside the lit side.
const FOCUS_PHASE = 0.56
const focusX = 2 * (FOCUS_PHASE - 1 + markerU)
const spinTiming = { animationDuration: `${SPIN_MS}ms`, animationDelay: `${-FOCUS_PHASE * SPIN_MS}ms` }
// Strip offset at FOCUS_PHASE. It shows whenever the spin animation is off (reduced motion).
const restingTransform = `translateX(${(FOCUS_PHASE - 1) * 50}%)`

type Mode = 'auto' | 'drag' | 'leaving'

function spinAnimations(element: Element): Animation[] {
  return element.getAnimations({ subtree: true })
    .filter(animation => animation instanceof CSSAnimation && SPIN_ANIMATIONS.has(animation.animationName))
}
const timeOf = (animation: Animation) => Number(animation.currentTime ?? 0)
// Keeps scrubbed times inside [one cycle, two cycles) so a backwards fling never runs before the start.
const wrap = (ms: number) => SPIN_MS + ((ms % SPIN_MS) + SPIN_MS) % SPIN_MS
const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value))

export function MarsGlobe({ leaving, reducedMotion }: { leaving: boolean; reducedMotion: boolean }) {
  const globeRef = useRef<HTMLDivElement>(null)
  const modeRef = useRef<Mode>('auto')
  const [texture, setTexture] = useState<'loading' | 'ready' | 'failed'>('loading')

  useEffect(() => {
    const image = new Image()
    image.onload = () => setTexture('ready')
    image.onerror = () => setTexture('failed')
    image.src = TEXTURE_URL
    return () => { image.onload = null; image.onerror = null }
  }, [])

  // Pause every globe animation while the tab is hidden; drag to spin with an eased return to auto-rotation.
  useEffect(() => {
    const globe = globeRef.current
    if (!globe) return
    let drag: { id: number; spins: Animation[]; width: number; startX: number; startTime: number; lastX: number; lastAt: number; velocity: number; unlock: () => void } | null = null
    let easeFrame = 0

    const onVisibility = () => {
      const all = globe.getAnimations({ subtree: true })
      if (document.hidden) { all.forEach(animation => animation.pause()); return }
      const spins = spinAnimations(globe)
      all.forEach(animation => { if (modeRef.current === 'auto' || !spins.includes(animation)) animation.play() })
    }
    const down = (event: PointerEvent) => {
      if (reducedMotion || drag || modeRef.current !== 'auto' || (event.pointerType === 'mouse' && event.button !== 0)) return
      const spins = spinAnimations(globe)
      if (spins.length === 0) return
      event.preventDefault()
      cancelAnimationFrame(easeFrame)
      globe.setPointerCapture(event.pointerId)
      spins.forEach(animation => { animation.pause(); animation.playbackRate = 1 })
      modeRef.current = 'drag'
      globe.classList.add('is-dragging')
      drag = { id: event.pointerId, spins, width: globe.offsetWidth, startX: event.clientX, startTime: timeOf(spins[0]), lastX: event.clientX, lastAt: event.timeStamp, velocity: 0, unlock: lockSelection(globe) }
    }
    const move = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.id || modeRef.current !== 'drag') return
      // Dragging one disc width moves the surface by half the texture, as if holding the planet.
      const time = wrap(drag.startTime + (event.clientX - drag.startX) / drag.width * SPIN_MS / 2)
      drag.spins.forEach(animation => { animation.currentTime = time })
      const elapsed = event.timeStamp - drag.lastAt
      if (elapsed > 0) drag.velocity = 0.7 * ((event.clientX - drag.lastX) / elapsed) + 0.3 * drag.velocity
      drag.lastX = event.clientX
      drag.lastAt = event.timeStamp
    }
    const release = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.id) return
      const { spins, width, velocity, lastAt, unlock } = drag
      drag = null
      unlock()
      globe.classList.remove('is-dragging')
      if (globe.hasPointerCapture(event.pointerId)) globe.releasePointerCapture(event.pointerId)
      if (modeRef.current !== 'drag') return
      modeRef.current = 'auto'
      // Release speed in multiples of the automatic rotation rate, easing back to 1.
      const fling = event.timeStamp - lastAt > 90 ? 0 : clamp(velocity / width * SPIN_MS / 2, 48)
      const startedAt = performance.now()
      const ease = (now: number) => {
        if (modeRef.current !== 'auto') return
        const progress = Math.min(1, (now - startedAt) / 1600)
        const rate = fling + (1 - fling) * (1 - (1 - progress) ** 3)
        spins.forEach(animation => { animation.playbackRate = rate })
        if (progress < 1) easeFrame = requestAnimationFrame(ease)
      }
      spins.forEach(animation => {
        animation.playbackRate = fling
        if (!document.hidden) animation.play()
      })
      easeFrame = requestAnimationFrame(ease)
    }

    document.addEventListener('visibilitychange', onVisibility)
    globe.addEventListener('pointerdown', down)
    globe.addEventListener('pointermove', move)
    globe.addEventListener('pointerup', release)
    globe.addEventListener('pointercancel', release)
    globe.addEventListener('lostpointercapture', release)
    return () => {
      cancelAnimationFrame(easeFrame)
      drag?.unlock()
      document.removeEventListener('visibilitychange', onVisibility)
      globe.removeEventListener('pointerdown', down)
      globe.removeEventListener('pointermove', move)
      globe.removeEventListener('pointerup', release)
      globe.removeEventListener('pointercancel', release)
      globe.removeEventListener('lostpointercapture', release)
    }
  }, [reducedMotion])

  // On leaving, turn Jezero to the focus point while the stylesheet zooms the globe onto it.
  useEffect(() => {
    const globe = globeRef.current
    if (!leaving || !globe) return
    modeRef.current = 'leaving'
    const spins = spinAnimations(globe)
    if (spins.length === 0) return
    spins.forEach(animation => { animation.pause(); animation.playbackRate = 1 })
    const from = timeOf(spins[0])
    // The animation delay equals FOCUS_PHASE, so whole cycles of currentTime land on the focus phase.
    const to = Math.round(from / SPIN_MS) * SPIN_MS
    const startedAt = performance.now()
    let frame = 0
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / 700)
      const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - (2 - 2 * progress) ** 3 / 2
      spins.forEach(animation => { animation.currentTime = from + (to - from) * eased })
      if (progress < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [leaving])

  const stripStyle = { ...spinTiming, transform: restingTransform, backgroundImage: texture === 'ready' ? `url(${TEXTURE_URL})` : undefined }
  // HomeScreen supplies the parallax layer around this element.
  return (
    <div ref={globeRef} className={texture === 'ready' ? 'globe has-texture' : 'globe'}
      style={{ transformOrigin: `${focusX * 100}% ${markerV * 100}%` }}>
      <div className="globe-base" />
      <div className="globe-surface">
        <div className="globe-strip" style={stripStyle}>
          <span className="globe-marker" style={{ ...spinTiming, left: `${markerU * 50}%`, top: `${markerV * 100}%` }}>
            <span className="globe-marker-dot" />
            <span className="globe-marker-label">Jezero Crater</span>
          </span>
        </div>
      </div>
      <div className="globe-shade" />
      <div className="globe-rim" />
    </div>
  )
}

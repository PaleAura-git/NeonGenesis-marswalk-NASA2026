import { useEffect, useRef, useState } from 'react'
import { lockSelection, startedOnMarker } from './dragSelection'
import { JezeroMarker, type JezeroMarkerProps } from './JezeroMarker'

const TEXTURE_URL = `${import.meta.env.BASE_URL}images/mars-texture.jpg`
const SPIN_MS = 120_000
const TURN_MS = 700
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

type Mode = 'auto' | 'drag' | 'turning' | 'hold' | 'leaving'

function spinAnimations(element: Element): Animation[] {
  return element.getAnimations({ subtree: true })
    .filter(animation => animation instanceof CSSAnimation && SPIN_ANIMATIONS.has(animation.animationName))
}
const timeOf = (animation: Animation) => Number(animation.currentTime ?? 0)
// Keeps scrubbed times inside [one cycle, two cycles) so a backwards fling never runs before the start.
const wrap = (ms: number) => SPIN_MS + ((ms % SPIN_MS) + SPIN_MS) % SPIN_MS
const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value))
const easeInOut = (t: number) => t < 0.5 ? 4 * t ** 3 : 1 - (2 - 2 * t) ** 3 / 2

/** Pauses the spin and scrubs it to the nearest focus phase, where Jezero faces the viewer. Returns a cancel function. */
function turnToFocus(spins: Animation[], onDone?: () => void): () => void {
  spins.forEach(animation => { animation.pause(); animation.playbackRate = 1 })
  const from = timeOf(spins[0])
  // The animation delay equals FOCUS_PHASE, so whole cycles of currentTime land on the focus phase.
  const to = Math.round(from / SPIN_MS) * SPIN_MS
  const startedAt = performance.now()
  let frame = 0
  const step = (now: number) => {
    const progress = Math.min(1, (now - startedAt) / TURN_MS)
    spins.forEach(animation => { animation.currentTime = from + (to - from) * easeInOut(progress) })
    if (progress < 1) frame = requestAnimationFrame(step)
    else onDone?.()
  }
  frame = requestAnimationFrame(step)
  return () => cancelAnimationFrame(frame)
}

/** Plays the spin from a given rate, easing back to normal speed while stillAuto() holds. Returns a cancel function. */
function resumeSpin(spins: Animation[], fromRate: number, stillAuto: () => boolean): () => void {
  const startedAt = performance.now()
  let frame = 0
  const ease = (now: number) => {
    if (!stillAuto()) return
    const progress = Math.min(1, (now - startedAt) / 1600)
    const rate = fromRate + (1 - fromRate) * (1 - (1 - progress) ** 3)
    spins.forEach(animation => { animation.playbackRate = rate })
    if (progress < 1) frame = requestAnimationFrame(ease)
  }
  spins.forEach(animation => {
    animation.playbackRate = fromRate
    if (!document.hidden) animation.play()
  })
  frame = requestAnimationFrame(ease)
  return () => cancelAnimationFrame(frame)
}

interface Props extends JezeroMarkerProps {
  leaving: boolean
  reducedMotion: boolean
  /** While true, turn Jezero to face the viewer and hold it there. */
  holdJezero: boolean
  /** Called once Jezero faces the viewer after holdJezero turns true. */
  onJezeroFacing: () => void
}

export function MarsGlobe({ leaving, reducedMotion, holdJezero, onJezeroFacing, onJezeroActivate, jezeroExpanded }: Props) {
  const globeRef = useRef<HTMLDivElement>(null)
  const markerRef = useRef<HTMLButtonElement>(null)
  const modeRef = useRef<Mode>('auto')
  // Cancels whichever turn or spin ease is running, so only one drives the animations.
  const cancelMotionRef = useRef<() => void>(() => {})
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
    const marker = markerRef.current
    if (!globe || !marker) return
    let drag: { id: number; spins: Animation[]; width: number; startX: number; startTime: number; lastX: number; lastAt: number; velocity: number; unlock: () => void } | null = null
    const isAuto = () => modeRef.current === 'auto'

    const onVisibility = () => {
      const all = globe.getAnimations({ subtree: true })
      if (document.hidden) { all.forEach(animation => animation.pause()); return }
      const spins = spinAnimations(globe)
      all.forEach(animation => { if (modeRef.current === 'auto' || !spins.includes(animation)) animation.play() })
    }
    // Keyboard focus on a hidden marker turns Jezero into view, then the spin carries on.
    const onMarkerFocus = () => {
      if (reducedMotion || modeRef.current !== 'auto' || !marker.matches(':focus-visible')) return
      if (Number(getComputedStyle(marker).opacity) >= 0.5) return
      const spins = spinAnimations(globe)
      if (spins.length === 0) return
      cancelMotionRef.current()
      modeRef.current = 'turning'
      cancelMotionRef.current = turnToFocus(spins, () => {
        if (modeRef.current !== 'turning') return
        modeRef.current = 'auto'
        cancelMotionRef.current = resumeSpin(spins, 0, isAuto)
      })
    }
    const down = (event: PointerEvent) => {
      if (reducedMotion || drag || modeRef.current !== 'auto' || startedOnMarker(event) || (event.pointerType === 'mouse' && event.button !== 0)) return
      const spins = spinAnimations(globe)
      if (spins.length === 0) return
      event.preventDefault()
      cancelMotionRef.current()
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
      cancelMotionRef.current = resumeSpin(spins, fling, isAuto)
    }

    document.addEventListener('visibilitychange', onVisibility)
    marker.addEventListener('focus', onMarkerFocus)
    globe.addEventListener('pointerdown', down)
    globe.addEventListener('pointermove', move)
    globe.addEventListener('pointerup', release)
    globe.addEventListener('pointercancel', release)
    globe.addEventListener('lostpointercapture', release)
    return () => {
      cancelMotionRef.current()
      drag?.unlock()
      document.removeEventListener('visibilitychange', onVisibility)
      marker.removeEventListener('focus', onMarkerFocus)
      globe.removeEventListener('pointerdown', down)
      globe.removeEventListener('pointermove', move)
      globe.removeEventListener('pointerup', release)
      globe.removeEventListener('pointercancel', release)
      globe.removeEventListener('lostpointercapture', release)
    }
  }, [reducedMotion])

  // Card open: turn Jezero to the front and hold; on close, the spin eases back up from rest.
  useEffect(() => {
    const globe = globeRef.current
    if (!holdJezero || leaving || !globe) return
    const spins = spinAnimations(globe)
    // Reduced motion (or no spin yet): the strip already rests at the focus phase.
    if (reducedMotion || spins.length === 0) {
      onJezeroFacing()
      return
    }
    cancelMotionRef.current()
    modeRef.current = 'hold'
    cancelMotionRef.current = turnToFocus(spins, onJezeroFacing)
    return () => {
      if (modeRef.current !== 'hold') return
      cancelMotionRef.current()
      modeRef.current = 'auto'
      cancelMotionRef.current = resumeSpin(spins, 0, () => modeRef.current === 'auto')
    }
  }, [holdJezero, leaving, reducedMotion, onJezeroFacing])

  // On leaving, turn Jezero to the focus point while the stylesheet zooms the globe onto it.
  useEffect(() => {
    const globe = globeRef.current
    if (!leaving || !globe) return
    modeRef.current = 'leaving'
    const spins = spinAnimations(globe)
    if (spins.length === 0) return
    cancelMotionRef.current()
    const cancel = turnToFocus(spins)
    return cancel
  }, [leaving])

  const stripStyle = { ...spinTiming, transform: restingTransform, backgroundImage: texture === 'ready' ? `url(${TEXTURE_URL})` : undefined }
  // HomeScreen supplies the parallax layer around this element.
  return (
    <div ref={globeRef} className={texture === 'ready' ? 'globe has-texture' : 'globe'}
      style={{ transformOrigin: `${focusX * 100}% ${markerV * 100}%` }}>
      <div className="globe-base" aria-hidden="true" />
      <div className="globe-surface">
        <div className="globe-strip" style={stripStyle}>
          <JezeroMarker markerRef={markerRef} style={{ ...spinTiming, left: `${markerU * 50}%`, top: `${markerV * 100}%` }}
            onJezeroActivate={onJezeroActivate} jezeroExpanded={jezeroExpanded} />
        </div>
      </div>
      <div className="globe-shade" aria-hidden="true" />
      <div className="globe-rim" aria-hidden="true" />
    </div>
  )
}

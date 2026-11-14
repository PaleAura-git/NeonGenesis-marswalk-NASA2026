import { useEffect, useRef } from 'react'
import { lockSelection, startedOnMarker } from './dragSelection'
import { createGlobeRenderer, normalize, rotationMatrix, surfacePoint, toView, type GlobeRenderer } from './globeRenderer'
import { JezeroMarker, type JezeroMarkerProps } from './JezeroMarker'

const TEXTURE_URL = `${import.meta.env.BASE_URL}images/mars-texture.jpg`
const degrees = (value: number) => value * Math.PI / 180

// Same pace as the CSS globe: one revolution every 120 s. Negative so the near side moves left to right.
const AUTO_SPIN = -2 * Math.PI / 120
const MAX_SPIN = 6
const MAX_TILT_SPEED = 3
const DEFAULT_TILT = degrees(12)
const MAX_TILT = degrees(50)
const SPIN_EASE_SECONDS = 0.9
const TILT_MOMENTUM_SECONDS = 0.35
const TILT_RETURN_SECONDS = 1.4
const LEAVE_MS = 700
const TURN_MS = 700
const MAX_PIXEL_RATIO = 2
const MAX_CANVAS_PIXELS = 2048

const JEZERO = { latitude: degrees(18.38), longitude: degrees(77.58) }
const JEZERO_POINT = surfacePoint(JEZERO.latitude, JEZERO.longitude)
// Opening view puts Jezero a little west of centre, so the spin carries it across the lit face.
const START_LONGITUDE = JEZERO.longitude + degrees(18)
// Sun from the upper left and slightly towards the viewer, in view space.
const SUN = normalize([-0.62, 0.5, 0.6])

const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value))
const smoothstep = (from: number, to: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - from) / (to - from)))
  return t * t * (3 - 2 * t)
}
const shortestTurn = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle))
const easeInOut = (t: number) => t < 0.5 ? 4 * t ** 3 : 1 - (2 - 2 * t) ** 3 / 2

interface Props extends JezeroMarkerProps {
  leaving: boolean
  reducedMotion: boolean
  onFail: (reason: string) => void
  /** While true, turn Jezero to face the viewer and hold it there. */
  holdJezero: boolean
  /** Called once Jezero faces the viewer after holdJezero turns true. */
  onJezeroFacing: () => void
}

export function WebGLGlobe({ leaving, reducedMotion, onFail, holdJezero, onJezeroFacing, onJezeroActivate, jezeroExpanded }: Props) {
  const globeRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const markerRef = useRef<HTMLButtonElement>(null)
  const leavingRef = useRef(leaving)
  const holdRef = useRef(holdJezero)
  const facingRef = useRef(onJezeroFacing)
  // Set by the main effect: applies a change of holdJezero.
  const applyHoldRef = useRef<(() => void) | null>(null)

  useEffect(() => { leavingRef.current = leaving }, [leaving])
  useEffect(() => { facingRef.current = onJezeroFacing }, [onJezeroFacing])
  useEffect(() => {
    holdRef.current = holdJezero
    applyHoldRef.current?.()
  }, [holdJezero])

  useEffect(() => {
    const globe = globeRef.current
    const host = hostRef.current
    const marker = markerRef.current
    if (!globe || !host || !marker) return

    // A fresh canvas per mount: a context released with loseContext() cannot be reused.
    const canvas = document.createElement('canvas')
    canvas.className = 'globe-canvas'
    host.append(canvas)

    let disposed = false
    let renderer: GlobeRenderer | null = null
    let textureReady = false
    let frame = 0
    let size = globe.clientWidth
    let markerOpacity = 0
    const view = { longitude: reducedMotion ? JEZERO.longitude : START_LONGITUDE, tilt: DEFAULT_TILT, spin: AUTO_SPIN, tiltSpeed: 0, last: 0 }
    let drag: { id: number; lastX: number; lastY: number; lastAt: number; spin: number; tiltSpeed: number; unlock: () => void } | null = null
    let leave: { start: number; fromLongitude: number; toLongitude: number; fromTilt: number } | null = null
    // A turn that brings Jezero to the front: held for the card, or a one-off when the hidden marker gets keyboard focus.
    let turn: { start: number; fromLongitude: number; toLongitude: number; fromTilt: number; toTilt: number; hold: boolean; reached: boolean } | null = null

    const fail = (reason: string) => {
      if (disposed) return
      disposed = true
      onFail(reason)
    }

    const draw = () => {
      if (!renderer || !textureReady) return
      const rotation = rotationMatrix(view.longitude, view.tilt)
      renderer.draw(rotation)
      const [x, y, z] = toView(rotation, JEZERO_POINT)
      const daylight = x * SUN[0] + y * SUN[1] + z * SUN[2]
      // Fade out on the far side and deep on the night side. The marker stays in the tab order throughout.
      markerOpacity = smoothstep(0.08, 0.3, z) * smoothstep(-0.2, 0.12, daylight)
      marker.style.transform = `translate3d(${((0.5 + x / 2) * size).toFixed(1)}px, ${((0.5 - y / 2) * size).toFixed(1)}px, 0)`
      marker.style.opacity = markerOpacity.toFixed(3)
      marker.style.pointerEvents = markerOpacity < 0.3 ? 'none' : 'auto'
    }

    const endDrag = (pointerId?: number) => {
      if (!drag) return
      drag.unlock()
      globe.classList.remove('is-dragging')
      if (pointerId !== undefined && globe.hasPointerCapture(pointerId)) globe.releasePointerCapture(pointerId)
      drag = null
    }

    const beginTurn = (now: number, hold: boolean) => {
      endDrag()
      turn = {
        start: now, hold, reached: false,
        fromLongitude: view.longitude, toLongitude: view.longitude + shortestTurn(JEZERO.longitude - view.longitude),
        fromTilt: view.tilt, toTilt: hold ? JEZERO.latitude : DEFAULT_TILT,
      }
    }
    // Spin restarts from rest and eases up to the automatic rate.
    const releaseTurn = () => {
      turn = null
      view.spin = 0
      view.tiltSpeed = 0
    }

    const step = (seconds: number, now: number) => {
      if (leavingRef.current) {
        endDrag()
        leave ??= {
          start: now, fromLongitude: view.longitude, fromTilt: view.tilt,
          toLongitude: view.longitude + shortestTurn(JEZERO.longitude - view.longitude),
        }
        // Turn Jezero to the disc centre, where the stylesheet zoom is anchored.
        const progress = easeInOut(Math.min(1, (now - leave.start) / LEAVE_MS))
        view.longitude = leave.fromLongitude + (leave.toLongitude - leave.fromLongitude) * progress
        view.tilt = leave.fromTilt + (JEZERO.latitude - leave.fromTilt) * progress
        return
      }
      if (holdRef.current && !turn?.hold) beginTurn(now, true)
      if (!holdRef.current && turn?.hold) releaseTurn()
      if (turn) {
        const progress = easeInOut(Math.min(1, (now - turn.start) / TURN_MS))
        view.longitude = turn.fromLongitude + (turn.toLongitude - turn.fromLongitude) * progress
        view.tilt = turn.fromTilt + (turn.toTilt - turn.fromTilt) * progress
        if (progress >= 1 && !turn.reached) {
          turn.reached = true
          if (turn.hold) facingRef.current()
          else releaseTurn()
        }
        return
      }
      if (drag) return
      view.longitude += view.spin * seconds
      view.spin = AUTO_SPIN + (view.spin - AUTO_SPIN) * Math.exp(-seconds / SPIN_EASE_SECONDS)
      view.tilt += view.tiltSpeed * seconds
      view.tiltSpeed *= Math.exp(-seconds / TILT_MOMENTUM_SECONDS)
      view.tilt += (DEFAULT_TILT - view.tilt) * (1 - Math.exp(-seconds / TILT_RETURN_SECONDS))
      view.tilt = clamp(view.tilt, MAX_TILT)
    }

    const tick = (now: number) => {
      frame = 0
      if (disposed) return
      const seconds = view.last ? Math.min(0.05, (now - view.last) / 1000) : 0
      view.last = now
      step(seconds, now)
      draw()
      if (!document.hidden) frame = requestAnimationFrame(tick)
    }
    const start = () => {
      if (reducedMotion) { draw(); return }
      if (!frame && !document.hidden && !disposed) {
        view.last = 0
        frame = requestAnimationFrame(tick)
      }
    }

    applyHoldRef.current = () => {
      if (disposed) return
      if (!textureReady || document.hidden) {
        // Nothing to turn yet (or the loop is paused): report straight away so the card still opens.
        if (holdRef.current) facingRef.current()
        return
      }
      if (reducedMotion) {
        // No animation: jump to the end state.
        view.longitude = JEZERO.longitude
        view.tilt = holdRef.current ? JEZERO.latitude : DEFAULT_TILT
        draw()
        if (holdRef.current) facingRef.current()
        return
      }
      start()
    }

    const resize = () => {
      size = globe.clientWidth
      renderer?.resize(Math.max(1, Math.round(Math.min(size * Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO), MAX_CANVAS_PIXELS))))
      if (reducedMotion) draw()
    }

    try {
      renderer = createGlobeRenderer(canvas, SUN)
    } catch (error) {
      fail(error instanceof Error ? error.message : 'WebGL could not start')
      return () => canvas.remove()
    }
    resize()

    const onContextLost = (event: Event) => {
      event.preventDefault()
      fail('the WebGL context was lost')
    }
    canvas.addEventListener('webglcontextlost', onContextLost)

    const image = new Image()
    image.decoding = 'async'
    image.onload = () => {
      if (disposed || !renderer) return
      try {
        renderer.setTexture(image)
      } catch (error) {
        fail(error instanceof Error ? error.message : 'the texture could not be used')
        return
      }
      textureReady = true
      canvas.classList.add('is-ready')
      globe.classList.add('is-ready')
      start()
      if (holdRef.current) applyHoldRef.current?.()
    }
    image.onerror = () => fail('the texture failed to load')
    image.src = TEXTURE_URL

    const observer = new ResizeObserver(resize)
    observer.observe(globe)

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame)
        frame = 0
      } else if (textureReady) {
        start()
      }
    }

    // Keyboard focus on a hidden marker turns Jezero into view, then the spin carries on.
    const onMarkerFocus = () => {
      if (reducedMotion || !textureReady || turn || leavingRef.current || holdRef.current) return
      if (markerOpacity >= 0.5 || !marker.matches(':focus-visible')) return
      beginTurn(performance.now(), false)
      start()
    }

    const down = (event: PointerEvent) => {
      if (reducedMotion || drag || !textureReady || leavingRef.current || startedOnMarker(event) || (event.pointerType === 'mouse' && event.button !== 0)) return
      event.preventDefault()
      if (turn && !turn.hold) releaseTurn()
      globe.setPointerCapture(event.pointerId)
      globe.classList.add('is-dragging')
      drag = { id: event.pointerId, lastX: event.clientX, lastY: event.clientY, lastAt: event.timeStamp, spin: 0, tiltSpeed: 0, unlock: lockSelection(globe) }
    }
    const move = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.id) return
      // Dragging one radius turns the planet by one radian, as if holding its surface.
      const radius = size / 2
      const longitudeChange = -(event.clientX - drag.lastX) / radius
      const tiltChange = (event.clientY - drag.lastY) / radius
      view.longitude += longitudeChange
      view.tilt = clamp(view.tilt + tiltChange, MAX_TILT)
      const elapsed = (event.timeStamp - drag.lastAt) / 1000
      if (elapsed > 0) {
        drag.spin = 0.7 * (longitudeChange / elapsed) + 0.3 * drag.spin
        drag.tiltSpeed = 0.7 * (tiltChange / elapsed) + 0.3 * drag.tiltSpeed
      }
      drag.lastX = event.clientX
      drag.lastY = event.clientY
      drag.lastAt = event.timeStamp
    }
    const release = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.id) return
      // A finger held still before lifting releases without momentum.
      const still = event.timeStamp - drag.lastAt > 90
      view.spin = still ? 0 : clamp(drag.spin, MAX_SPIN)
      view.tiltSpeed = still ? 0 : clamp(drag.tiltSpeed, MAX_TILT_SPEED)
      endDrag(event.pointerId)
    }

    document.addEventListener('visibilitychange', onVisibility)
    marker.addEventListener('focus', onMarkerFocus)
    globe.addEventListener('pointerdown', down)
    globe.addEventListener('pointermove', move)
    globe.addEventListener('pointerup', release)
    globe.addEventListener('pointercancel', release)
    globe.addEventListener('lostpointercapture', release)

    return () => {
      disposed = true
      applyHoldRef.current = null
      cancelAnimationFrame(frame)
      endDrag()
      observer.disconnect()
      image.onload = null
      image.onerror = null
      document.removeEventListener('visibilitychange', onVisibility)
      marker.removeEventListener('focus', onMarkerFocus)
      globe.removeEventListener('pointerdown', down)
      globe.removeEventListener('pointermove', move)
      globe.removeEventListener('pointerup', release)
      globe.removeEventListener('pointercancel', release)
      globe.removeEventListener('lostpointercapture', release)
      canvas.removeEventListener('webglcontextlost', onContextLost)
      renderer?.dispose()
      canvas.remove()
      globe.classList.remove('is-ready')
    }
  }, [reducedMotion, onFail])

  return (
    <div ref={globeRef} className="globe globe--webgl">
      <div className="globe-base" aria-hidden="true" />
      <div ref={hostRef} className="globe-canvas-host" aria-hidden="true" />
      <JezeroMarker markerRef={markerRef} className="globe-marker--projected" onJezeroActivate={onJezeroActivate} jezeroExpanded={jezeroExpanded} />
    </div>
  )
}

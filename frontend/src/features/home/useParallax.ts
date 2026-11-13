import { useEffect, type RefObject } from 'react'

const clamp = (value: number) => Math.max(-1, Math.min(1, value))

/**
 * Shifts every [data-parallax] element inside the root by up to its value in pixels.
 * Mouse position drives it on desktop. Device orientation drives it only when the browser
 * already delivers orientation events; it never requests permission.
 */
export function useParallax(rootRef: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const root = rootRef.current
    if (!root || !enabled) return
    const layers = Array.from(root.querySelectorAll<HTMLElement>('[data-parallax]'))
      .map(element => ({ element, depth: Number(element.dataset.parallax) || 0 }))
    let targetX = 0
    let targetY = 0
    let x = 0
    let y = 0
    let frame = 0
    let baseline: { x: number; y: number } | null = null

    const render = () => {
      x += (targetX - x) * 0.1
      y += (targetY - y) * 0.1
      layers.forEach(({ element, depth }) => {
        element.style.translate = `${(x * depth).toFixed(2)}px ${(y * depth).toFixed(2)}px`
      })
      frame = Math.abs(targetX - x) + Math.abs(targetY - y) > 0.002 ? requestAnimationFrame(render) : 0
    }
    const aim = (nextX: number, nextY: number) => {
      targetX = clamp(nextX)
      targetY = clamp(nextY)
      if (!frame && !document.hidden) frame = requestAnimationFrame(render)
    }
    const onPointer = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') aim(event.clientX / window.innerWidth * 2 - 1, event.clientY / window.innerHeight * 2 - 1)
    }
    const onOrientation = (event: DeviceOrientationEvent) => {
      if (event.beta === null || event.gamma === null) return
      const angle = screen.orientation?.angle ?? 0
      const tilt = angle === 90 ? { x: event.beta, y: -event.gamma }
        : angle === 270 ? { x: -event.beta, y: event.gamma }
          : angle === 180 ? { x: -event.gamma, y: -event.beta }
            : { x: event.gamma, y: event.beta }
      baseline ??= tilt
      aim((tilt.x - baseline.x) / 20, (tilt.y - baseline.y) / 20)
    }

    window.addEventListener('pointermove', onPointer, { passive: true })
    window.addEventListener('deviceorientation', onOrientation)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('deviceorientation', onOrientation)
    }
  }, [rootRef, enabled])
}

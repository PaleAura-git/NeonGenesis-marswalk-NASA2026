import { useEffect, useLayoutEffect, useRef } from 'react'
import { Button } from '../../components/ui/Button'
import { Icon } from '../../components/ui/Icon'

const GAP = 16
const MARGIN = 16
const BOTTOM_SHEET_QUERY = '(max-aspect-ratio: 4/5)'

interface Props {
  anchor: HTMLElement | null
  /** Right edge, in viewport pixels, of the home screen's text that the card must not cover. */
  textRight: () => number
  onClose: () => void
  onPlan: () => void
}

/** Floating card about Jezero Crater, placed beside the marker; a bottom sheet on portrait screens. */
export function JezeroCard({ anchor, textRight, onClose, onPlan }: Props) {
  const cardRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card) return
    const place = () => {
      const dot = anchor?.querySelector('.globe-marker-dot')?.getBoundingClientRect()
      if (!dot || window.matchMedia(BOTTOM_SHEET_QUERY).matches) {
        card.style.left = ''
        card.style.top = ''
        return
      }
      const width = card.offsetWidth
      const height = card.offsetHeight
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const centreX = (dot.left + dot.right) / 2
      const centreY = (dot.top + dot.bottom) / 2
      const minX = Math.max(MARGIN, textRight() + 24)
      const clampY = (y: number) => Math.max(MARGIN, Math.min(y, viewportHeight - MARGIN - height))
      let x: number
      let y: number
      if (dot.right + GAP + width <= viewportWidth - MARGIN) {
        x = dot.right + GAP
        y = clampY(centreY - height / 2)
      } else if (dot.left - GAP - width >= minX) {
        x = dot.left - GAP - width
        y = clampY(centreY - height / 2)
      } else {
        x = Math.max(minX, Math.min(centreX - width / 2, viewportWidth - MARGIN - width))
        x = Math.min(x, viewportWidth - MARGIN - width)
        y = dot.bottom + GAP + height <= viewportHeight - MARGIN ? dot.bottom + GAP : dot.top - GAP - height
        y = clampY(y)
      }
      card.style.left = `${Math.round(x)}px`
      card.style.top = `${Math.round(y)}px`
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [anchor, textRight])

  useEffect(() => {
    const card = cardRef.current
    if (!card) return
    card.focus({ preventScroll: true })
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (target && !card.contains(target) && !anchor?.contains(target)) onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [anchor, onClose])

  return (
    <div ref={cardRef} id="jezero-card" className="jezero-card" role="dialog" aria-modal="false" aria-labelledby="jezero-card-title" tabIndex={-1}>
      <div className="jezero-card-head">
        <div>
          <h2 id="jezero-card-title" className="jezero-card-title">Jezero Crater</h2>
          <p className="jezero-card-subtitle">18.4°N 77.6°E · Mars</p>
        </div>
        <button type="button" className="jezero-card-close" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
      </div>
      <ul className="jezero-card-facts">
        <li>About 45 km wide, Jezero once held a lake fed by an ancient river.</li>
        <li>Its river delta preserves layered rock that records Mars's water history, the focus of this expedition.</li>
        <li>NASA's Perseverance rover landed here on 18 February 2021.</li>
      </ul>
      <p className="jezero-card-source">Source: NASA Mars 2020 mission · Imagery NASA / JPL / USGS</p>
      <Button className="jezero-card-cta" onClick={onPlan}>Plan a Marswalk here <Icon name="arrowRight" /></Button>
    </div>
  )
}

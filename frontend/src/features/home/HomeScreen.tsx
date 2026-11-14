import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Icon } from '../../components/ui/Icon'
import { JezeroCard } from './JezeroCard'
import { MarsGlobe } from './MarsGlobe'
import { MarsTimeReadout } from './MarsTimeReadout'
import { Starfield } from './Starfield'
import { WebGLGlobe } from './WebGLGlobe'
import { useIntro } from './useIntro'
import { useParallax } from './useParallax'
import { useReducedMotion } from './useReducedMotion'
import './home.css'

type GlobeRendererOption = 'webgl' | 'css'
/**
 * Which globe the home screen draws.
 * 'webgl': shaded sphere with drag and tilt. Falls back to the CSS globe automatically if WebGL,
 *          the shader or the texture fails, or the context is lost.
 * 'css':   the v1 scrolling-texture globe.
 */
const GLOBE_RENDERER = 'webgl' as GlobeRendererOption

// Matches the leaving transition in home.css.
const TRANSITION_MS = 800

const stats = [
  { label: 'Gravity', value: '3.71 m/s²' },
  { label: 'Day length', value: '24 h 40 m' },
  { label: 'Jezero Crater', value: '18.4°N 77.6°E' },
]

// Text the Jezero card must not cover. Text blocks are measured by their line boxes, not their full width.
const TEXT_SELECTORS = '.home-eyebrow, .home-title, .home-subline, .home-mars-time, .home-source'
const BOX_SELECTORS = '.home-cta, .home-stats > div'

type CardState = 'closed' | 'turning' | 'open'

export function HomeScreen({ onEnter, focusAction }: { onEnter: () => void; focusAction: boolean }) {
  const rootRef = useRef<HTMLElement>(null)
  const reducedMotion = useReducedMotion()
  const intro = useIntro(reducedMotion)
  const [leaving, setLeaving] = useState(false)
  const [webglFailed, setWebglFailed] = useState(false)
  const [card, setCard] = useState<CardState>('closed')
  const [marker, setMarker] = useState<HTMLButtonElement | null>(null)
  useParallax(rootRef, !reducedMotion && !leaving)

  const fallBackToCss = useCallback((reason: string) => {
    console.warn(`Home globe: showing the CSS globe because ${reason}.`)
    setWebglFailed(true)
  }, [])
  const showWebGL = GLOBE_RENDERER === 'webgl' && !webglFailed

  useEffect(() => {
    if (focusAction) rootRef.current?.querySelector<HTMLButtonElement>('.home-cta')?.focus()
  }, [focusAction])

  useEffect(() => {
    if (!leaving) return
    const timer = window.setTimeout(onEnter, TRANSITION_MS)
    return () => window.clearTimeout(timer)
  }, [leaving, onEnter])

  function start() {
    if (reducedMotion) onEnter()
    else setLeaving(true)
  }

  // Marker click: turn Jezero to the front, then open the card. A second click closes it.
  const activateJezero = useCallback((element: HTMLButtonElement) => {
    setMarker(element)
    setCard(state => state === 'closed' ? 'turning' : 'closed')
  }, [])
  const jezeroFacing = useCallback(() => setCard(state => state === 'turning' ? 'open' : state), [])
  const closeCard = useCallback(() => {
    setCard('closed')
    marker?.focus({ preventScroll: true })
  }, [marker])

  const textRight = useCallback(() => {
    const root = rootRef.current
    if (!root) return 0
    let right = 0
    root.querySelectorAll(TEXT_SELECTORS).forEach(element => {
      const range = document.createRange()
      range.selectNodeContents(element)
      right = Math.max(right, range.getBoundingClientRect().right)
    })
    root.querySelectorAll(BOX_SELECTORS).forEach(element => { right = Math.max(right, element.getBoundingClientRect().right) })
    return right
  }, [])

  const globeProps = {
    leaving, reducedMotion,
    holdJezero: card !== 'closed',
    onJezeroFacing: jezeroFacing,
    onJezeroActivate: activateJezero,
    jezeroExpanded: card === 'open',
  }
  const className = ['home', leaving && 'is-leaving', intro && 'is-intro'].filter(Boolean).join(' ')

  return (
    <section ref={rootRef} className={className} aria-labelledby="home-title">
      <div className="home-backdrop" aria-hidden="true" />
      <Starfield />
      <div className="home-vignette" aria-hidden="true" />
      <div className="home-globe-layer" data-parallax="14">
        {showWebGL
          ? <WebGLGlobe {...globeProps} onFail={fallBackToCss} />
          : <MarsGlobe {...globeProps} />}
      </div>
      <div className="home-content">
        <div className="home-copy">
          <p className="home-eyebrow">MARSWALK · JEZERO CRATER EXPEDITION PLANNER</p>
          <h1 id="home-title" className="home-title">Your next steps on Mars.</h1>
          <p className="home-subline">Plan a science expedition across Jezero Crater. Compare routes and rehearse the unexpected.</p>
        </div>
        <Button className="home-cta" onClick={start}>Plan a Marswalk <Icon name="arrowRight" /></Button>
        <div className="home-facts">
          <dl className="home-stats">
            {stats.map(stat => <div key={stat.label}><dt>{stat.label}</dt><dd>{stat.value}</dd></div>)}
          </dl>
          <MarsTimeReadout />
          <p className="home-source">Source: NASA Mars Fact Sheet</p>
        </div>
      </div>
      {card === 'open' && <JezeroCard anchor={marker} textRight={textRight} onClose={closeCard} onPlan={start} />}
    </section>
  )
}

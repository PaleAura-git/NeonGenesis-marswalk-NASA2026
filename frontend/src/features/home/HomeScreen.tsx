import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Icon } from '../../components/ui/Icon'
import { MarsGlobe } from './MarsGlobe'
import { useParallax } from './useParallax'
import { useReducedMotion } from './useReducedMotion'
import './home.css'

// Matches the leaving transition in home.css.
const TRANSITION_MS = 800

const stats = [
  { label: 'Gravity', value: '3.71 m/s²' },
  { label: 'Day length', value: '24 h 40 m' },
  { label: 'Jezero Crater', value: '18.4°N 77.6°E' },
]

export function HomeScreen({ onEnter, focusAction }: { onEnter: () => void; focusAction: boolean }) {
  const rootRef = useRef<HTMLElement>(null)
  const reducedMotion = useReducedMotion()
  const [leaving, setLeaving] = useState(false)
  useParallax(rootRef, !reducedMotion && !leaving)

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

  return (
    <section ref={rootRef} className={leaving ? 'home is-leaving' : 'home'} aria-labelledby="home-title">
      <div className="home-stars home-stars--far" data-parallax="3" aria-hidden="true" />
      <div className="home-stars home-stars--near" data-parallax="7" aria-hidden="true" />
      <MarsGlobe leaving={leaving} reducedMotion={reducedMotion} />
      <div className="home-content">
        <div className="home-copy" data-parallax="-5">
          <p className="home-eyebrow">MARSWALK · JEZERO CRATER EXPEDITION PLANNER</p>
          <h1 id="home-title" className="home-title">Your next steps on Mars.</h1>
          <p className="home-subline">Plan a science expedition across Jezero Crater. Compare routes and rehearse the unexpected.</p>
        </div>
        <Button className="home-cta" onClick={start}>Plan a Marswalk <Icon name="arrowRight" /></Button>
        <div className="home-facts">
          <dl className="home-stats">
            {stats.map(stat => <div key={stat.label}><dt>{stat.label}</dt><dd>{stat.value}</dd></div>)}
          </dl>
          <p className="home-source">Source: NASA Mars Fact Sheet</p>
        </div>
      </div>
      <footer className="home-footer">Imagery NASA / JPL / USGS · Neon Genesis · NASA Space Apps Challenge</footer>
    </section>
  )
}

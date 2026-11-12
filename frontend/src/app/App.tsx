import { useEffect, useState } from 'react'
import { StageNav, type Stage } from '../components/layout/StageNav'
import { LoadingError } from '../components/ui/LoadingError'
import { MapPlaceholder } from '../features/map/MapPlaceholder'
import { MissionOverview } from '../features/mission/MissionOverview'
import { ComparePlaceholder } from '../features/routes/ComparePlaceholder'
import { RehearsePlaceholder } from '../features/rehearsal/RehearsePlaceholder'
import { getMission } from '../services/api/mission'
import type { Mission } from '../types/mission'

type LoadState = { status: 'loading' } | { status: 'ready'; mission: Mission } | { status: 'error'; message: string }

export default function App() {
  const [stage, setStage] = useState<Stage>('Plan')
  const [attempt, setAttempt] = useState(0)
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  useEffect(() => {
    const controller = new AbortController()
    getMission(controller.signal).then(mission => {
      if (!controller.signal.aborted) setLoad({ status: 'ready', mission })
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setLoad({ status: 'error', message: error instanceof Error ? error.message : 'Unable to load mission.' })
    })
    return () => controller.abort()
  }, [attempt])

  return <div className="app-shell">
    <a className="skip-link" href="#main">Skip to mission</a>
    <header className="topbar"><a className="brand" href="./"><span className="brand-mark" aria-hidden="true">M</span>Marswalk<span className="working-title">working title</span></a><span className="demo-badge">Demo data</span></header>
    <main id="main">
      <div className="mission-heading"><div><p className="eyebrow">Mars / Expedition workspace</p><h1>Jezero Crater<span className="heading-dot">.</span></h1><p className="intro">Plan with purpose. Explore with perspective.</p></div><span className="project-label">NASA Space Apps<br />Hackathon prototype</span></div>
      <StageNav stage={stage} onChange={setStage} />
      <div className="stage-heading"><h2>{stage === 'Plan' ? 'Plan your expedition' : stage === 'Compare' ? 'Compare route options' : 'Rehearse your expedition'}</h2><span>Foundation / 01</span></div>
      {load.status === 'loading' && <div className="panel state-panel" role="status">Loading mission…</div>}
      {load.status === 'error' && <LoadingError message={load.message} onRetry={() => { setLoad({ status: 'loading' }); setAttempt(a => a + 1) }} />}
      {load.status === 'ready' && <div className="workspace"><div>{stage === 'Plan' ? <MissionOverview mission={load.mission} /> : stage === 'Compare' ? <ComparePlaceholder /> : <RehearsePlaceholder />}</div><MapPlaceholder /></div>}
      <p className="data-notice">Synthetic UI examples only. Geographic placement, terrain, and route calculations are pending.</p>
    </main>
    <footer><span>MARSWALK / SCIENCE FIRST</span><span>Plan → Compare → Rehearse</span></footer>
  </div>
}

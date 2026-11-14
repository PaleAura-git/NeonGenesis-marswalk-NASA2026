import { useCallback, useEffect, useState } from 'react'
import { type Stage } from '../components/layout/StageNav'
import { LoadingError } from '../components/ui/LoadingError'
import { MapPlaceholder } from '../features/map/MapPlaceholder'
import { MissionMap } from '../features/map/MissionMap'
import { MissionSetupPanel } from '../features/mission/MissionSetupPanel'
import { MissionReviewDialog } from '../features/mission/MissionReviewDialog'
import { TimeBudgetStrip } from '../features/mission/TimeBudgetStrip'
import { ComparePlaceholder } from '../features/routes/ComparePlaceholder'
import { RoutesPreview } from '../features/routes/RoutesPreview'
import { RehearsePlaceholder } from '../features/rehearsal/RehearsePlaceholder'
import { getMission } from '../services/api/mission'
import type { Mission } from '../types/mission'
import type { MissionSettings, SettingsErrors, StopSettings } from '../types/planning'
import { buildInitialPlanningRequest, createMissionSettings, observationField, validateMissionSettings } from '../features/mission/settings'

import { AppHeader } from '../components/layout/AppHeader'
import { FloatingPanel } from '../components/layout/FloatingPanel'
import { InformationDock } from '../components/layout/InformationDock'
import { ScienceStopPanel } from '../features/science/ScienceStopPanel'

type LoadState = { status: 'loading' } | { status: 'ready'; mission: Mission; settings: MissionSettings } | { status: 'error'; message: string }

export default function App({ onHome }: { onHome?: () => void }) {
  const [stage, setStage] = useState<Stage>('Plan')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [inspectionRequest, setInspectionRequest] = useState(0)
  // Layout only: whether the inspector is expanded, and whether the setup drawer is open on narrow screens.
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)
  const inspectLocation = useCallback((id: string) => {
    setSelectedId(id)
    setInspectionRequest(previous => previous + 1)
    setInspectorOpen(true)
  }, [])
  const [attempt, setAttempt] = useState(0)
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [errors, setErrors] = useState<SettingsErrors>({})
  const [reviewId, setReviewId] = useState<string | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    getMission(controller.signal).then(mission => {
      if (!controller.signal.aborted) setLoad({ status: 'ready', mission, settings: createMissionSettings(mission) })
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setLoad({ status: 'error', message: error instanceof Error ? error.message : 'Unable to load mission.' })
    })
    return () => controller.abort()
  }, [attempt])

  function changeSetting(field: Exclude<keyof MissionSettings, 'stops'>, value: string) {
    setLoad(previous => previous.status === 'ready' ? { ...previous, settings: { ...previous.settings, [field]: value } } : previous)
    setErrors(previous => ({
      ...previous, [field]: undefined,
      ...(field === 'durationHours' || field === 'durationMinutes' ? { reserveMinutes: undefined } : {}),
    }))
  }

  function changeStop(id: string, patch: Partial<StopSettings>) {
    setLoad(previous => {
      if (previous.status !== 'ready') return previous
      return { ...previous, settings: { ...previous.settings, stops: {
        ...previous.settings.stops, [id]: { ...previous.settings.stops[id], ...patch },
      } } }
    })
    setErrors(previous => ({
      ...previous,
      ...(patch.observationMinutes !== undefined ? { [observationField(id)]: undefined } : {}),
      ...(patch.included !== undefined ? { includedStops: undefined } : {}),
      ...(patch.priority !== undefined ? { [`priority-${id}`]: undefined } : {}),
    }))
  }

  function validateField(field: string) {
    if (load.status !== 'ready') return
    const validation = validateMissionSettings(load.settings, load.mission)
    setErrors(previous => ({
      ...previous, [field]: validation[field],
      ...(field === 'durationHours' || field === 'durationMinutes' ? { reserveMinutes: validation.reserveMinutes } : {}),
    }))
  }

  // "Plan routes": the same validation and request as before. Only where focus goes, and how the review shows, changed.
  function reviewMission(form: HTMLFormElement) {
    if (load.status !== 'ready') return
    const validation = validateMissionSettings(load.settings, load.mission)
    setErrors(validation)
    if (Object.keys(validation).length > 0) {
      const root = form.closest('main') ?? form
      const mission = load.mission
      requestAnimationFrame(() => {
        const firstInvalid = Array.from(root.querySelectorAll<HTMLElement>('[data-setting-field]'))
          .find(element => validation[element.dataset.settingField ?? ''])
        if (firstInvalid) {
          if (firstInvalid.closest('.ws-left')) setSetupOpen(true)
          requestAnimationFrame(() => firstInvalid.focus())
          return
        }
        // Stop priority and observation fields live in the inspector: show that stop, then focus its field.
        const stop = mission.stops.find(item => validation[observationField(item.id)] || validation[`priority-${item.id}`])
        if (!stop) return
        const field = validation[observationField(stop.id)] ? observationField(stop.id) : `priority-${stop.id}`
        inspectLocation(stop.id)
        requestAnimationFrame(() => requestAnimationFrame(() => root.querySelector<HTMLElement>(`[data-setting-field="${field}"]`)?.focus()))
      })
      return
    }
    setReviewId(crypto.randomUUID())
    setReviewOpen(true)
  }

  const review = load.status === 'ready' && reviewId && Object.keys(validateMissionSettings(load.settings, load.mission)).length === 0
    ? buildInitialPlanningRequest(load.mission, load.settings, reviewId) : null

  const shellClass = [
    'app-shell', `stage-${stage.toLowerCase()}`,
    load.status === 'ready' && inspectorOpen ? 'inspector-open' : 'inspector-closed',
    setupOpen && 'setup-open',
  ].filter(Boolean).join(' ')

  return <div className={shellClass}>
    <a className="skip-link" href="#main">Skip to mission</a>
    <AppHeader stage={stage} onChange={setStage} synthetic={load.status === 'ready' && load.mission.dataMode === 'synthetic'}
      onHome={onHome && (() => { setStage('Plan'); onHome() })}
      setupOpen={setupOpen} onToggleSetup={() => setSetupOpen(open => !open)} />
    <main id="main" className="workspace" tabIndex={-1} aria-label={`${stage} expedition workspace`}>
      {load.status === 'ready' ? <MissionMap key={load.mission.datasetId} mission={load.mission} stopSettings={load.settings.stops} selectedId={selectedId} inspectionRequest={inspectionRequest} onSelect={inspectLocation} /> : <MapPlaceholder />}
      <div id="setup-drawer" className="ws-left" data-map-edge="left">
        {load.status === 'loading' && <section className="panel state-panel" role="status"><p className="eyebrow">Mission setup</p><h2>Loading mission...</h2><p>Preparing your expedition workspace.</p></section>}
        {load.status === 'error' && <LoadingError message={load.message} onRetry={() => { setLoad({ status: 'loading' }); setAttempt(a => a + 1) }} />}
        {load.status === 'ready' && (stage === 'Plan'
          ? <MissionSetupPanel mission={load.mission} selectedId={selectedId} onSelect={inspectLocation}
            settings={load.settings} errors={errors} onSettingChange={changeSetting} onStopChange={changeStop}
            onBlur={validateField} onReview={reviewMission} />
          : <FloatingPanel title={stage === 'Compare' ? 'Compare routes' : 'Rehearsal'} key={stage}>
            {stage === 'Compare' ? <ComparePlaceholder onPlan={() => setStage('Plan')} /> : <RehearsePlaceholder onPlan={() => setStage('Plan')} />}
          </FloatingPanel>)}
      </div>
      {load.status === 'ready' && <div className="ws-right" data-map-edge="right">
        <ScienceStopPanel mission={load.mission} selectedId={selectedId} open={inspectorOpen}
          onOpen={() => setInspectorOpen(true)} onCollapse={() => setInspectorOpen(false)}
          stopSettings={load.settings.stops} errors={errors} onStopChange={changeStop} onBlur={validateField} />
      </div>}
      <div className="ws-bottom" data-map-edge="bottom">
        {stage === 'Plan' && load.status === 'ready'
          ? <div className="ws-panel ws-strip"><TimeBudgetStrip mission={load.mission} settings={load.settings} /><RoutesPreview /></div>
          : <InformationDock stage={stage} />}
      </div>
    </main>
    {load.status === 'ready' && reviewOpen && review && <MissionReviewDialog mission={load.mission} request={review} onClose={() => setReviewOpen(false)} />}
  </div>
}

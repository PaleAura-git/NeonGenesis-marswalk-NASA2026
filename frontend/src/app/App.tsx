import { useCallback, useEffect, useRef, useState } from 'react'
import { type Stage } from '../components/layout/StageNav'
import { LoadingError } from '../components/ui/LoadingError'
import { MapPlaceholder } from '../features/map/MapPlaceholder'
import { MissionMap } from '../features/map/MissionMap'
import { BaseDetails } from '../features/map/BaseDetails'
import { MissionOverview } from '../features/mission/MissionOverview'
import { ComparePlaceholder } from '../features/routes/ComparePlaceholder'
import { RehearsePlaceholder } from '../features/rehearsal/RehearsePlaceholder'
import { getMission } from '../services/api/mission'
import type { Mission } from '../types/mission'
import type { MissionSettings, SettingsErrors, StopSettings } from '../types/planning'
import { buildInitialPlanningRequest, createMissionSettings, observationField, validateMissionSettings } from '../features/mission/settings'

import { AppHeader } from '../components/layout/AppHeader'
import { FloatingPanel } from '../components/layout/FloatingPanel'
import { InformationDock } from '../components/layout/InformationDock'
import { SciencePanel } from '../features/science/SciencePanel'

type LoadState = { status: 'loading' } | { status: 'ready'; mission: Mission; settings: MissionSettings } | { status: 'error'; message: string }

export default function App({ onHome }: { onHome?: () => void }) {
  const [stage, setStage] = useState<Stage>('Plan')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [inspectionRequest, setInspectionRequest] = useState(0)
  const sciencePanelRef = useRef<HTMLDetailsElement>(null)
  const inspectLocation = useCallback((id: string) => {
    setSelectedId(id)
    setInspectionRequest(previous => previous + 1)
    if (sciencePanelRef.current) sciencePanelRef.current.open = true
  }, [])
  const [attempt, setAttempt] = useState(0)
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [errors, setErrors] = useState<SettingsErrors>({})
  const [reviewId, setReviewId] = useState<string | null>(null)
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

  function reviewMission(form: HTMLFormElement) {
    if (load.status !== 'ready') return
    const validation = validateMissionSettings(load.settings, load.mission)
    setErrors(validation)
    if (Object.keys(validation).length > 0) {
      requestAnimationFrame(() => {
        const firstInvalid = Array.from(form.querySelectorAll<HTMLElement>('[data-setting-field]'))
          .find(element => validation[element.dataset.settingField ?? ''])
        const disclosure = firstInvalid?.closest('details')
        if (disclosure) disclosure.open = true
        firstInvalid?.focus()
      })
      return
    }
    setReviewId(crypto.randomUUID())
    requestAnimationFrame(() => form.querySelector<HTMLElement>('.mission-review')?.focus())
  }

  const review = load.status === 'ready' && reviewId && Object.keys(validateMissionSettings(load.settings, load.mission)).length === 0
    ? buildInitialPlanningRequest(load.mission, load.settings, reviewId) : null
  const inspectedStop = load.status === 'ready' ? load.mission.stops.find(stop => stop.id === selectedId) : undefined

  return <div className="app-shell">
    <a className="skip-link" href="#main">Skip to mission</a>
    <AppHeader stage={stage} onChange={setStage} synthetic={load.status === 'ready' && load.mission.dataMode === 'synthetic'}
      onHome={onHome && (() => { setStage('Plan'); onHome() })} />
    <main id="main" className="workspace" tabIndex={-1} aria-label={`${stage} expedition workspace`}>
      {load.status === 'ready' ? <MissionMap key={load.mission.datasetId} mission={load.mission} stopSettings={load.settings.stops} selectedId={selectedId} inspectionRequest={inspectionRequest} onSelect={inspectLocation} /> : <MapPlaceholder />}
      <div className="left-slot">
        {load.status === 'loading' && <section className="panel state-panel" role="status"><p className="eyebrow">Mission setup</p><h2>Loading mission...</h2><p>Preparing your expedition workspace.</p></section>}
        {load.status === 'error' && <LoadingError message={load.message} onRetry={() => { setLoad({ status: 'loading' }); setAttempt(a => a + 1) }} />}
        {load.status === 'ready' && <FloatingPanel className={stage === 'Plan' ? 'mission-setup-panel' : ''} title={stage === 'Plan' ? 'Mission setup' : stage === 'Compare' ? 'Compare routes' : 'Rehearsal'} key={stage}>
          {stage === 'Plan' ? <MissionOverview mission={load.mission} selectedId={selectedId} onSelect={inspectLocation}
            settings={load.settings} errors={errors} onSettingChange={changeSetting} onStopChange={changeStop}
            onBlur={validateField} onReview={reviewMission} review={review} reviewRequested={Boolean(reviewId)} />
            : stage === 'Compare' ? <ComparePlaceholder onPlan={() => setStage('Plan')} /> : <RehearsePlaceholder onPlan={() => setStage('Plan')} />}
        </FloatingPanel>}
      </div>
      <aside className="right-slot" aria-label="Inspected location">
        <FloatingPanel title={load.status === 'ready' && selectedId === load.mission.base.id ? 'Base location' : 'Science stop'} detailsRef={sciencePanelRef}>
          {load.status === 'ready' && selectedId === load.mission.base.id
            ? <BaseDetails mission={load.mission} onClear={() => setSelectedId(null)} />
            : <SciencePanel stop={inspectedStop} onClear={() => setSelectedId(null)}
              editor={load.status === 'ready' && inspectedStop ? {
                settings: load.settings.stops[inspectedStop.id], errors,
                onChange: patch => changeStop(inspectedStop.id, patch), onBlur: validateField,
              } : undefined} />}
        </FloatingPanel>
      </aside>
      <InformationDock stage={stage} />
      <p className="data-notice">{load.status === 'ready' ? 'Synthetic positions & observation durations. ' : ''}Geographic placement, terrain, and route calculations pending.</p>
    </main>
  </div>
}

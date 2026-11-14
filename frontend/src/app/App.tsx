import { useCallback, useEffect, useMemo, useState } from 'react'
import { type Stage } from '../components/layout/StageNav'
import { LoadingError } from '../components/ui/LoadingError'
import { MapPlaceholder } from '../features/map/MapPlaceholder'
import { MissionMap, type MapRoute } from '../features/map/MissionMap'
import { MissionSetupPanel } from '../features/mission/MissionSetupPanel'
import { MissionReviewDialog } from '../features/mission/MissionReviewDialog'
import { TimeBudgetStrip } from '../features/mission/TimeBudgetStrip'
import { ComparePlaceholder } from '../features/routes/ComparePlaceholder'
import { RoutesPreview } from '../features/routes/RoutesPreview'
import { RehearsePlaceholder } from '../features/rehearsal/RehearsePlaceholder'
import { RehearsalPanel, type RehearsalState } from '../features/rehearsal/RehearsalPanel'
import { RouteCompare } from '../features/routes/RouteCompare'
import { RouteTimeline } from '../features/routes/RouteTimeline'
import { routeSummary } from '../features/routes/routeFormat'
import { Button } from '../components/ui/Button'
import { getMission } from '../services/api/mission'
import { requestPlan } from '../services/api/plan'
import type { Mission, Position } from '../types/mission'
import type { InitialPlanningRequest, MissionSettings, PlanResponse, RouteMode, SettingsErrors, StopSettings } from '../types/planning'
import { buildInitialPlanningRequest, createMissionSettings, observationField, validateMissionSettings } from '../features/mission/settings'

import { AppHeader } from '../components/layout/AppHeader'
import { FloatingPanel } from '../components/layout/FloatingPanel'
import { InformationDock } from '../components/layout/InformationDock'
import { ScienceStopPanel } from '../features/science/ScienceStopPanel'

type LoadState = { status: 'loading' } | { status: 'ready'; mission: Mission; settings: MissionSettings } | { status: 'error'; message: string }
type PlanState =
  | { status: 'idle' }
  | { status: 'loading'; request: InitialPlanningRequest }
  | { status: 'ready'; request: InitialPlanningRequest; response: PlanResponse }
  | { status: 'error'; request: InitialPlanningRequest; message: string }

function toMapRoutes(response: PlanResponse, selected: RouteMode, previous?: PlanResponse): MapRoute[] {
  const before = previous?.routes.find(route => route.mode === selected)
  return [
    ...(before ? [{ id: `previous-${before.id}`, mode: before.mode, geometry: before.geometry, emphasis: 'previous' as const }] : []),
    ...response.routes.map(route => ({
      id: route.id, mode: route.mode, geometry: route.geometry,
      emphasis: route.mode === selected ? 'selected' as const : 'muted' as const,
      restSpots: route.restSpots?.map(spot => spot.position),
    })),
  ]
}

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
  const [plan, setPlan] = useState<PlanState>({ status: 'idle' })
  const [planStale, setPlanStale] = useState(false)
  const [selectedMode, setSelectedMode] = useState<RouteMode>('time-focused')
  const [blockCorners, setBlockCorners] = useState<Position[]>([])
  const [rehearsal, setRehearsal] = useState<RehearsalState>({ status: 'idle' })
  useEffect(() => {
    const controller = new AbortController()
    getMission(controller.signal).then(mission => {
      if (!controller.signal.aborted) setLoad({ status: 'ready', mission, settings: createMissionSettings(mission) })
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setLoad({ status: 'error', message: error instanceof Error ? error.message : 'Unable to load mission.' })
    })
    return () => controller.abort()
  }, [attempt])

  function runPlan(request: InitialPlanningRequest) {
    setPlan({ status: 'loading', request })
    setRehearsal({ status: 'idle' })
    requestPlan(request).then(response => {
      setPlan({ status: 'ready', request, response })
      setPlanStale(false)
    }).catch((error: unknown) => {
      setPlan({ status: 'error', request, message: error instanceof Error ? error.message : 'Planning failed.' })
    })
  }

  function replanWithBlock() {
    if (plan.status !== 'ready' || blockCorners.length < 3) return
    const request = { ...plan.request, requestId: crypto.randomUUID(), blockedAreas: [{ id: 'rehearsal-block', vertices: blockCorners }] }
    setRehearsal({ status: 'loading' })
    requestPlan(request).then(response => setRehearsal({ status: 'ready', response }))
      .catch((error: unknown) => setRehearsal({ status: 'error', message: error instanceof Error ? error.message : 'Replanning failed.' }))
  }

  const addCorner = useCallback((position: Position) => {
    setBlockCorners(previous => [...previous, { xMeters: Math.round(position.xMeters), yMeters: Math.round(position.yMeters) }])
    setRehearsal(previous => previous.status === 'loading' ? previous : { status: 'idle' })
  }, [])

  function changeSetting(field: Exclude<keyof MissionSettings, 'stops'>, value: string) {
    if (plan.status === 'ready') setPlanStale(true)
    setLoad(previous => previous.status === 'ready' ? { ...previous, settings: { ...previous.settings, [field]: value } } : previous)
    setErrors(previous => ({
      ...previous, [field]: undefined,
      ...(field === 'durationHours' || field === 'durationMinutes' ? { reserveMinutes: undefined } : {}),
    }))
  }

  function changeStop(id: string, patch: Partial<StopSettings>) {
    if (plan.status === 'ready') setPlanStale(true)
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
    const id = crypto.randomUUID()
    setReviewId(id)
    setReviewOpen(true)
    runPlan(buildInitialPlanningRequest(load.mission, load.settings, id))
  }

  const review = load.status === 'ready' && reviewId && Object.keys(validateMissionSettings(load.settings, load.mission)).length === 0
    ? buildInitialPlanningRequest(load.mission, load.settings, reviewId) : null

  const planned = plan.status === 'ready' ? plan.response : null
  const rehearsed = rehearsal.status === 'ready' ? rehearsal.response : null
  const shown = stage === 'Rehearse' && rehearsed ? rehearsed : planned
  const shownRoute = shown?.routes.find(route => route.mode === selectedMode) ?? shown?.routes[0]
  const mapRoutes = useMemo(() => {
    if (!planned) return undefined
    return stage === 'Rehearse' && rehearsed ? toMapRoutes(rehearsed, selectedMode, planned) : toMapRoutes(planned, selectedMode)
  }, [planned, rehearsed, stage, selectedMode])
  const blockedArea = stage === 'Rehearse' ? blockCorners : undefined
  const planStatus = plan.status === 'loading' ? <p className="hint" role="status">Calculating routes…</p>
    : plan.status === 'error' ? <p className="hint" role="alert">{plan.message}</p>
      : plan.status === 'ready' ? <div className="hint" role="status">
        <p>{plan.response.routes.map(route => `${route.mode === 'time-focused' ? 'Time-focused' : 'Conservative'}: ${routeSummary(route)}`).join(' · ')}</p>
        <Button onClick={() => { setReviewOpen(false); setStage('Compare') }}>Compare routes</Button>
      </div> : undefined

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
      {load.status === 'ready' ? <MissionMap key={load.mission.datasetId} layoutKey={`${stage}-${inspectorOpen}-${setupOpen}`} mission={load.mission} stopSettings={load.settings.stops} selectedId={selectedId} inspectionRequest={inspectionRequest} onSelect={inspectLocation}
        routes={mapRoutes} returnBoundary={stage === 'Plan' ? undefined : shownRoute?.returnBoundary} blockedArea={blockedArea}
        onMapClick={stage === 'Rehearse' && planned ? addCorner : undefined} /> : <MapPlaceholder />}
      <div id="setup-drawer" className="ws-left" data-map-edge="left">
        {load.status === 'loading' && <section className="panel state-panel" role="status"><p className="eyebrow">Mission setup</p><h2>Loading mission...</h2><p>Preparing your expedition workspace.</p></section>}
        {load.status === 'error' && <LoadingError message={load.message} onRetry={() => { setLoad({ status: 'loading' }); setAttempt(a => a + 1) }} />}
        {load.status === 'ready' && (stage === 'Plan'
          ? <MissionSetupPanel mission={load.mission} selectedId={selectedId} onSelect={inspectLocation}
            settings={load.settings} errors={errors} onSettingChange={changeSetting} onStopChange={changeStop}
            onBlur={validateField} onReview={reviewMission} />
          : <FloatingPanel title={stage === 'Compare' ? 'Compare routes' : 'Rehearsal'} key={stage}>
            {stage === 'Compare'
              ? planned ? <RouteCompare mission={load.mission} plan={planned} selected={selectedMode} onSelect={setSelectedMode} stale={planStale} />
                : plan.status === 'loading' ? <p className="hint" role="status">Calculating routes…</p>
                  : plan.status === 'error' ? <div className="rc"><p className="rc-stale" role="alert">{plan.message}</p><Button onClick={() => runPlan(plan.request)}>Try again</Button></div>
                    : <ComparePlaceholder onPlan={() => setStage('Plan')} />
              : planned ? <RehearsalPanel mission={load.mission} vertices={blockCorners} state={rehearsal} selected={selectedMode} onSelect={setSelectedMode}
                onUndo={() => { setBlockCorners(previous => previous.slice(0, -1)); setRehearsal({ status: 'idle' }) }}
                onClear={() => { setBlockCorners([]); setRehearsal({ status: 'idle' }) }} onReplan={replanWithBlock} />
                : <RehearsePlaceholder onPlan={() => setStage('Plan')} />}
          </FloatingPanel>)}
      </div>
      {load.status === 'ready' && <div className="ws-right" data-map-edge="right">
        <ScienceStopPanel mission={load.mission} selectedId={selectedId} open={inspectorOpen}
          onOpen={() => setInspectorOpen(true)} onCollapse={() => setInspectorOpen(false)}
          stopSettings={load.settings.stops} errors={errors} onStopChange={changeStop} onBlur={validateField} />
      </div>}
      <div className="ws-bottom" data-map-edge="bottom">
        {stage === 'Plan' && load.status === 'ready'
          ? <div className="ws-panel ws-strip"><TimeBudgetStrip mission={load.mission} settings={load.settings} />
            <RoutesPreview results={planned?.routes.map(route => ({ mode: route.mode, summary: routeSummary(route) }))} /></div>
          : shownRoute && shown ? <RouteTimeline route={shownRoute} budgetSeconds={shown.totalDurationSeconds} /> : <InformationDock stage={stage} />}
      </div>
    </main>
    {load.status === 'ready' && reviewOpen && review && <MissionReviewDialog mission={load.mission} request={review} onClose={() => setReviewOpen(false)} status={planStatus} />}
  </div>
}

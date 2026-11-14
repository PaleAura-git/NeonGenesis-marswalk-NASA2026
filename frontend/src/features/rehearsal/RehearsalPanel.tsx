import { Button } from '../../components/ui/Button'
import type { Mission, Position } from '../../types/mission'
import type { PlanResponse, RouteMode } from '../../types/planning'
import { RouteCompare } from '../routes/RouteCompare'
import '../routes/routes.css'

export type RehearsalState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; response: PlanResponse }
  | { status: 'error'; message: string }

interface Props {
  mission: Mission
  vertices: Position[]
  state: RehearsalState
  selected: RouteMode
  onSelect: (mode: RouteMode) => void
  onUndo: () => void
  onClear: () => void
  onReplan: () => void
}

/** Mark a blocked passage on the map, replan, and read what changed. */
export function RehearsalPanel({ mission, vertices, state, selected, onSelect, onUndo, onClear, onReplan }: Props) {
  const notes = state.status === 'ready'
    ? Object.fromEntries(state.response.routes.map(route => [route.mode, route.rehearsal ?? []]))
    : undefined
  return (
    <div className="rh">
      <p className="rh-help">Click the map to mark the corners of a blocked passage, such as a rockfall. Three corners or more.</p>
      <div className="rh-tools">
        <span className="ws-pill" role="status">{vertices.length} {vertices.length === 1 ? 'corner' : 'corners'}</span>
        <Button variant="secondary" onClick={onUndo} disabled={vertices.length === 0}>Undo</Button>
        <Button variant="secondary" onClick={onClear} disabled={vertices.length === 0 && state.status === 'idle'}>Clear</Button>
      </div>
      <Button className="full-width" onClick={onReplan} disabled={vertices.length < 3 || state.status === 'loading'}>
        {state.status === 'loading' ? 'Replanning…' : 'Replan with block'}
      </Button>
      {state.status === 'error' && <p className="rc-stale" role="alert">{state.message}</p>}
      {state.status === 'ready' && <RouteCompare mission={mission} plan={state.response} selected={selected}
        onSelect={onSelect} stale={false} notes={notes} />}
      {state.status === 'idle' && <p className="ws-panel-note">The faded line is the original route. After replanning, the planner lists the detour, any dropped stop, and whether a safe return still exists.</p>}
    </div>
  )
}

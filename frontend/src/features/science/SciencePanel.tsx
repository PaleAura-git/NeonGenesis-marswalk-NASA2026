import type { ScienceStop } from '../../types/mission'
import { Button } from '../../components/ui/Button'
import { Icon } from '../../components/ui/Icon'
import { StopSettingsControls, type StopEditorProps } from '../mission/StopSettingsControls'
export function SciencePanel({ stop, onClear, editor }: { stop: ScienceStop | undefined; onClear: () => void; editor?: StopEditorProps }) {
  if (!stop) {
    return (
      <div className="science-empty">
        <Icon name="science" className="empty-symbol" />
        <h3>Explore the science</h3>
        <p>Select a stop in Mission setup to see its objective and observation duration.</p>
      </div>
    )
  }

  return (
    <>
      <div className="stop-detail-heading">
        <h3>{stop.name}</h3>
        <Button variant="secondary" onClick={onClear} aria-label="Clear selected science stop"><Icon name="close" /></Button>
      </div>
      <div className="image-placeholder"><Icon name="image" /><p>Stop imagery pending</p></div>
      <p className="eyebrow">Observation objective</p>
      <p className="objective">{stop.observationObjective}</p>
      {editor && <StopSettingsControls id={stop.id} name={stop.name} prefix="science" {...editor} />}
      <dl className="stop-facts">
        <div><dt>Position</dt><dd>Synthetic</dd></div>
      </dl>
      <p className="hint">Adjustable simulation assumptions. Source resources will follow with real data.</p>
    </>
  )
}

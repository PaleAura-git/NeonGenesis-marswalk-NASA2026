import type { Mission } from '../../types/mission'
import { Button } from '../../components/ui/Button'
import { Icon } from '../../components/ui/Icon'

export function BaseDetails({ mission, onClear }: { mission: Mission; onClear: () => void }) {
  return (
    <>
      <div className="stop-detail-heading">
        <h3>{mission.base.name}</h3>
        <Button variant="secondary" onClick={onClear} aria-label="Clear selected base"><Icon name="close" /></Button>
      </div>
      <p className="eyebrow">Provisional base location</p>
      <p className="objective">Synthetic local position. Exact geographic placement pending.</p>
      <dl className="stop-facts">
        <div><dt>x / east</dt><dd>{mission.base.position.xMeters} m</dd></div>
        <div><dt>y / north</dt><dd>{mission.base.position.yMeters} m</dd></div>
      </dl>
      <p className="hint">Unverified geographic placeholder {mission.unverifiedGeographicReference.latitudeDegrees}&deg; N, {mission.unverifiedGeographicReference.longitudeDegrees}&deg; E. A verified transform is required before mapping this reference to local positions.</p>
    </>
  )
}

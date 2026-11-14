import type { Mission } from '../../types/mission'

/** Body of the inspector when the base is selected. The panel supplies the heading and close control. */
export function BaseDetails({ mission }: { mission: Mission }) {
  return (
    <>
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

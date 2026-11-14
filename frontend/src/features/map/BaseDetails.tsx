import type { Mission } from '../../types/mission'
import { toLatLon } from './geoFrame'

/** Body of the inspector when the base is selected. The panel supplies the heading and close control. */
export function BaseDetails({ mission }: { mission: Mission }) {
  const [latitude, longitude] = toLatLon(mission.base.position)
  return (
    <>
      <p className="eyebrow">Departure & return</p>
      <p className="objective">Start and end point of the expedition, and the origin of the local metre grid.</p>
      <dl className="stop-facts">
        <div><dt>x / east</dt><dd>{mission.base.position.xMeters} m</dd></div>
        <div><dt>y / north</dt><dd>{mission.base.position.yMeters} m</dd></div>
        <div><dt>Latitude</dt><dd>{latitude.toFixed(4)}&deg; N</dd></div>
        <div><dt>Longitude</dt><dd>{longitude.toFixed(4)}&deg; E</dd></div>
      </dl>
    </>
  )
}

import type { Mission } from '../../types/mission'
import { toLatLon } from './geoFrame'

/** Base position facts for the inspector. The panel supplies the heading, image and site notes. */
export function BaseDetails({ mission }: { mission: Mission }) {
  const [latitude, longitude] = toLatLon(mission.base.position)
  return (
    <>
      <dl className="stop-facts">
        <div><dt>x / east</dt><dd>{mission.base.position.xMeters} m</dd></div>
        <div><dt>y / north</dt><dd>{mission.base.position.yMeters} m</dd></div>
        <div><dt>Latitude</dt><dd>{latitude.toFixed(4)}&deg; N</dd></div>
        <div><dt>Longitude</dt><dd>{longitude.toFixed(4)}&deg; E</dd></div>
      </dl>
    </>
  )
}

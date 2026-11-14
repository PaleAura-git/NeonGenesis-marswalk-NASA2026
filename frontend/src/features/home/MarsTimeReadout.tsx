import { useEffect, useState } from 'react'
import { JEZERO_EAST_LONGITUDE, formatMarsClock, localMeanSolarTime } from './marsTime'

const UPDATE_MS = 5000
const jezeroClock = () => formatMarsClock(localMeanSolarTime(Date.now(), JEZERO_EAST_LONGITUDE))

/** Local mean solar time at Jezero, refreshed every few seconds. */
export function MarsTimeReadout() {
  const [clock, setClock] = useState(jezeroClock)

  useEffect(() => {
    const timer = window.setInterval(() => setClock(jezeroClock()), UPDATE_MS)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <p className="home-mars-time" title="Local mean solar time at Jezero Crater, calculated with NASA's Mars24 method.">
      <span className="home-mars-time-label">Local time at Jezero</span>
      <span className="home-mars-time-value">{clock} LMST</span>
    </p>
  )
}

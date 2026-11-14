import type { CSSProperties, Ref } from 'react'

export interface JezeroMarkerProps {
  /** Called when the marker is clicked, with the marker element as the card's anchor. */
  onJezeroActivate: (marker: HTMLButtonElement) => void
  /** True while the Jezero card is open. */
  jezeroExpanded: boolean
}

/** The Jezero marker on either globe. Both globes ignore drags that start on it. */
export function JezeroMarker({ markerRef, className = '', style, onJezeroActivate, jezeroExpanded }: JezeroMarkerProps & {
  markerRef?: Ref<HTMLButtonElement>
  className?: string
  style?: CSSProperties
}) {
  return (
    <button
      ref={markerRef}
      type="button"
      className={`globe-marker ${className}`}
      style={style}
      aria-label="About Jezero Crater"
      aria-haspopup="dialog"
      aria-expanded={jezeroExpanded}
      aria-controls={jezeroExpanded ? 'jezero-card' : undefined}
      onClick={event => onJezeroActivate(event.currentTarget)}
    >
      <span className="globe-marker-dot" aria-hidden="true" />
      <span className="globe-marker-label" aria-hidden="true">Jezero Crater</span>
    </button>
  )
}

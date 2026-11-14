import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from '../../components/ui/Icon'

type Popover = 'layers' | 'notes' | null

interface Props {
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
  layers: ReactNode
  notes: ReactNode
}

/** Vertical map control stack: zoom, reset, layers, data notes and a north indicator. */
export function MapControls({ onZoomIn, onZoomOut, onReset, layers, notes }: Props) {
  const [open, setOpen] = useState<Popover>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  // Close on Esc (returning focus to the toggle) or on a click outside the stack.
  useEffect(() => {
    if (!open) return
    const root = rootRef.current
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(null)
      root?.querySelector<HTMLButtonElement>(`[aria-controls="map-${open}"]`)?.focus()
    }
    const onPointer = (event: PointerEvent) => { if (root && !root.contains(event.target as Node)) setOpen(null) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  const toggle = (name: Exclude<Popover, null>) => setOpen(current => current === name ? null : name)

  return (
    <div ref={rootRef} className="ws-map-controls" data-map-edge="right">
      <div className="ws-control-group" role="group" aria-label="Map view">
        <button type="button" className="ws-map-button" aria-label="Zoom in" onClick={onZoomIn}><Icon name="plus" /></button>
        <button type="button" className="ws-map-button" aria-label="Zoom out" onClick={onZoomOut}><Icon name="minus" /></button>
        <button type="button" className="ws-map-button" aria-label="Reset view" onClick={onReset}><Icon name="reset" /></button>
      </div>
      <div className="ws-control-group ws-popover-anchor">
        <button type="button" className="ws-map-button" aria-label="Map layers" aria-expanded={open === 'layers'} aria-controls="map-layers"
          onClick={() => toggle('layers')}><Icon name="layers" /></button>
        {open === 'layers' && <div id="map-layers" className="ws-popover" role="group" aria-label="Map layers">{layers}</div>}
      </div>
      <div className="ws-control-group ws-popover-anchor">
        <button type="button" className="ws-map-button" aria-label="Coordinate and data notes" aria-expanded={open === 'notes'} aria-controls="map-notes"
          onClick={() => toggle('notes')}><Icon name="info" /></button>
        {open === 'notes' && <div id="map-notes" className="ws-popover ws-popover--notes" role="dialog" aria-label="Coordinate and data notes">{notes}</div>}
      </div>
      <div className="ws-control-group ws-north" role="img" aria-label="North is up">
        <Icon name="north" /><span aria-hidden="true">N</span>
      </div>
    </div>
  )
}

import { useEffect, useRef, type ReactNode } from 'react'
import type { Mission } from '../../types/mission'
import type { InitialPlanningRequest } from '../../types/planning'
import { Icon } from '../../components/ui/Icon'
import { MissionReview } from './MissionReview'

/** Shows the unchanged mission review in a modal dialog. */
export function MissionReviewDialog({ mission, request, onClose, status }: { mission: Mission; request: InitialPlanningRequest; onClose: () => void; status?: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    dialog.querySelector<HTMLElement>('.mission-review')?.focus()
    // No close() on cleanup: it would fire "close" and reset the parent's state (StrictMode re-runs effects).
    // Unmounting removes the dialog from the top layer anyway.
  }, [])

  return (
    // Esc fires "cancel" then "close"; both paths end in onClose.
    <dialog ref={dialogRef} className="ws-dialog" aria-labelledby="review-title" onClose={onClose}
      onClick={event => { if (event.target === event.currentTarget) event.currentTarget.close() }}>
      <div className="ws-dialog-body">
        <button type="button" className="ws-icon-button ws-dialog-close" aria-label="Close mission review" onClick={() => dialogRef.current?.close()}>
          <Icon name="close" />
        </button>
        <MissionReview mission={mission} request={request} status={status} />
      </div>
    </dialog>
  )
}

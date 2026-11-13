const preventSelection = (event: Event) => event.preventDefault()

/** Stops text selection on the home screen while a globe drag is active. Returns the unlock function. */
export function lockSelection(element: Element): () => void {
  const home = element.closest('.home')
  home?.classList.add('is-dragging-globe')
  window.getSelection()?.removeAllRanges()
  document.addEventListener('selectstart', preventSelection)
  return () => {
    home?.classList.remove('is-dragging-globe')
    document.removeEventListener('selectstart', preventSelection)
  }
}

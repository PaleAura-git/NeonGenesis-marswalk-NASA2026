import { useEffect, useState } from 'react'

const STORAGE_KEY = 'marswalk.homeIntroPlayed'
// Covers browsers where sessionStorage is unavailable: the intro still plays only once per page load.
let playedThisPage = false

function introAlreadyPlayed(): boolean {
  if (playedThisPage) return true
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) !== null
  } catch {
    return false
  }
}

const INTRO_MS = 1500

/**
 * True while the first-visit intro runs. It plays once per browser session, never with reduced motion,
 * and any click or key press finishes it at once.
 */
export function useIntro(reducedMotion: boolean): boolean {
  const [playing, setPlaying] = useState(() => !reducedMotion && !introAlreadyPlayed())

  useEffect(() => {
    if (!playing) return
    playedThisPage = true
    try {
      window.sessionStorage.setItem(STORAGE_KEY, '1')
    } catch {
      // Storage blocked: playedThisPage still prevents a replay on this page load.
    }
    const finish = () => setPlaying(false)
    const timer = window.setTimeout(finish, INTRO_MS)
    window.addEventListener('pointerdown', finish, true)
    window.addEventListener('keydown', finish, true)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointerdown', finish, true)
      window.removeEventListener('keydown', finish, true)
    }
  }, [playing])

  return playing && !reducedMotion
}

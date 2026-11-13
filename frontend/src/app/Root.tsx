import { useCallback, useEffect, useState } from 'react'
import App from './App'
import { HomeScreen } from '../features/home/HomeScreen'

type View = 'home' | 'workspace'

// The workspace stays mounted under the home screen, so mission settings survive going home and back.
export default function Root() {
  const [view, setView] = useState<View>('home')
  const [homeVisits, setHomeVisits] = useState(1)
  const enterWorkspace = useCallback(() => setView('workspace'), [])
  const goHome = useCallback(() => {
    setHomeVisits(visits => visits + 1)
    setView('home')
  }, [])

  useEffect(() => {
    if (view === 'workspace') {
      document.getElementById('main')?.focus({ preventScroll: true })
      return
    }
    const root = document.documentElement
    const previous = root.style.overflow
    root.style.overflow = 'hidden'
    return () => { root.style.overflow = previous }
  }, [view])

  return <>
    <div inert={view !== 'workspace'}><App onHome={goHome} /></div>
    {view === 'home' && <HomeScreen onEnter={enterWorkspace} focusAction={homeVisits > 1} />}
  </>
}

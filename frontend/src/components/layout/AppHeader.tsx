import { StageNav, type Stage } from './StageNav'
import { Icon } from '../ui/Icon'
import './wordmark.css'

interface Props {
  stage: Stage
  onChange: (stage: Stage) => void
  synthetic: boolean
  onHome?: () => void
  /** Narrow screens: toggles the Mission setup drawer. */
  setupOpen?: boolean
  onToggleSetup?: () => void
}

export function AppHeader({ stage, onChange, synthetic, onHome, setupOpen, onToggleSetup }: Props) {
  const mode = import.meta.env.VITE_DATA_MODE
  const source = mode === 'mock' ? 'Demo data' : mode === 'api' ? (synthetic ? 'Live planner' : 'NASA data · live planner') : 'Data mode unset'
  return (
    <header className="app-header" data-map-edge="top">
      <div className="identity">
        <h1>{onHome ? <button type="button" className="wordmark-button" onClick={onHome} aria-label="Marswalk, back to home screen" title="Back to home screen">Marswalk</button> : 'Marswalk'}</h1>
        <span className="location"><Icon name="location" /> Jezero Crater · Western delta</span>
      </div>
      <StageNav stage={stage} onChange={onChange} />
      <div className="header-end">
        {onToggleSetup && <button type="button" className="ws-drawer-toggle" aria-expanded={setupOpen} aria-controls="setup-drawer" onClick={onToggleSetup}>
          <Icon name="sliders" /><span>Setup</span>
        </button>}
        <div className="data-indicator">
          <span className="status-dot" aria-hidden="true" />
          {source}{synthetic && mode === 'api' ? ' / Synthetic' : ''}
        </div>
      </div>
    </header>
  )
}

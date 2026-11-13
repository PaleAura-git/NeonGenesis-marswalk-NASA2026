import { StageNav, type Stage } from './StageNav'
import { Icon } from '../ui/Icon'
import './wordmark.css'
export function AppHeader({ stage, onChange, synthetic, onHome }: { stage: Stage; onChange: (stage: Stage) => void; synthetic: boolean; onHome?: () => void }) {
  const mode = import.meta.env.VITE_DATA_MODE
  const source = mode === 'mock' ? 'Demo data' : mode === 'api' ? 'API mode' : 'Data mode unset'
  return (
    <header className="app-header">
      <div className="identity">
        <h1>{onHome ? <button type="button" className="wordmark-button" onClick={onHome} aria-label="Marswalk, back to home screen" title="Back to home screen">Marswalk</button> : 'Marswalk'}</h1>
        <span className="location"><Icon name="location" /> Jezero Crater</span>
      </div>
      <StageNav stage={stage} onChange={onChange} />
      <div className="data-indicator">
        <span className="status-dot" aria-hidden="true" />
        {source}{synthetic && mode === 'api' ? ' / Synthetic' : ''}
      </div>
    </header>
  )
}

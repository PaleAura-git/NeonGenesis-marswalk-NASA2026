export type Stage = 'Plan' | 'Compare' | 'Rehearse'
const stages: Stage[] = ['Plan', 'Compare', 'Rehearse']

export function StageNav({ stage, onChange }: { stage: Stage; onChange: (stage: Stage) => void }) {
  return <nav className="stage-nav" aria-label="Expedition stages">
    {stages.map(name => <button key={name} type="button" aria-current={stage === name ? 'step' : undefined} onClick={() => onChange(name)}>
      {name}
    </button>)}
  </nav>
}

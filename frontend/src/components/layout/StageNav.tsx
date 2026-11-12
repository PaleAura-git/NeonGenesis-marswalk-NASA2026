export type Stage = 'Plan' | 'Compare' | 'Rehearse'
const stages: Stage[] = ['Plan', 'Compare', 'Rehearse']

export function StageNav({ stage, onChange }: { stage: Stage; onChange: (stage: Stage) => void }) {
  return <nav className="stage-nav" aria-label="Expedition stages">
    {stages.map((name, index) => <button key={name} type="button" aria-current={stage === name ? 'step' : undefined} onClick={() => onChange(name)}>
      <span className="step-number">0{index + 1}</span>{name}
    </button>)}
  </nav>
}

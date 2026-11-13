import { Button } from './Button'
import { Icon } from './Icon'
export function EmptyState({ title, description, onPlan }: { title: string; description: string; onPlan: () => void }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{description}</p>
      <Button onClick={onPlan}>Return to Plan <Icon name="arrowRight" /></Button>
    </div>
  )
}

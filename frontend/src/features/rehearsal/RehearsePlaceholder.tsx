import { EmptyState } from '../../components/ui/EmptyState'
export function RehearsePlaceholder({ onPlan }: { onPlan: () => void }) {
  return <EmptyState title="Select a route before rehearsing" description="Generate a plan, then select a route in Compare. Playback and mission progress will appear here once a route is selected." onPlan={onPlan} />
}

import { EmptyState } from '../../components/ui/EmptyState'
export function ComparePlaceholder({ onPlan }: { onPlan: () => void }) {
  return <EmptyState title="Your routes start with a plan" description="Generate a plan in the Plan stage to compare visiting order, walking time, and science tradeoffs here." onPlan={onPlan} />
}

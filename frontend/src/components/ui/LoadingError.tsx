import { Button } from './Button'
export function LoadingError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <section className="panel state-panel" aria-labelledby="error-title"><p className="eyebrow">Mission setup</p><h2 id="error-title">Mission unavailable</h2><p role="alert">{message}</p><Button onClick={onRetry}>Try again</Button></section>
}

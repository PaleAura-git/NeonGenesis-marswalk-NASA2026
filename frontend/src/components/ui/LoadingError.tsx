export function LoadingError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <section className="panel state-panel" aria-labelledby="error-title">
    <p className="eyebrow">Connection interrupted</p>
    <h2 id="error-title">Mission unavailable</h2>
    <p role="alert">{message}</p>
    <button className="primary" type="button" onClick={onRetry}>Try again</button>
  </section>
}

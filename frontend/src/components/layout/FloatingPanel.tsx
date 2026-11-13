import type { ReactNode, Ref } from 'react'
import { Icon } from '../ui/Icon'
export function FloatingPanel({ title, children, className = '', detailsRef }: { title: string; children: ReactNode; className?: string; detailsRef?: Ref<HTMLDetailsElement> }) {
  return (
    <details ref={detailsRef} className={`panel floating-panel ${className}`} open>
      <summary>
        <h2>{title}</h2>
        <Icon name="chevronDown" className="disclosure-mark" />
      </summary>
      <div className="panel-content">{children}</div>
    </details>
  )
}

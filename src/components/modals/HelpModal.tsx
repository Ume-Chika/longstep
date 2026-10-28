import type { HelpTopic } from '../../types/app'
import { backdropCloseHandlers } from '../backdropClose'

interface HelpModalProps {
  topic: HelpTopic
  onClose: () => void
}

export function HelpModal({ topic, onClose }: HelpModalProps) {
  return (
    <div className="modal-backdrop" {...backdropCloseHandlers(onClose)}>
      <section aria-labelledby="help-modal-heading" className="help-modal">
        <button aria-label="閉じる" className="modal-close" onClick={onClose} type="button">
          <svg aria-hidden="true" fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeWidth="2.5" viewBox="0 0 14 14" width="14">
            <path d="M2 2l10 10M12 2L2 12" />
          </svg>
        </button>
        <h2 id="help-modal-heading">{topic.heading}</h2>
        <ol className="help-steps">
          {topic.steps.map((step, index) => (
            <li key={step.title}>
              <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
              <div>
                <strong>{step.title}</strong>
                <p>{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}

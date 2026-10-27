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
          <span aria-hidden="true" className="button-glyph">×</span>
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
        <button className="rpg-button rpg-button-primary full-width" onClick={onClose} type="button">とじる</button>
      </section>
    </div>
  )
}

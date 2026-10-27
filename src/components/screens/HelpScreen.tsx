import { helpTopics } from '../../constants/helpTopics'

interface HelpScreenProps {
  onSelectTopic: (topicId: string) => void
}

export function HelpScreen({ onSelectTopic }: HelpScreenProps) {
  return (
    <main className="page help-page">
      <section className="book-section">
        <div className="ornament-heading">
          <h2>ヘルプ</h2>
        </div>
        <div className="help-topic-list">
          {helpTopics.map((topic) => (
            <button
              className="help-topic"
              key={topic.id}
              onClick={() => onSelectTopic(topic.id)}
              type="button"
            >
              <strong>{topic.label}</strong>
              <span className="help-topic-summary">{topic.summary}</span>
            </button>
          ))}
        </div>
      </section>
    </main>
  )
}

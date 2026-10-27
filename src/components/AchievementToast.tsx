interface AchievementToastProps {
  achievement: string | null
}

export function AchievementToast({ achievement }: AchievementToastProps) {
  if (!achievement) return null

  return (
    <div className="achievement" role="status">
      <div className="achievement-rays" aria-hidden="true" />
      <div>
        <span>目標を達成しました</span>
        <strong>{achievement}</strong>
        <small>次に取り組める目標を確認しましょう</small>
      </div>
    </div>
  )
}

import type { Notice } from '../types/app'

interface NoticeStackProps {
  notices: Notice[]
  onDismiss: (id: number) => void
}

export function NoticeStack({ notices, onDismiss }: NoticeStackProps) {
  if (notices.length === 0) return null

  return (
    <div className="notice-stack">
      {notices.map((notice) => (
        <div className={`notice notice-${notice.kind}`} key={notice.id} role={notice.kind === 'error' ? 'alert' : 'status'}>
          <span className="notice-glyph" aria-hidden="true">{notice.kind === 'success' ? '✦' : '!'}</span>
          <span>{notice.text}</span>
          <button aria-label="通知を閉じる" onClick={() => onDismiss(notice.id)} type="button">×</button>
        </div>
      ))}
    </div>
  )
}

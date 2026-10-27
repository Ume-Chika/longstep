import { useRef, useState } from 'react'
import type { Notice } from '../types/app'

export function useNotices() {
  const [notices, setNotices] = useState<Notice[]>([])
  const noticeIdRef = useRef(0)

  function setNotice(notice: Omit<Notice, 'id'> | null) {
    if (!notice) {
      setNotices([])
      return
    }
    const id = ++noticeIdRef.current
    const text = notice.kind === 'error' && !notice.text.includes('ください')
      ? `${notice.text} 内容を確認して、もう一度操作してください。`
      : notice.text
    setNotices((current) => [...current, { ...notice, id, text }])
    if (notice.kind === 'success') {
      window.setTimeout(() => setNotices((current) => current.filter((item) => item.id !== id)), 3000)
    }
  }

  function dismissNotice(id: number) {
    setNotices((current) => current.filter((item) => item.id !== id))
  }

  return { notices, setNotice, dismissNotice }
}

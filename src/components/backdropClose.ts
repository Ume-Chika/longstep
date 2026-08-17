import type { MouseEvent as ReactMouseEvent } from 'react'

/**
 * 背景（スクリム）で押して、背景で離したときだけ閉じる。
 *
 * `mousedown`だけで閉じると、モーダル内のテキストを選択しようとして
 * ドラッグが背景まで伸びたときに誤って閉じてしまう。押した場所と
 * 離した場所の両方が背景のときだけ閉じることで、これを防ぐ。
 *
 * すべてのモーダルの背景要素へ、そのままスプレッドして使う。
 */

// 同時に押される背景は1つだけなので、モジュール内で保持する。
// レンダー中の変数だと、押してから離すまでに再描画が挟まったとき値が失われる。
let pressedBackdrop: EventTarget | null = null

export function backdropCloseHandlers<T extends HTMLElement>(close: () => void) {
  return {
    onMouseDown: (event: ReactMouseEvent<T>) => {
      pressedBackdrop = event.target === event.currentTarget ? event.currentTarget : null
    },
    onMouseUp: (event: ReactMouseEvent<T>) => {
      const shouldClose = pressedBackdrop === event.currentTarget && event.target === event.currentTarget
      pressedBackdrop = null
      if (shouldClose) close()
    },
  }
}

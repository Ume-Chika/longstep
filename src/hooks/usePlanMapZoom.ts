import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { clampZoom, mapZoomStep } from '../components/plan-map/planMapLayout.ts'
import type { MapLayout } from '../components/plan-map/planMapTypes.ts'

export function usePlanMapZoom(mapRef: RefObject<HTMLDivElement | null>, layout: MapLayout) {
  const [zoom, setZoom] = useState(1)
  const zoomRef = useRef(1)
  zoomRef.current = zoom

  const applyZoom = useCallback((targetZoom: number, anchor?: { clientX: number; clientY: number }) => {
    const nextZoom = clampZoom(targetZoom)
    const prevZoom = zoomRef.current
    if (nextZoom === prevZoom) return
    const map = mapRef.current
    if (map) {
      const rect = map.getBoundingClientRect()
      const offsetX = anchor ? anchor.clientX - rect.left : map.clientWidth / 2
      const offsetY = anchor ? anchor.clientY - rect.top : map.clientHeight / 2
      const mapX = (map.scrollLeft + offsetX) / prevZoom
      const mapY = (map.scrollTop + offsetY) / prevZoom
      zoomRef.current = nextZoom
      setZoom(nextZoom)
      requestAnimationFrame(() => {
        map.scrollLeft = Math.max(0, mapX * nextZoom - offsetX)
        map.scrollTop = Math.max(0, mapY * nextZoom - offsetY)
      })
      return
    }
    zoomRef.current = nextZoom
    setZoom(nextZoom)
  }, [mapRef])

  const fitMapToViewport = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    const fitScale = Math.min(1, (map.clientWidth - 24) / layout.width, (map.clientHeight - 24) / layout.height)
    const nextZoom = clampZoom(fitScale)
    zoomRef.current = nextZoom
    setZoom(nextZoom)
    requestAnimationFrame(() => map.scrollTo({ left: 0, top: 0, behavior: 'auto' }))
  }, [layout.height, layout.width, mapRef])

  const zoomIn = useCallback(() => applyZoom(zoomRef.current + mapZoomStep), [applyZoom])
  const zoomOut = useCallback(() => applyZoom(zoomRef.current - mapZoomStep), [applyZoom])
  const resetZoom = useCallback(() => applyZoom(1), [applyZoom])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    function handleWheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      applyZoom(zoomRef.current + Math.max(-0.2, Math.min(0.2, -event.deltaY * 0.006)), { clientX: event.clientX, clientY: event.clientY })
    }
    map.addEventListener('wheel', handleWheel, { passive: false })
    return () => map.removeEventListener('wheel', handleWheel)
  }, [applyZoom, mapRef])

  const resetToInitial = useCallback(() => {
    zoomRef.current = 1
    setZoom(1)
  }, [])

  return { zoom, zoomIn, zoomOut, resetZoom, fitMapToViewport, resetToInitial }
}

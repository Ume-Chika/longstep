import type { ThemeId } from '../models/theme'
import { themeOptions } from '../models/theme'

interface ThemeCrestProps {
  theme: ThemeId
  className?: string
}

export function ThemeCrest({ theme, className = '' }: ThemeCrestProps) {
  const themeOption = themeOptions.find((option) => option.id === theme) ?? themeOptions[0]

  return (
    <span aria-hidden="true" className={`theme-crest theme-crest-${theme} ${className}`}>
      <span className="crest-wing crest-wing-left" />
      <span className="crest-wing crest-wing-right" />
      <span className="crest-crown">✦</span>
      <span className="crest-shield"><span className="crest-symbol">{themeOption.symbol}</span></span>
      <span className="crest-ribbon" />
    </span>
  )
}

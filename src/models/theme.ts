export type ThemeId = 'fire' | 'water' | 'wind' | 'earth' | 'gold' | 'space' | 'fancy' | 'recommended'

export const themeOptions = [
  { id: 'fire', label: '火', name: 'Ember Crest', symbol: '♨' },
  { id: 'water', label: '水', name: 'Tide Crest', symbol: '≋' },
  { id: 'wind', label: '風', name: 'Gale Crest', symbol: '⌁' },
  { id: 'earth', label: '地', name: 'Stone Crest', symbol: '◆' },
  { id: 'gold', label: '金', name: 'Aurum Crest', symbol: '◈' },
  { id: 'space', label: '宇宙', name: 'Cosmos Crest', symbol: '✧' },
  { id: 'fancy', label: 'ファンシー', name: 'Dream Crest', symbol: '♡' },
  { id: 'recommended', label: 'おすすめ', name: 'Lucky Crest', symbol: '★' },
] as const satisfies ReadonlyArray<{ id: ThemeId; label: string; name: string; symbol: string }>

export function isThemeId(value: unknown): value is ThemeId {
  return themeOptions.some((option) => option.id === value)
}

export type ThemeId = 'fire' | 'water' | 'wind' | 'earth' | 'gold' | 'space' | 'fancy' | 'recommended' | 'night'

export const themeOptions = [
  { id: 'fire', label: 'Brown', name: 'Brown', symbol: '♨' },
  { id: 'water', label: 'Teal', name: 'Teal', symbol: '≋' },
  { id: 'wind', label: 'Olive', name: 'Olive', symbol: '⌁' },
  { id: 'earth', label: 'Khaki', name: 'Khaki', symbol: '◆' },
  { id: 'gold', label: 'Gold', name: 'Gold', symbol: '◈' },
  { id: 'space', label: 'Purple', name: 'Purple', symbol: '✧' },
  { id: 'fancy', label: 'Pink', name: 'Pink', symbol: '♡' },
  { id: 'recommended', label: 'Forest Green', name: 'Forest Green', symbol: '★' },
  { id: 'night', label: 'Night', name: 'Night', symbol: '☾' },
] as const satisfies ReadonlyArray<{ id: ThemeId; label: string; name: string; symbol: string }>

export function isThemeId(value: unknown): value is ThemeId {
  return themeOptions.some((option) => option.id === value)
}

export type ThemeId = 'fire' | 'water' | 'wind' | 'earth' | 'gold' | 'space' | 'fancy'

export const themeOptions = [
  { id: 'fire', label: '茶', name: 'Brown', symbol: '♨' },
  { id: 'water', label: '青緑', name: 'Teal', symbol: '≋' },
  { id: 'wind', label: '深緑', name: 'Olive', symbol: '⌁' },
  { id: 'earth', label: '砂色', name: 'Khaki', symbol: '◆' },
  { id: 'gold', label: '黄金', name: 'Gold', symbol: '◈' },
  { id: 'space', label: '紫', name: 'Purple', symbol: '✧' },
  { id: 'fancy', label: 'ピンク', name: 'Pink', symbol: '♡' },
] as const satisfies ReadonlyArray<{ id: ThemeId; label: string; name: string; symbol: string }>

export function isThemeId(value: unknown): value is ThemeId {
  return themeOptions.some((option) => option.id === value)
}

export type ThemeId = 'fire' | 'water' | 'wind' | 'earth' | 'gold' | 'space' | 'fancy'

export const themeOptions = [
  { id: 'fire', label: '茶（火）', name: 'Brown', symbol: '♨' },
  { id: 'water', label: '青緑（水）', name: 'Teal', symbol: '≋' },
  { id: 'wind', label: '深緑（風）', name: 'Olive', symbol: '⌁' },
  { id: 'earth', label: '砂色（地）', name: 'Khaki', symbol: '◆' },
  { id: 'gold', label: '黄金（金）', name: 'Gold', symbol: '◈' },
  { id: 'space', label: '夜紫（宙）', name: 'Purple', symbol: '✧' },
  { id: 'fancy', label: '紅梅（彩）', name: 'Pink', symbol: '♡' },
] as const satisfies ReadonlyArray<{ id: ThemeId; label: string; name: string; symbol: string }>

export function isThemeId(value: unknown): value is ThemeId {
  return themeOptions.some((option) => option.id === value)
}

import { shiftColorPalette } from '../constants/colors'

export const SHIFT_TYPES = ['데이', '이브닝', '나이트', '휴일'] as const
export type ShiftType = (typeof SHIFT_TYPES)[number]

export type ShiftColorMap = Record<ShiftType, string>

const STORAGE_KEY = 'gguck-shift-colors-v1'

const DEFAULT_SHIFT_COLORS: ShiftColorMap = {
  데이: shiftColorPalette[0].value, // 노랑
  이브닝: shiftColorPalette[1].value, // 코랄
  나이트: shiftColorPalette[2].value, // 남색
  휴일: shiftColorPalette[3].value, // 베이지
}

export function loadShiftColors(): ShiftColorMap {
  if (typeof window === 'undefined') return DEFAULT_SHIFT_COLORS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SHIFT_COLORS
    const parsed = JSON.parse(raw) as Partial<ShiftColorMap>
    return { ...DEFAULT_SHIFT_COLORS, ...parsed }
  } catch {
    return DEFAULT_SHIFT_COLORS
  }
}

export function saveShiftColors(colors: ShiftColorMap): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(colors))
  } catch {
    // 저장 실패해도 이번 세션 내 사용에는 지장 없어서 조용히 무시한다.
  }
}

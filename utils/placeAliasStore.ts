import AsyncStorage from '@react-native-async-storage/async-storage'

import type { PlaceAlias } from '../types/schema'

const STORAGE_KEY = 'gguck:placeAliases'
const LOCAL_USER_ID = 'local' // 아직 로그인/사용자 구분이 없어 CalendarScreen의 샘플 데이터와 동일하게 고정

export async function getPlaceAliases(): Promise<PlaceAlias[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw) as PlaceAlias[]
  } catch {
    return []
  }
}

export async function savePlaceAlias(input: {
  alias: string
  name: string
  address: string | null
  category: string | null
}): Promise<PlaceAlias> {
  const existing = await getPlaceAliases()
  const newAlias: PlaceAlias = {
    userId: LOCAL_USER_ID,
    alias: input.alias,
    name: input.name,
    address: input.address,
    category: input.category,
    createdAt: new Date().toISOString(),
  }
  // 같은 alias가 이미 있으면 덮어쓰기 (최신 정보 유지)
  const next = [...existing.filter((a) => a.alias !== input.alias), newAlias]
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return newAlias
}

export async function deletePlaceAlias(alias: string): Promise<void> {
  const existing = await getPlaceAliases()
  const next = existing.filter((a) => a.alias !== alias)
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}

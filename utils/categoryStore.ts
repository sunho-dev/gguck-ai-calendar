import AsyncStorage from '@react-native-async-storage/async-storage'

import type { Category } from '../types/schema'

const STORAGE_KEY = 'gguck:categories'
const LOCAL_USER_ID = 'local' // placeAliasStore와 동일하게, 아직 로그인/사용자 구분이 없어 고정

// 처음 쓰는 사람을 위한 기본 카테고리 몇 개. 마음에 안 들면 얼마든지 늘어나거나 안 써도 됨.
const DEFAULT_CATEGORIES: Category[] = [
  { id: 'default-appointment', userId: LOCAL_USER_ID, name: '약속', color: '#C56F5D', createdAt: '' },
  { id: 'default-work', userId: LOCAL_USER_ID, name: '업무', color: '#88786E', createdAt: '' },
  { id: 'default-exercise', userId: LOCAL_USER_ID, name: '운동', color: '#2F6B4F', createdAt: '' },
]

export async function getCategories(): Promise<Category[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY)
  if (!raw) return DEFAULT_CATEGORIES
  try {
    const parsed = JSON.parse(raw) as Category[]
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_CATEGORIES
  } catch {
    return DEFAULT_CATEGORIES
  }
}

export async function findCategoryByName(name: string): Promise<Category | null> {
  const categories = await getCategories()
  const normalized = name.trim().toLowerCase()
  return categories.find((c) => c.name.trim().toLowerCase() === normalized) ?? null
}

export async function saveCategory(input: { name: string; color: string }): Promise<Category> {
  const existing = await getCategories()
  const normalized = input.name.trim().toLowerCase()
  const already = existing.find((c) => c.name.trim().toLowerCase() === normalized)
  if (already) {
    // 이미 있으면 색만 바꿔 덮어쓰기 (이름 중복으로 새로 쌓이지 않게)
    const updated: Category = { ...already, color: input.color }
    const next = existing.map((c) => (c.id === already.id ? updated : c))
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    return updated
  }
  const newCategory: Category = {
    id: `cat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    userId: LOCAL_USER_ID,
    name: input.name.trim(),
    color: input.color,
    createdAt: new Date().toISOString(),
  }
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...existing, newCategory]))
  return newCategory
}

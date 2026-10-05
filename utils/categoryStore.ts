import type { BaseCategory, UserCategory } from '../types/schema';

const KEY = 'gguck-categories-v1';
const NOW = '2026-01-01T00:00:00+09:00';

export const DEFAULT_CATEGORIES: UserCategory[] = [
  {
    id: 'exercise',
    label: '운동',
    color: '#C56F5D',
    baseCategory: 'exercise',
    defaultReminderMin: 30,
    notificationEnabled: true,
    keywords: ['운동', '헬스', '러닝', '수영', '요가', '산책'],
    createdAt: NOW,
  },
  {
    id: 'work',
    label: '업무',
    color: '#8A93A3',
    baseCategory: 'work',
    defaultReminderMin: 10,
    notificationEnabled: true,
    keywords: ['업무', '회사', '회의', '미팅', '출근', '근무'],
    createdAt: NOW,
  },
  {
    id: 'personal',
    label: '개인',
    color: '#D98773',
    baseCategory: 'personal',
    defaultReminderMin: 60,
    notificationEnabled: true,
    keywords: ['약속', '친구', '가족', '식사', '데이트'],
    createdAt: NOW,
  },
  {
    id: 'study',
    label: '공부',
    color: '#D3AA67',
    baseCategory: 'study',
    defaultReminderMin: 10,
    notificationEnabled: true,
    keywords: ['공부', '학습', '수업', '독서', '시험'],
    createdAt: NOW,
  },
  {
    id: 'health',
    label: '건강',
    color: '#88A78A',
    baseCategory: 'health',
    defaultReminderMin: 60,
    notificationEnabled: true,
    keywords: ['병원', '건강', '진료', '치과', '검진', '약국'],
    createdAt: NOW,
  },
];

function valid(value: unknown): value is UserCategory {
  const c = value as UserCategory;
  return (
    !!c &&
    typeof c.id === 'string' &&
    typeof c.label === 'string' &&
    typeof c.color === 'string' &&
    Array.isArray(c.keywords)
  );
}

export function loadCategories(): UserCategory[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return DEFAULT_CATEGORIES;
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_CATEGORIES;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_CATEGORIES;
    const items = parsed.filter(valid);
    return items.length ? items : DEFAULT_CATEGORIES;
  } catch {
    return DEFAULT_CATEGORIES;
  }
}

export function saveCategories(categories: UserCategory[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.setItem(KEY, JSON.stringify(categories));
  window.dispatchEvent(new globalThis.Event('gguck-categories-changed'));
  window.dispatchEvent(new globalThis.Event('gguck-events-changed'));
}

export function getCategory(id: string, categories = loadCategories()): UserCategory | undefined {
  return categories.find((c) => c.id === id);
}

export function inferBaseCategory(text: string): BaseCategory {
  if (/운동|헬스|러닝|수영|요가|클라이밍|산책|필라테스|등산/.test(text)) return 'exercise';
  if (/업무|회사|회의|미팅|출근|근무|취업|면접|자소서|포트폴리오|지원/.test(text)) return 'work';
  if (/공부|학습|수업|독서|시험|자격증|강의/.test(text)) return 'study';
  if (/병원|건강|진료|치과|검진|약국|접종/.test(text)) return 'health';
  return 'personal';
}

export function findCategoryForText(
  text: string,
  base?: BaseCategory | string,
  categories = loadCategories(),
): UserCategory {
  const normalized = text.toLowerCase();
  let best: UserCategory | undefined;
  let bestScore = 0;
  for (const c of categories) {
    let score = 0;
    if (base && c.baseCategory === base) score += 2;
    if (normalized.includes(c.label.toLowerCase())) score += 5;
    for (const keyword of c.keywords) {
      if (keyword && normalized.includes(keyword.toLowerCase())) score += 4;
    }
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  if (best && bestScore >= 4) return best;
  const baseMatch =
    categories.find((c) => c.id === base) || categories.find((c) => c.baseCategory === base);
  return (
    baseMatch ||
    categories.find((c) => c.id === 'personal') ||
    categories[0] ||
    DEFAULT_CATEGORIES[2]
  );
}

export function categoryLabel(id: string): string {
  return getCategory(id)?.label || id;
}
export function categoryColor(id: string): string {
  return getCategory(id)?.color || '#88786E';
}
export function categoryNotificationsEnabled(id: string): boolean {
  return getCategory(id)?.notificationEnabled !== false;
}
export function categoryDefaultReminder(id: string, fallback = 0): number {
  return getCategory(id)?.defaultReminderMin ?? fallback;
}

export function makeCategoryId(label: string): string {
  const slug =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 24) || 'category';
  return `custom-${slug}-${Date.now().toString(36).slice(-5)}`;
}

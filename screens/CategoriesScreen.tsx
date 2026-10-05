import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { colors, shiftColorPalette } from '../constants/colors';
import type { BaseCategory, UserCategory } from '../types/schema';
import {
  DEFAULT_CATEGORIES,
  inferBaseCategory,
  loadCategories,
  makeCategoryId,
  saveCategories,
} from '../utils/categoryStore';
import { loadStoredEvents, saveStoredEvents } from '../utils/eventsStorage';
import { useCategories } from '../utils/useCategories';
import { useStoredEvents } from '../utils/useStoredEvents';

const BASE_OPTIONS: { id: BaseCategory; label: string }[] = [
  { id: 'exercise', label: '운동/활동' },
  { id: 'work', label: '업무/취업' },
  { id: 'personal', label: '개인/약속' },
  { id: 'study', label: '공부/학습' },
  { id: 'health', label: '건강/병원' },
];
const CORE_IDS = new Set(DEFAULT_CATEGORIES.map((c) => c.id));
const COLOR_OPTIONS = [
  ...shiftColorPalette.map((c) => c.value),
  '#D98773',
  '#C56F5D',
  '#7D9A8B',
  '#9B86B0',
];

function emptyDraft(): UserCategory {
  return {
    id: '',
    label: '',
    color: '#D98773',
    baseCategory: 'personal',
    defaultReminderMin: 30,
    notificationEnabled: true,
    keywords: [],
    createdAt: new Date().toISOString(),
  };
}

export function CategoriesScreen({ onCalendar = () => {} }: { onCalendar?: () => void }) {
  const { width } = useWindowDimensions();
  const mobile = width < 700;
  const categories = useCategories();
  const events = useStoredEvents();
  const [draft, setDraft] = useState<UserCategory | null>(null);
  const [keywordText, setKeywordText] = useState('');
  const [colorText, setColorText] = useState('#D98773');
  const [error, setError] = useState('');
  const stats = useMemo(
    () =>
      new Map(
        categories.map((c) => [
          c.id,
          events.filter((e) => !e.cancelledAt && e.category === c.id).length,
        ]),
      ),
    [categories, events],
  );

  const openNew = () => {
    const d = emptyDraft();
    setDraft(d);
    setKeywordText('');
    setColorText(d.color);
    setError('');
  };
  const openEdit = (c: UserCategory) => {
    setDraft({ ...c, keywords: [...c.keywords] });
    setKeywordText(c.keywords.join(', '));
    setColorText(c.color);
    setError('');
  };
  const patch = (p: Partial<UserCategory>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const save = () => {
    if (!draft) return;
    const label = draft.label.trim();
    if (!label) {
      setError('카테고리 이름을 입력해 주세요.');
      return;
    }
    const keywords = keywordText
      .split(/[,\n]/)
      .map((v) => v.trim())
      .filter(Boolean);
    const normalizedColor = colorText.trim().toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(normalizedColor)) {
      setError('색상은 #RRGGBB 형식으로 입력해 주세요. 예: #D98773');
      return;
    }
    const nextItem: UserCategory = {
      ...draft,
      label,
      color: normalizedColor,
      keywords,
      baseCategory: draft.baseCategory || inferBaseCategory(label),
    };
    const current = loadCategories();
    const next = draft.id
      ? current.map((c) => (c.id === draft.id ? nextItem : c))
      : [...current, { ...nextItem, id: makeCategoryId(label) }];
    saveCategories(next as UserCategory[]);
    setDraft(null);
    setError('');
  };
  const remove = (c: UserCategory) => {
    if (CORE_IDS.has(c.id)) return;
    const replacement = loadCategories().find((x) => x.id === 'personal')?.id || 'personal';
    saveStoredEvents(
      (loadStoredEvents() || []).map((e) =>
        e.category === c.id ? { ...e, category: replacement } : e,
      ),
    );
    saveCategories(loadCategories().filter((x) => x.id !== c.id));
    setDraft(null);
  };

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={[styles.content, mobile && styles.contentMobile]}
    >
      <View style={[styles.hero, mobile && styles.heroMobile]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.eyebrow}>MY LIFE, MY CALENDAR</Text>
          <Text style={[styles.heading, mobile && styles.headingMobile]}>
            {mobile ? (
              <>내 생활을{'\n'}카테고리로 나눠보세요.</>
            ) : (
              '내 생활을 카테고리로 나눠보세요.'
            )}
          </Text>
          <Text style={[styles.subtitle, mobile && styles.subtitleMobile]}>
            클라이밍, 취업, 친구, 게임처럼 내가 쓰는 말로 만들면 꾹이 대화를 읽고 알맞은 곳에 일정을
            정리해요.
          </Text>
        </View>
        <Pressable onPress={openNew} style={[styles.primary, mobile && styles.primaryMobile]}>
          <Text style={styles.primaryText}>＋ 카테고리 만들기</Text>
        </Pressable>
      </View>

      <View style={[styles.grid, mobile && styles.gridMobile]}>
        {categories.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => openEdit(c)}
            style={[styles.card, mobile && styles.cardMobile, { borderTopColor: c.color }]}
          >
            <View style={styles.cardTop}>
              <View style={[styles.categoryColorMark, { backgroundColor: c.color }]} />
              <View style={styles.cardTopActions}>
                <Pressable
                  testID={`category-edit-${c.id}`}
                  onPress={(e) => {
                    e.stopPropagation();
                    openEdit(c);
                  }}
                  style={styles.editButton}
                >
                  <Text style={styles.editButtonText}>수정</Text>
                </Pressable>
                {!CORE_IDS.has(c.id) && (
                  <Pressable
                    testID={`category-delete-${c.id}`}
                    onPress={(e) => {
                      e.stopPropagation();
                      remove(c);
                    }}
                    style={styles.deleteButton}
                  >
                    <Text style={styles.deleteButtonText}>×</Text>
                  </Pressable>
                )}
              </View>
            </View>
            <Text style={styles.cardTitle}>{c.label}</Text>
            <Text style={styles.count}>{stats.get(c.id) || 0}개의 일정</Text>
            <View style={styles.meta}>
              <Text style={styles.metaText}>알림 {c.notificationEnabled ? 'ON' : 'OFF'}</Text>
              <Text style={styles.metaText}>
                {c.defaultReminderMin === 0 ? '시작 시간' : `${c.defaultReminderMin}분 전`}
              </Text>
            </View>
            {!!c.keywords.length && (
              <Text style={styles.keywords} numberOfLines={2}>
                AI 키워드 · {c.keywords.slice(0, 4).join(' · ')}
              </Text>
            )}
          </Pressable>
        ))}
        <Pressable
          onPress={openNew}
          style={[styles.card, styles.addCard, mobile && styles.cardMobile]}
        >
          <Text style={styles.addPlus}>＋</Text>
          <Text style={styles.addText}>내 카테고리 추가</Text>
          <Text style={styles.addHint}>내 생활에 맞는 분류를 직접 만들어요.</Text>
        </Pressable>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>카테고리가 어떻게 쓰이나요?</Text>
        <Text style={styles.infoText}>
          “내일 저녁 8시 더클라임”을 붙여넣으면 → 내가 지정한 색의 클라이밍 카테고리로 자동 분류 →
          기본 알림 적용 → 캘린더에 저장돼요.
        </Text>
        <Pressable onPress={onCalendar} style={styles.secondary}>
          <Text style={styles.secondaryText}>나의 캘린더 보기</Text>
        </Pressable>
      </View>

      <Modal
        visible={!!draft}
        transparent
        animationType="fade"
        onRequestClose={() => setDraft(null)}
      >
        <View style={styles.overlay}>
          <ScrollView style={styles.dialog} contentContainerStyle={{ padding: 24 }}>
            <Text style={styles.dialogTitle}>{draft?.id ? '카테고리 설정' : '새 카테고리'}</Text>
            <Text style={styles.label}>이름</Text>
            <TextInput
              value={draft?.label || ''}
              onChangeText={(label) =>
                patch({
                  label,
                  baseCategory: draft?.id ? draft.baseCategory : inferBaseCategory(label),
                })
              }
              placeholder="예: 클라이밍, 취업, 친구"
              style={styles.input}
            />
            <Text style={styles.label}>카테고리 색상</Text>
            <View style={styles.colorEditor}>
              <View
                style={[
                  styles.colorPreview,
                  {
                    backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(colorText.trim())
                      ? colorText.trim()
                      : '#D9CBBE',
                  },
                ]}
              />
              <View style={{ flex: 1, minWidth: 180 }}>
                <TextInput
                  value={colorText}
                  onChangeText={setColorText}
                  autoCapitalize="characters"
                  maxLength={7}
                  placeholder="#D98773"
                  style={styles.input}
                />
                <Text style={styles.help}>
                  원하는 HEX 색상을 직접 입력하거나 아래 색상에서 골라 주세요.
                </Text>
              </View>
            </View>
            <View style={styles.row}>
              {COLOR_OPTIONS.map((color) => (
                <Pressable
                  accessibilityLabel={`카테고리 색상 ${color}`}
                  key={color}
                  onPress={() => {
                    setColorText(color.toUpperCase());
                    patch({ color });
                  }}
                  style={[
                    styles.swatch,
                    { backgroundColor: color },
                    colorText.toUpperCase() === color.toUpperCase() && styles.swatchSelected,
                  ]}
                />
              ))}
            </View>
            <Text style={styles.label}>AI가 이해할 생활 영역</Text>
            <View style={styles.row}>
              {BASE_OPTIONS.map((o) => (
                <Pressable
                  key={o.id}
                  onPress={() => patch({ baseCategory: o.id })}
                  style={[styles.pill, draft?.baseCategory === o.id && styles.pillActive]}
                >
                  <Text
                    style={draft?.baseCategory === o.id ? styles.pillTextActive : styles.pillText}
                  >
                    {o.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.label}>자동 분류 키워드</Text>
            <TextInput
              value={keywordText}
              onChangeText={setKeywordText}
              placeholder="예: 클라이밍, 더클라임, 볼더링"
              style={styles.input}
            />
            <Text style={styles.help}>
              쉼표로 구분해 주세요. 대화에 이 단어가 있으면 이 카테고리를 우선 사용해요.
            </Text>
            <Text style={styles.label}>기본 알림</Text>
            <View style={styles.row}>
              {[0, 10, 30, 60, 120, 1440].map((min) => (
                <Pressable
                  key={min}
                  onPress={() => patch({ defaultReminderMin: min })}
                  style={[styles.pill, draft?.defaultReminderMin === min && styles.pillActive]}
                >
                  <Text
                    style={
                      draft?.defaultReminderMin === min ? styles.pillTextActive : styles.pillText
                    }
                  >
                    {min === 0 ? '정각' : min === 1440 ? '하루 전' : `${min}분 전`}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchTitle}>이 카테고리 알림</Text>
                <Text style={styles.help}>
                  꺼두면 이 카테고리의 모든 일정 알림이 잠시 멈춰요. 개별 일정 설정은 유지됩니다.
                </Text>
              </View>
              <Switch
                value={draft?.notificationEnabled !== false}
                onValueChange={(notificationEnabled) => patch({ notificationEnabled })}
              />
            </View>
            {!!error && <Text style={styles.error}>{error}</Text>}
            <View style={styles.actionRow}>
              <Pressable onPress={() => setDraft(null)} style={styles.secondary}>
                <Text style={styles.secondaryText}>취소</Text>
              </Pressable>
              <Pressable onPress={save} style={styles.primary}>
                <Text style={styles.primaryText}>저장</Text>
              </Pressable>
            </View>
            {draft?.id && !CORE_IDS.has(draft.id) && (
              <Pressable onPress={() => remove(draft)} style={styles.delete}>
                <Text style={styles.deleteText}>카테고리 삭제 · 기존 일정은 ‘개인’으로 이동</Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: 1180 },
  content: { padding: 28, paddingBottom: 60 },
  contentMobile: { paddingHorizontal: 18, paddingTop: 22, paddingBottom: 28 },
  hero: {
    flexDirection: 'row',
    gap: 20,
    alignItems: 'flex-end',
    marginBottom: 26,
    flexWrap: 'wrap',
  },
  heroMobile: { flexDirection: 'column', alignItems: 'stretch', gap: 18, marginBottom: 22 },
  eyebrow: { fontSize: 11, letterSpacing: 1.6, color: '#9B6C51', fontWeight: '700' },
  heading: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.textDark,
    marginTop: 8,
    marginBottom: 8,
  },
  headingMobile: {
    fontSize: 34,
    lineHeight: 43,
    letterSpacing: -1.2,
    marginTop: 10,
    marginBottom: 10,
  },
  subtitle: { fontSize: 14, lineHeight: 23, color: colors.warmGray, maxWidth: 700 },
  subtitleMobile: { fontSize: 15, lineHeight: 25, maxWidth: '100%' },
  primary: {
    backgroundColor: colors.terracotta,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 14,
    alignItems: 'center',
  },
  primaryMobile: { width: '100%', minHeight: 52, justifyContent: 'center' },
  primaryText: { color: colors.white, fontWeight: '700' },
  secondary: {
    backgroundColor: '#EFE2D5',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 14,
    alignItems: 'center',
  },
  secondaryText: { color: colors.textDark, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  gridMobile: { flexDirection: 'column', gap: 16 },
  card: {
    width: 220,
    minHeight: 176,
    backgroundColor: '#FFFAF4',
    borderWidth: 1,
    borderColor: '#E5D8CB',
    borderTopWidth: 5,
    borderRadius: 20,
    padding: 18,
  },
  cardMobile: { width: '100%', minWidth: 0, minHeight: 164, padding: 20 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  categoryColorMark: { width: 54, height: 16, borderRadius: 8 },
  cardTopActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  editButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: colors.lightBeige,
  },
  editButtonText: { color: colors.textDark, fontSize: 12, fontWeight: '600' },
  deleteButton: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  deleteButtonText: { color: colors.warmGray, fontSize: 16, lineHeight: 16 },
  cardTitle: { fontSize: 19, fontWeight: '700', color: colors.textDark, marginTop: 15 },
  count: { fontSize: 12, color: colors.warmGray, marginTop: 5 },
  meta: { flexDirection: 'row', gap: 7, marginTop: 14, flexWrap: 'wrap' },
  metaText: {
    fontSize: 11,
    color: '#765D4E',
    backgroundColor: '#F2E7DC',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
  },
  keywords: { fontSize: 11, lineHeight: 17, color: colors.warmGray, marginTop: 11 },
  addCard: {
    borderTopColor: '#D9CBBE',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPlus: { fontSize: 30, color: colors.terracotta },
  addText: { fontSize: 15, fontWeight: '700', color: colors.textDark, marginTop: 6 },
  addHint: { fontSize: 11, color: colors.warmGray, marginTop: 5, textAlign: 'center' },
  infoBox: { marginTop: 28, backgroundColor: '#F2E7DC', borderRadius: 20, padding: 22 },
  infoTitle: { fontSize: 16, fontWeight: '700', color: colors.textDark },
  infoText: { fontSize: 13, lineHeight: 22, color: colors.warmGray, marginVertical: 10 },
  overlay: {
    flex: 1,
    backgroundColor: '#0007',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  dialog: {
    width: '100%',
    maxWidth: 620,
    maxHeight: '92%',
    backgroundColor: colors.cream,
    borderRadius: 24,
  },
  dialogTitle: { fontSize: 24, fontWeight: '800', color: colors.textDark, marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '600', color: '#745B4C', marginTop: 14, marginBottom: 7 },
  input: {
    backgroundColor: '#FFFAF4',
    borderWidth: 1,
    borderColor: '#E5D8CB',
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: 15,
    color: colors.textDark,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  colorEditor: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 10 },
  colorPreview: { width: 58, height: 58, borderRadius: 16, borderWidth: 1, borderColor: '#DCCBBC' },
  swatch: { width: 32, height: 32, borderRadius: 10, borderWidth: 2, borderColor: 'transparent' },
  swatchSelected: { borderColor: '#4A3F38' },
  pill: {
    borderWidth: 1,
    borderColor: '#DCCBBC',
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: '#FFF9F2',
  },
  pillActive: { backgroundColor: colors.terracotta, borderColor: colors.terracotta },
  pillText: { fontSize: 12, color: colors.textDark },
  pillTextActive: { fontSize: 12, color: colors.white, fontWeight: '700' },
  help: { fontSize: 11, lineHeight: 18, color: colors.warmGray, marginTop: 6 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 20,
    padding: 14,
    backgroundColor: '#F2E7DC',
    borderRadius: 14,
  },
  switchTitle: { fontSize: 14, fontWeight: '700', color: colors.textDark },
  actionRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 22 },
  delete: { marginTop: 16, padding: 12, alignItems: 'center' },
  deleteText: { fontSize: 12, color: '#A24B3C' },
  error: { color: '#A54130', marginTop: 12, fontSize: 12 },
});

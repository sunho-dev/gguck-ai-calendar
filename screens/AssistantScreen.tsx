import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { categoryPalette, colors } from '../constants/colors';
import { interpretEvent, type InterpretedEvent } from '../utils/interpretEvent';
import { savePlaceAlias } from '../utils/placeAliasStore';
import { getCategories, saveCategory } from '../utils/categoryStore';
import { loadStoredEvents, saveStoredEvents } from '../utils/eventsStorage';
import { generateEventId } from '../utils/quickEntry';
import { check, type CheckResult } from '../utils/ruleCheck';
import type { Category, Event } from '../types/schema';

type PlaceStep =
  | { kind: 'none' }
  | { kind: 'confirmGuess'; aliasText: string; guessedName: string; guessedAddress: string | null }
  | { kind: 'manualInput'; aliasText: string };

interface AssistantScreenProps {
  initialText?: string;
  autoRun?: boolean;
  onInitialTextConsumed?: () => void;
}

export function AssistantScreen({ initialText = '', autoRun = false, onInitialTextConsumed }: AssistantScreenProps) {
  const [text, setText] = useState(initialText);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InterpretedEvent | null>(null);
  const [placeStep, setPlaceStep] = useState<PlaceStep>({ kind: 'none' });
  const [manualName, setManualName] = useState('');
  const [manualAddress, setManualAddress] = useState('');
  const [categoryInput, setCategoryInput] = useState('');
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [registeredEventId, setRegisteredEventId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [pendingNewCategory, setPendingNewCategory] = useState<string | null>(null);
  const [blockResult, setBlockResult] = useState<CheckResult | null>(null);

  useEffect(() => {
    getCategories().then(setCategories);
  }, []);

  const findCategory = (name: string) =>
    categories.find((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase()) ?? null;

  const runInterpret = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setSavedNotice(null);
    setPlaceStep({ kind: 'none' });
    setRegisteredEventId(null);
    setPendingNewCategory(null);
    setBlockResult(null);
    try {
      const event = await interpretEvent({ text, createdFrom: autoRun ? 'share' : 'paste' });
      setResult(event);
      setCategoryInput(event.category); // 확인/입력 화면에서 바로 고칠 수 있게 미리 채워둠

      const latestCategories = await getCategories();
      setCategories(latestCategories);
      const known = latestCategories.find((c) => c.name.trim().toLowerCase() === event.category.trim().toLowerCase());
      if (!known) {
        setPendingNewCategory(event.category);
      }

      const placeIsAmbiguous = event.ambiguousFields.includes('place');
      if (placeIsAmbiguous && event.placeAliasCandidate) {
        if (event.place) {
          setPlaceStep({
            kind: 'confirmGuess',
            aliasText: event.placeAliasCandidate,
            guessedName: event.place.name,
            guessedAddress: event.place.address,
          });
        } else {
          setPlaceStep({ kind: 'manualInput', aliasText: event.placeAliasCandidate });
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (autoRun && initialText.trim()) {
      runInterpret();
    }
    onInitialTextConsumed?.();
    // 마운트 시 한 번만: 공유로 열렸을 때 자동 실행 + 부모에게 소비했다고 알림
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildEvent = (): Event | null => {
    if (!result) return null;
    return {
      id: generateEventId(),
      userId: 'local',
      title: result.title,
      category: result.category,
      startDate: result.startDate,
      endDate: result.endDate,
      time: result.time ?? '09:00',
      durationMin: result.durationMin ?? 60,
      place: result.place
        ? { name: result.place.name, address: result.place.address ?? '', lat: 0, lng: 0 }
        : null,
      remindMin: result.remindMin ?? 0,
      bufferMin: result.bufferMin ?? 0,
      createdFrom: autoRun ? 'share' : 'paste',
      sharedWith: [],
    };
  };

  const saveEvent = (newEvent: Event) => {
    saveStoredEvents([...(loadStoredEvents() ?? []), newEvent]);
    setRegisteredEventId(newEvent.id);
    setBlockResult(null);
  };

  const registerEvent = () => {
    const newEvent = buildEvent();
    if (!newEvent) return;
    // 규칙 검사(check())는 아직 스텁 — 항상 통과. 창민이 실제 규칙 엔진을 완성하면
    // utils/ruleCheck.ts의 check() 본문만 교체하면 이 호출부는 그대로 작동한다.
    const outcome = check(newEvent, loadStoredEvents() ?? [], []);
    if (outcome.result === 'block') {
      setBlockResult(outcome);
      return;
    }
    saveEvent(newEvent);
  };

  const forceRegisterDespiteBlock = () => {
    const newEvent = buildEvent();
    if (!newEvent) return;
    saveEvent(newEvent);
  };

  const undoRegister = () => {
    if (!registeredEventId) return;
    saveStoredEvents((loadStoredEvents() ?? []).filter((e) => e.id !== registeredEventId));
    setRegisteredEventId(null);
  };

  const pickColorForNewCategory = async (color: string) => {
    if (!pendingNewCategory) return;
    const saved = await saveCategory({ name: pendingNewCategory, color });
    setCategories((prev) => [...prev.filter((c) => c.id !== saved.id), saved]);
    setPendingNewCategory(null);
  };

  const applyCategory = (category: Category) => {
    setResult((prev) => (prev ? { ...prev, category: category.name } : prev));
    setCategoryInput(category.name);
    setPendingNewCategory(null);
  };

  const confirmGuess = async () => {
    if (placeStep.kind !== 'confirmGuess') return;
    const category = categoryInput.trim() || null;
    await savePlaceAlias({
      alias: placeStep.aliasText,
      name: placeStep.guessedName,
      address: placeStep.guessedAddress,
      category,
    });
    setResult((prev) =>
      prev
        ? { ...prev, place: { name: placeStep.guessedName, address: placeStep.guessedAddress }, category: category ?? prev.category }
        : prev,
    );
    setSavedNotice(
      `"${placeStep.aliasText}" = ${placeStep.guessedName}${category ? ` (${category})` : ''} 저장했어요. 다음부터는 안 물어볼게요.`,
    );
    setPlaceStep({ kind: 'none' });
  };

  const rejectGuess = () => {
    if (placeStep.kind !== 'confirmGuess') return;
    setManualName('');
    setManualAddress('');
    setPlaceStep({ kind: 'manualInput', aliasText: placeStep.aliasText });
  };

  const submitManual = async () => {
    if (placeStep.kind !== 'manualInput' || !manualName.trim()) return;
    const category = categoryInput.trim() || null;
    const address = manualAddress.trim() || null;
    await savePlaceAlias({
      alias: placeStep.aliasText,
      name: manualName.trim(),
      address,
      category,
    });
    setResult((prev) =>
      prev ? { ...prev, place: { name: manualName.trim(), address }, category: category ?? prev.category } : prev,
    );
    setSavedNotice(
      `"${placeStep.aliasText}" = ${manualName.trim()}${category ? ` (${category})` : ''} 저장했어요. 다음부터는 안 물어볼게요.`,
    );
    setPlaceStep({ kind: 'none' });
    setManualName('');
    setManualAddress('');
  };

  return (
    <View style={styles.page}>
      <Text style={styles.heading}>일정 비서</Text>
      <Text style={styles.subheading}>카톡 대화나 공지 문구를 붙여넣으면 일정 정보를 뽑아드려요.</Text>

      <TextInput
        style={styles.input}
        multiline
        placeholder="예: 내일 8시 종숲 ㄱ"
        placeholderTextColor={colors.warmGray}
        value={text}
        onChangeText={setText}
      />

      <Pressable
        style={[styles.button, (!text.trim() || loading) && styles.buttonDisabled]}
        onPress={runInterpret}
        disabled={!text.trim() || loading}
      >
        {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>해석하기</Text>}
      </Pressable>

      {error && <Text style={styles.errorText}>{error}</Text>}

      {result && (
        <View style={styles.resultCard}>
          <Text style={styles.resultTitle}>{result.title}</Text>

          <View style={styles.categoryRow}>
            <View
              style={[
                styles.categoryPill,
                { backgroundColor: findCategory(result.category)?.color ?? colors.lightBeige },
              ]}
            >
              <Text style={styles.categoryPillText}>{result.category}</Text>
            </View>
          </View>

          {categories.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryPickRow}>
              {categories.map((c) => (
                <Pressable
                  key={c.id}
                  style={[styles.categoryChip, { borderColor: c.color }]}
                  onPress={() => applyCategory(c)}
                >
                  <View style={[styles.categoryDot, { backgroundColor: c.color }]} />
                  <Text style={styles.categoryChipText}>{c.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          {pendingNewCategory && (
            <View style={styles.newCategoryBox}>
              <Text style={styles.fieldLabel}>"{pendingNewCategory}"는 새 카테고리예요. 색을 골라주세요</Text>
              <View style={styles.colorSwatchRow}>
                {categoryPalette.map((color) => (
                  <Pressable
                    key={color}
                    style={[styles.colorSwatch, { backgroundColor: color }]}
                    onPress={() => pickColorForNewCategory(color)}
                  />
                ))}
              </View>
            </View>
          )}

          <Text style={styles.resultLine}>
            날짜: {result.startDate}
            {result.endDate !== result.startDate ? ` ~ ${result.endDate}` : ''}
          </Text>
          <Text style={styles.resultLine}>시간: {result.time ?? '미지정'}</Text>
          <Text style={styles.resultLine}>
            장소: {result.place ? `${result.place.name}${result.place.address ? ` (${result.place.address})` : ''}` : '미지정'}
          </Text>
          <Text style={styles.resultConfidence}>확신도: {result.confidence}</Text>

          {registeredEventId ? (
            <View style={styles.registerRow}>
              <Text style={styles.registeredText}>✓ 일정에 등록했어요</Text>
              <Pressable onPress={undoRegister}>
                <Text style={styles.undoText}>되돌리기</Text>
              </Pressable>
            </View>
          ) : blockResult ? (
            <View style={styles.blockBox}>
              <Text style={styles.blockText}>🚫 {blockResult.reason ?? '규칙에 걸려서 등록이 막혔어요.'}</Text>
              <Pressable style={styles.blockOverrideButton} onPress={forceRegisterDespiteBlock}>
                <Text style={styles.undoText}>그래도 등록하기</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable style={styles.registerButton} onPress={registerEvent}>
              <Text style={styles.registerButtonText}>이 일정 등록하기</Text>
            </Pressable>
          )}
        </View>
      )}

      {placeStep.kind === 'confirmGuess' && (
        <View style={styles.confirmCard}>
          <Text style={styles.confirmText}>
            "{placeStep.aliasText}"가 <Text style={styles.confirmStrong}>{placeStep.guessedName}</Text> 맞아요?
          </Text>
          <Text style={styles.fieldLabel}>카테고리</Text>
          <TextInput
            style={styles.manualInput}
            placeholder="예: 클라이밍, 약속, 운동..."
            placeholderTextColor={colors.warmGray}
            value={categoryInput}
            onChangeText={setCategoryInput}
          />
          <View style={styles.confirmButtonRow}>
            <Pressable style={styles.confirmButtonYes} onPress={confirmGuess}>
              <Text style={styles.confirmButtonText}>맞아요</Text>
            </Pressable>
            <Pressable style={styles.confirmButtonNo} onPress={rejectGuess}>
              <Text style={styles.confirmButtonTextNo}>아니에요</Text>
            </Pressable>
          </View>
        </View>
      )}

      {placeStep.kind === 'manualInput' && (
        <View style={styles.confirmCard}>
          <Text style={styles.confirmText}>"{placeStep.aliasText}"가 정확히 어디예요?</Text>
          <TextInput
            style={styles.manualInput}
            placeholder="장소 이름 (예: 서울숲클라이밍 종로점)"
            placeholderTextColor={colors.warmGray}
            value={manualName}
            onChangeText={setManualName}
          />
          <TextInput
            style={styles.manualInput}
            placeholder="주소 (선택)"
            placeholderTextColor={colors.warmGray}
            value={manualAddress}
            onChangeText={setManualAddress}
          />
          <Text style={styles.fieldLabel}>카테고리</Text>
          <TextInput
            style={styles.manualInput}
            placeholder="예: 클라이밍, 약속, 운동..."
            placeholderTextColor={colors.warmGray}
            value={categoryInput}
            onChangeText={setCategoryInput}
          />
          <Pressable
            style={[styles.confirmButtonYes, !manualName.trim() && styles.buttonDisabled]}
            onPress={submitManual}
            disabled={!manualName.trim()}
          >
            <Text style={styles.confirmButtonText}>저장하고 다음부턴 안 물어보기</Text>
          </Pressable>
        </View>
      )}

      {savedNotice && <Text style={styles.savedNotice}>{savedNotice}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    width: '100%',
    maxWidth: 480,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  heading: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textDark,
    marginBottom: 4,
  },
  subheading: {
    fontSize: 13,
    color: colors.warmGray,
    marginBottom: 16,
  },
  input: {
    minHeight: 90,
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: colors.textDark,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  button: {
    backgroundColor: colors.terracotta,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 14,
  },
  errorText: {
    color: colors.terracotta,
    fontSize: 13,
    marginBottom: 12,
  },
  resultCard: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textDark,
    marginBottom: 8,
  },
  categoryRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  categoryPill: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  categoryPillText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  categoryPickRow: {
    marginBottom: 10,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginRight: 8,
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  categoryChipText: {
    fontSize: 12,
    color: colors.textDark,
    fontWeight: '600',
  },
  newCategoryBox: {
    backgroundColor: colors.cream,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  colorSwatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 6,
  },
  colorSwatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  resultLine: {
    fontSize: 13,
    color: colors.textDark,
    marginBottom: 4,
  },
  resultConfidence: {
    fontSize: 12,
    color: colors.warmGray,
    marginTop: 4,
  },
  registerButton: {
    backgroundColor: colors.terracotta,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  registerButtonText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 13,
  },
  registerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  blockBox: {
    backgroundColor: '#F6DEDC',
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
  },
  blockText: {
    color: '#A13A3A',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  blockOverrideButton: {
    alignSelf: 'flex-start',
  },
  registeredText: {
    color: colors.terracotta,
    fontWeight: '700',
    fontSize: 13,
  },
  undoText: {
    color: colors.warmGray,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  confirmCard: {
    backgroundColor: colors.lightBeige,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  confirmText: {
    fontSize: 14,
    color: colors.textDark,
    marginBottom: 12,
  },
  confirmStrong: {
    fontWeight: '700',
  },
  fieldLabel: {
    fontSize: 12,
    color: colors.warmGray,
    marginBottom: 4,
  },
  confirmButtonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  confirmButtonYes: {
    flex: 1,
    backgroundColor: colors.terracotta,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  confirmButtonNo: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 13,
  },
  confirmButtonTextNo: {
    color: colors.textDark,
    fontWeight: '700',
    fontSize: 13,
  },
  manualInput: {
    backgroundColor: colors.white,
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
    color: colors.textDark,
    marginBottom: 10,
  },
  savedNotice: {
    fontSize: 13,
    color: colors.terracotta,
    fontWeight: '600',
  },
});

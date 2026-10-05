import { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { ImportReviewList } from './ImportReviewList';
import { Choice, controlStyles } from './ScheduleControls';
import { assessImport, approveImport, type ImportAssessment } from '../utils/importRules';
import { loadStoredEvents } from '../utils/eventsStorage';
import { loadRules } from '../utils/scheduleAdapter';
import type { ImportedEventDraft } from '../utils/icsImport';
import type { Event } from '../types/schema';
export function RuleAwareImportReview({
  title,
  drafts,
  onConfirm,
  onCancel,
}: {
  title: string;
  drafts: ImportedEventDraft[];
  onConfirm: (events: Event[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [review, setReview] = useState<ImportAssessment[] | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function save(items: ImportAssessment[], mode: 'all' | 'safe') {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const events = approveImport(items, mode);
      if (!events.length) throw Error('등록할 일정을 하나 이상 선택해 주세요.');
      await onConfirm(events);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  function inspect(selected: ImportedEventDraft[]) {
    if (busy) return;
    const items = assessImport(selected, loadStoredEvents() || [], loadRules());
    if (items.some((x) => x.reasons.length)) setReview(items);
    else void save(items, 'safe');
  }
  return (
    <View style={{ gap: 10 }}>
      <View pointerEvents={busy ? 'none' : 'auto'} style={{ opacity: busy ? 0.5 : 1 }}>
        {!review ? (
          <ImportReviewList title={title} drafts={drafts} onConfirm={inspect} onCancel={onCancel} />
        ) : (
          <View style={{ backgroundColor: '#FFFAF4', padding: 16, borderRadius: 16, gap: 10 }}>
            <Text style={{ fontSize: 18, fontWeight: '600' }}>
              가져온 일정에도 내 규칙을 적용했어요
            </Text>
            <Text>
              선택 {review.length}개 · 확인 필요 {review.filter((x) => x.blocked).length}개
            </Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {review
                .filter((x) => x.reasons.length)
                .map((x) => (
                  <View key={x.event.id} style={{ paddingVertical: 10 }}>
                    <Text>
                      {x.event.startDate} {x.event.time} · {x.event.title}
                    </Text>
                    {x.reasons.map((r, i) => (
                      <Text key={i}>
                        {r.action === 'warn' ? '참고' : '확인'}: {r.message}
                      </Text>
                    ))}
                  </View>
                ))}
            </ScrollView>
            <Text>같이 가져오는 일정끼리도 검사해요. 지난 일정은 기록으로 가져올 수 있어요.</Text>
            <View style={controlStyles.row}>
              <Choice label="선택 다시 보기" onPress={() => setReview(null)} />
              <Choice
                label="규칙을 통과한 일정만 등록"
                disabled={busy || !review.some((x) => !x.blocked)}
                onPress={() => void save(review, 'safe')}
              />
              <Choice
                label="선택한 일정만 예외로 모두 등록"
                disabled={
                  busy ||
                  review.some((x) => x.reasons.some((r) => r.action !== 'warn' && !r.overridable))
                }
                onPress={() => void save(review, 'all')}
              />
            </View>
          </View>
        )}
      </View>
      {busy && <Text>저장 중…</Text>}
      {!!error && <Text accessibilityRole="alert">{error}</Text>}
    </View>
  );
}

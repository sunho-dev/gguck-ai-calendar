import { useState } from 'react';
import { Modal, ScrollView, Switch, Text, View, StyleSheet } from 'react-native';
import type { Event } from '../types/schema';
import { stamp } from '../utils/scheduler';
import { useStoredEvents } from '../utils/useStoredEvents';
import { loadStoredEvents, saveStoredEvents } from '../utils/eventsStorage';
import { Choice } from '../components/ScheduleControls';
import { colors } from '../constants/colors';
import { PushSettings } from '../components/PushSettings';
import { reminderMessages } from '../utils/reminderPlan';
import { getCategory, loadCategories, saveCategories } from '../utils/categoryStore';
import { useCategories } from '../utils/useCategories';

function reminderTimeLabel(e: Event) {
  const date = new Date(stamp(e.startDate, e.time) - e.remindMin * 60000);
  return (
    new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date) + '에 알려드려요'
  );
}
function eventNotificationEnabled(e: Event) {
  return e.notificationEnabled !== false;
}
function setEventNotification(eventId: string, enabled: boolean) {
  const events = loadStoredEvents() || [];
  saveStoredEvents(
    events.map((e) => (e.id === eventId ? { ...e, notificationEnabled: enabled } : e)),
  );
}
export function AlertsScreen({ onCompose = () => {} }: { onCompose?: () => void }) {
  const [notify, setNotify] = useState<Event | null>(null);
  const userCategories = useCategories();
  const events = useStoredEvents()
    .filter((e) => !e.cancelledAt && stamp(e.startDate, e.time) >= Date.now())
    .sort((a, b) => stamp(a.startDate, a.time) - stamp(b.startDate, b.time));
  return (
    <ScrollView style={styles.page}>
      <Text style={styles.heading}>필요한 순간, 잊지 않게.</Text>
      <PushSettings />
      <Text style={styles.muted}>
        전체 → 카테고리 → 개별 일정 순서로 알림을 관리해요. 카테고리를 꺼도 일정과 개별 설정은
        그대로 남아요.
      </Text>
      <Text style={styles.sectionTitle}>카테고리 알림</Text>
      <View style={styles.categoryGrid}>
        {userCategories.map((c) => (
          <View key={c.id} style={[styles.categoryAlertCard, { borderLeftColor: c.color }]}>
            <View style={{ flex: 1 }}>
              <View style={styles.categoryTitleRow}>
                <View style={[styles.categoryDot, { backgroundColor: c.color }]} />
                <Text style={styles.categoryTitle}>{c.label}</Text>
              </View>
              <Text style={styles.muted}>
                기본 {c.defaultReminderMin === 0 ? '시작 시간' : `${c.defaultReminderMin}분 전`} ·{' '}
                {events.filter((e) => e.category === c.id && !e.cancelledAt).length}개 일정
              </Text>
            </View>
            <Switch
              value={c.notificationEnabled !== false}
              onValueChange={(value) =>
                saveCategories(
                  loadCategories().map((x) =>
                    x.id === c.id ? { ...x, notificationEnabled: value } : x,
                  ),
                )
              }
            />
          </View>
        ))}
      </View>
      <Text style={styles.sectionTitle}>개별 일정 알림</Text>
      {events.map((e) => {
        const enabled = eventNotificationEnabled(e),
          category = getCategory(e.category, userCategories),
          categoryEnabled = category?.notificationEnabled !== false,
          effective = enabled && categoryEnabled;
        return (
          <View key={e.id} style={[styles.card, !effective && styles.cardDisabled]}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderText}>
                <View style={styles.categoryTitleRow}>
                  <View
                    style={[styles.categoryDot, { backgroundColor: category?.color || '#B9ADA2' }]}
                  />
                  <Text style={styles.muted}>
                    {category?.label || e.category}
                    {!categoryEnabled ? ' · 카테고리 알림 OFF' : ''}
                  </Text>
                </View>
                <Text style={styles.title}>{e.title}</Text>
              </View>
              <View style={styles.toggleWrap}>
                <Text style={[styles.toggleLabel, !enabled && styles.offText]}>
                  {enabled ? 'ON' : 'OFF'}
                </Text>
                <Switch
                  accessibilityLabel={`${e.title} 개별 알림 ${enabled ? '끄기' : '켜기'}`}
                  accessibilityHint="이 일정의 알림만 켜거나 끕니다."
                  value={enabled}
                  onValueChange={(value) => setEventNotification(e.id, value)}
                  trackColor={{ false: '#D8CEC4', true: '#D79A7F' }}
                  thumbColor="#FFF9F2"
                />
              </View>
            </View>
            <Text style={styles.muted}>
              {e.startDate} {e.time} · {e.remindMin}분 전
            </Text>
            {effective ? (
              <Text style={styles.muted}>🔔 {reminderTimeLabel(e)}</Text>
            ) : (
              <Text style={styles.offText}>
                🔕{' '}
                {!categoryEnabled
                  ? '카테고리 알림이 꺼져 있어요.'
                  : '이 일정은 알림을 보내지 않아요.'}
              </Text>
            )}
            <Choice
              label={`${e.title} 알림 미리보기`}
              disabled={!effective}
              onPress={() => setNotify(e)}
            />
          </View>
        );
      })}
      {!events.length && (
        <View style={styles.card}>
          <Text style={styles.muted}>새 일정을 등록하면 카테고리별 알림이 여기에 표시돼요.</Text>
          <Choice label="일정 등록하러 가기" onPress={onCompose} />
        </View>
      )}
      <Modal
        visible={!!notify}
        transparent
        animationType="fade"
        onRequestClose={() => setNotify(null)}
      >
        <View style={styles.overlay}>
          <View style={styles.dialog} accessibilityViewIsModal>
            <Text style={styles.heading}>꾹</Text>
            <Text style={styles.muted}>알림 미리보기 · 실제 발송 아님</Text>
            <Text style={styles.title}>
              {notify?.title}
              {notify?.remindMin ? `까지 ${notify.remindMin}분` : ' 시작 시간이에요'}
            </Text>
            <Text style={styles.message}>
              {notify
                ? notify.reminderMessage ||
                  reminderMessages[
                    getCategory(notify.category, userCategories)?.baseCategory || notify.category
                  ] ||
                  reminderMessages.personal
                : ''}
            </Text>
            <Choice label="확인" onPress={() => setNotify(null)} />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: 900, padding: 24 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textDark,
    marginTop: 22,
    marginBottom: 8,
  },
  categoryGrid: { gap: 8 },
  categoryAlertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: '#FFFAF4',
    borderRadius: 14,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: '#E5D8CB',
  },
  categoryTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 3 },
  categoryDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  categoryTitle: { fontSize: 15, fontWeight: '700', color: colors.textDark },
  heading: { fontSize: 26, color: colors.textDark, fontWeight: '700', marginBottom: 12 },
  card: {
    padding: 22,
    marginVertical: 9,
    backgroundColor: '#FFFAF4',
    borderWidth: 1,
    borderColor: '#E5D8CB',
    borderRadius: 18,
    gap: 8,
  },
  cardDisabled: { opacity: 0.72, backgroundColor: '#F8F3EC' },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  cardHeaderText: { flex: 1, gap: 8 },
  toggleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toggleLabel: { fontSize: 12, fontWeight: '700', color: '#8E5A43' },
  offText: { fontSize: 13, lineHeight: 22, color: '#8B7A6C' },
  title: { fontSize: 18, fontWeight: '600', color: colors.textDark },
  muted: { fontSize: 13, lineHeight: 22, color: colors.warmGray },
  overlay: {
    flex: 1,
    backgroundColor: '#0006',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: colors.cream,
    borderRadius: 24,
    padding: 28,
    gap: 12,
  },
  message: { fontSize: 16, lineHeight: 26, color: colors.textDark },
});

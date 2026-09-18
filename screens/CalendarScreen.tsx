import { useEffect, useMemo, useState } from 'react';
import { FlatList, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {check} from '../utils/scheduler';
import {toSchedule,loadRules} from '../utils/scheduleAdapter';
import { GlossyBox } from '../components/GlossyBox';
import { colors } from '../constants/colors';
import koreanHolidays from '../data/koreanHolidays.json';
import type { Event } from '../types/schema';
import { buildGoogleCalendarLink } from '../utils/googleCalendarLink';
import {
  addDays,
  addMonths,
  buildMonthGrid,
  dayOfMonth,
  formatMonthLabel,
  formatWeekday,
  isSameMonth,
  startOfMonth,
  todayISODate,
} from '../utils/date';
import { generateEventId, parseQuickEntry } from '../utils/quickEntry';
import { interpretEvent } from '../utils/interpretEvent';
import { syncEventCreate, syncEventDelete, syncEventUpdate } from '../utils/googleSync';
import { useGoogleSyncStatus } from '../utils/useGoogleSyncStatus';
import { mergeGoogleEvents, pullGoogleEvents } from '../utils/googlePull';
import { loadStoredEvents, saveStoredEvents } from '../utils/eventsStorage';

interface ResolvedEntry {
  title: string;
  category: string;
  time: string;
  durationMin: number;
  place: Event['place'];
  remindMin: number;
  bufferMin: number;
}

// 길선호 팀원의 /api/interpret(Claude 기반 AI 해석)를 우선 쓰고, 배포되지 않은 환경(로컬 네이티브 등)에서
// 호출이 실패하면 자체 정규식 파서로 대체한다. 날짜는 항상 캘린더에서 선택한 날짜를 그대로 쓴다
// (텍스트 속 상대 날짜 표현으로 바뀌면 "날짜 선택 후 입력" 흐름과 어긋나서 의도적으로 덮어쓴다).
async function resolveQuickEntry(text: string): Promise<ResolvedEntry | null> {
  try {
    const interpreted = await interpretEvent({ text, createdFrom: 'text' });
    if(!interpreted.time || interpreted.ambiguousFields.length || interpreted.placeAliasCandidate)throw new Error('날짜·시간·장소를 명확히 입력해 주세요.');
    return {
      title: interpreted.title,
      category: interpreted.category,
      time: interpreted.time!,
      durationMin: interpreted.durationMin ?? 60,
      place: interpreted.place ? { ...interpreted.place, lat: 0, lng: 0 } : null,
      remindMin: interpreted.remindMin ?? 0,
      bufferMin: interpreted.bufferMin ?? 0,
    };
  } catch (err) {
    console.warn('[quick-add] AI 해석 실패, 기본 파서로 대체합니다:', err);
    const parsed = parseQuickEntry(text);
    if (!parsed || (!/오전|오후/.test(text) && Number(parsed.time.slice(0,2))<=12)) return null;
    return {
      title: parsed.title,
      category: 'personal',
      time: parsed.time,
      durationMin: 60,
      place: null,
      remindMin: 0,
      bufferMin: 0,
    };
  }
}

const HOLIDAYS: Record<string, string> = koreanHolidays;
const WEEKDAY_HEADERS = ['일', '월', '화', '수', '목', '금', '토'];

const CATEGORY_LABEL: Record<string, string> = {
  exercise: '운동',
  work: '업무',
  personal: '개인',
  study: '공부',
  health: '건강',
};

const CATEGORY_COLOR: Record<string, string> = {
  exercise: colors.terracotta,
  work: colors.warmGray,
  personal: colors.coral,
  study: colors.lightBeige,
};

function buildSampleEvents(today: string): Event[] {
  return [
    {
      id: 'sample-1',
      userId: 'local',
      title: '팀 데일리 미팅',
      category: 'work',
      startDate: today,
      endDate: today,
      time: '10:00',
      durationMin: 30,
      place: null,
      remindMin: 10,
      bufferMin: 15,
      createdFrom: 'text',
      sharedWith: [],
    },
    {
      id: 'sample-2',
      userId: 'local',
      title: '저녁 러닝',
      category: 'exercise',
      startDate: today,
      endDate: today,
      time: '19:00',
      durationMin: 45,
      place: null,
      remindMin: 30,
      bufferMin: 15,
      createdFrom: 'text',
      sharedWith: [],
    },
    {
      id: 'sample-3',
      userId: 'local',
      title: '친구와 저녁 약속',
      category: 'personal',
      startDate: addDays(today, 1),
      endDate: addDays(today, 1),
      time: '19:30',
      durationMin: 90,
      place: null,
      remindMin: 60,
      bufferMin: 15,
      createdFrom: 'text',
      sharedWith: [],
    },
  ];
}

type ViewMode = 'week' | 'month';

export function CalendarScreen({onCompose}:{onCompose:(text:string)=>void}) {
  const today = useMemo(() => todayISODate(), []);
  const googleStatus = useGoogleSyncStatus();
  const [events, setEvents] = useState<Event[]>(() => loadStoredEvents() ?? []);
  const [selectedDate, setSelectedDate] = useState(today);
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [viewedMonth, setViewedMonth] = useState(() => startOfMonth(today));
  const [isEditingHeaderDate, setIsEditingHeaderDate] = useState(false);
  const [yearInput, setYearInput] = useState('');
  const [monthInput, setMonthInput] = useState('');
  const [inputText, setInputText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  useEffect(() => {
    saveStoredEvents(events);
  }, [events]);

  // 구글 캘린더에서 만들거나 고친 일정을 꾹에도 반영한다. 실시간 push 대신 폴링이라
  // 즉시는 아니고 최대 POLL_INTERVAL_MS 정도 지연될 수 있다.
  useEffect(() => {
    if (!googleStatus.connected) return;
    const POLL_INTERVAL_MS = 60_000;

    let cancelled = false;
    const pull = async () => {
      const drafts = await pullGoogleEvents();
      if (cancelled || drafts.length === 0) return;
      setEvents((prev) => mergeGoogleEvents(prev, drafts));
    };

    pull();
    const timer = setInterval(pull, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [googleStatus.connected]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(today, i)), [today]);
  const monthGrid = useMemo(() => buildMonthGrid(viewedMonth), [viewedMonth]);

  const hasEventsOn = (date: string) =>
    events.some((event) => !event.cancelledAt && event.startDate <= date && event.endDate >= date);

  const holidayName = HOLIDAYS[selectedDate];
  const eventsForDay = events
    .filter((event) => !event.cancelledAt && event.startDate <= selectedDate && event.endDate >= selectedDate)
    .sort((a, b) => a.time.localeCompare(b.time));

  const switchToWeek = () => {
    setViewMode('week');
    setIsEditingHeaderDate(false);
  };
  const switchToMonth = () => {
    setViewMode('month');
    setViewedMonth(startOfMonth(selectedDate));
  };

  const openHeaderDateEditor = () => {
    setViewMode('month');
    setYearInput(viewedMonth.slice(0, 4));
    setMonthInput(String(Number(viewedMonth.slice(5, 7))));
    setIsEditingHeaderDate(true);
  };

  const handleYearInputChange = (text: string) => {
    const digits = text.replace(/[^0-9]/g, '').slice(0, 4);
    setYearInput(digits);
    if (digits.length === 4) {
      const year = Number(digits);
      if (year >= 1970 && year <= 2100) {
        setViewedMonth(`${digits}-${viewedMonth.slice(5, 7)}-01`);
      }
    }
  };

  const handleMonthInputChange = (text: string) => {
    const digits = text.replace(/[^0-9]/g, '').slice(0, 2);
    setMonthInput(digits);
    if (digits.length > 0) {
      const month = Number(digits);
      if (month >= 1 && month <= 12) {
        setViewedMonth(`${viewedMonth.slice(0, 4)}-${String(month).padStart(2, '0')}-01`);
      }
    }
  };

  const resetEntry = () => {
    setInputText('');
    setEditingId(null);
    setErrorMessage(null);
  };

  const runGoogleSync = async (task: () => Promise<string | null | void>) => {
    setPendingSyncCount((count) => count + 1);
    try {
      return await task();
    } finally {
      setPendingSyncCount((count) => count - 1);
    }
  };

  const handleSubmit = async () => {
    if (!editingId) {
      const dated=/오늘|내일|모레|다음.*주|이번.*주|매주|매일|매월|평일|\d{4}-\d{2}-\d{2}/.test(inputText);
      onCompose(dated?inputText:selectedDate+' '+inputText);return;
    }
    const text = inputText.trim();
    if (!text || isSubmitting) return;

    setIsSubmitting(true);
    const resolved = await resolveQuickEntry(text);
    setIsSubmitting(false);

    if (!resolved) {
      setErrorMessage('몇 시인지 알려주세요. 예: 15시 회의');
      return;
    }

    if (editingId) {
      const existing = events.find((event) => event.id === editingId);
      if (!existing) {
        resetEntry();
        return;
      }
      const updated: Event = { ...existing, ...resolved, ruleExceptions:[], startDate: selectedDate, endDate: selectedDate };
      const verdict=check(toSchedule(updated),events.map(toSchedule),loadRules());
      if(!verdict.ok){setErrorMessage(verdict.reasons.map(r=>r.message).join(' '));return;}
      setEvents((prev) => prev.map((event) => (event.id === editingId ? updated : event)));
      if (googleStatus.connected) {
        runGoogleSync(() => syncEventUpdate(updated)).then((googleEventId) => {
          if (googleEventId) applyGoogleEventId(updated.id, googleEventId);
        });
      }
    } else {
      const newEvent: Event = {
        id: generateEventId(),
        userId: 'local',
        startDate: selectedDate,
        endDate: selectedDate,
        createdFrom: 'text',
        sharedWith: [],
        ...resolved,
      };
      setEvents((prev) => [...prev, newEvent]);
      if (googleStatus.connected) {
        runGoogleSync(() => syncEventCreate(newEvent)).then((googleEventId) => {
          if (googleEventId) applyGoogleEventId(newEvent.id, googleEventId);
        });
      }
    }
    resetEntry();
  };

  // 로컬 상태에 방금 만든/수정한 일정이 구글 캘린더에도 반영된 뒤, 반환된 이벤트 id를 매달아둔다
  // (다음 수정/삭제 때 어떤 구글 이벤트를 건드려야 할지 알아야 하므로).
  const applyGoogleEventId = (id: string, googleEventId: string) => {
    setEvents((prev) => prev.map((event) => (event.id === id ? { ...event, googleEventId } : event)));
  };

  const handleEdit = (event: Event) => {
    const [hour, minute] = event.time.split(':');
    const minuteLabel = minute !== '00' ? ` ${Number(minute)}분` : '';
    setInputText(`${Number(hour)}시${minuteLabel} ${event.title}`);
    setSelectedDate(event.startDate);
    setEditingId(event.id);
    setErrorMessage(null);
  };

  const handleDelete = (event: Event) => {
    setEvents((prev) => prev.filter((e) => e.id !== event.id));
    if (editingId === event.id) {
      resetEntry();
    }
    if (googleStatus.connected && event.googleEventId) {
      runGoogleSync(() => syncEventDelete(event)).catch((err) => {
        console.warn('[calendar] 구글 캘린더 삭제 동기화 실패:', err);
      });
    }
  };


  return (
    <View style={styles.page}>
      <View style={styles.header}>
        {isEditingHeaderDate ? (
          <View style={styles.headerDateEditor}>
            <TextInput
              value={yearInput}
              onChangeText={handleYearInputChange}
              keyboardType="number-pad"
              maxLength={4}
              placeholder="연도"
              placeholderTextColor={colors.warmGray}
              style={styles.yearInput}
            />
            <Text style={styles.headerDateEditorUnit}>년</Text>
            <TextInput
              value={monthInput}
              onChangeText={handleMonthInputChange}
              keyboardType="number-pad"
              maxLength={2}
              placeholder="월"
              placeholderTextColor={colors.warmGray}
              style={styles.monthInput}
            />
            <Text style={styles.headerDateEditorUnit}>월</Text>
            <Pressable onPress={() => setIsEditingHeaderDate(false)} style={styles.headerDateDoneButton}>
              <Text style={styles.headerDateDoneButtonText}>완료</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={openHeaderDateEditor}>
            <Text style={styles.monthLabel}>
              {formatMonthLabel(viewMode === 'month' ? viewedMonth : selectedDate)}
            </Text>
          </Pressable>
        )}
        <View style={styles.viewToggle}>
          <Pressable
            onPress={switchToWeek}
            style={[styles.toggleButton, viewMode === 'week' && styles.toggleButtonActive]}
          >
            <Text style={[styles.toggleText, viewMode === 'week' && styles.toggleTextActive]}>주간</Text>
          </Pressable>
          <Pressable
            onPress={switchToMonth}
            style={[styles.toggleButton, viewMode === 'month' && styles.toggleButtonActive]}
          >
            <Text style={[styles.toggleText, viewMode === 'month' && styles.toggleTextActive]}>월간</Text>
          </Pressable>
        </View>
      </View>

      {viewMode === 'week' ? (
        <View style={styles.dayStrip}>
          {weekDays.map((date) => {
            const selected = date === selectedDate;
            const holiday = Boolean(HOLIDAYS[date]);
            const dayContent = (
              <>
                <Text
                  style={[
                    styles.dayWeekday,
                    holiday && !selected && styles.holidayText,
                    selected && styles.dayTextSelected,
                  ]}
                >
                  {formatWeekday(date)}
                </Text>
                <Text
                  style={[
                    styles.dayNumber,
                    holiday && !selected && styles.holidayText,
                    selected && styles.dayTextSelected,
                  ]}
                >
                  {dayOfMonth(date)}
                </Text>
              </>
            );
            return (
              <Pressable key={date} onPress={() => setSelectedDate(date)}>
                {selected ? (
                  <GlossyBox
                    colors={['#d49478', '#b56d52']}
                    shadowColor="#b17644"
                    borderRadius={14}
                    contentStyle={styles.dayButton}
                  >
                    {dayContent}
                  </GlossyBox>
                ) : (
                  <View style={styles.dayButton}>{dayContent}</View>
                )}
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={styles.monthCard}>
          <View style={styles.monthNav}>
            <Pressable onPress={() => setViewedMonth(addMonths(viewedMonth, -1))} style={styles.monthNavButton}>
              <Text style={styles.monthNavText}>‹</Text>
            </Pressable>
            <Pressable onPress={() => setViewedMonth(addMonths(viewedMonth, 1))} style={styles.monthNavButton}>
              <Text style={styles.monthNavText}>›</Text>
            </Pressable>
          </View>

          <View style={styles.weekdayHeaderRow}>
            {WEEKDAY_HEADERS.map((label) => (
              <Text key={label} style={styles.weekdayHeaderText}>
                {label}
              </Text>
            ))}
          </View>

          <View style={styles.monthGrid}>
            {monthGrid.map((date) => {
              const selected = date === selectedDate;
              const holiday = Boolean(HOLIDAYS[date]);
              const inMonth = isSameMonth(date, viewedMonth);
              const cellText = (
                <Text
                  style={[
                    styles.monthCellText,
                    !inMonth && styles.monthCellTextOutside,
                    holiday && inMonth && !selected && styles.holidayText,
                    selected && styles.dayTextSelected,
                  ]}
                >
                  {dayOfMonth(date)}
                </Text>
              );
              return (
                <Pressable key={date} onPress={() => setSelectedDate(date)} style={styles.monthCell}>
                  <View style={[styles.monthCellCircle, selected && styles.monthCellCircleSelected]}>
                    {cellText}
                  </View>
                  {hasEventsOn(date) ? <View style={styles.monthCellDot} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      <View style={styles.quickAddRow}>
        <TextInput
          testID="quick-add-input"
          value={inputText}
          onChangeText={(text) => {
            setInputText(text);
            setErrorMessage(null);
          }}
          onSubmitEditing={handleSubmit}
          placeholder="15시 회의"
          placeholderTextColor={colors.warmGray}
          style={styles.quickAddInput}
          returnKeyType="done"
          editable={!isSubmitting}
        />
        <Pressable
          testID="quick-add-submit"
          onPress={handleSubmit}
          disabled={isSubmitting}
          style={[styles.quickAddButton, isSubmitting && styles.quickAddButtonDisabled]}
        >
          <Text style={styles.quickAddButtonText}>
            {isSubmitting ? '해석 중…' : editingId ? '수정' : '등록'}
          </Text>
        </Pressable>
        {editingId && !isSubmitting ? (
          <Pressable onPress={resetEntry} style={styles.quickAddCancel}>
            <Text style={styles.quickAddCancelText}>취소</Text>
          </Pressable>
        ) : null}
      </View>
      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      {holidayName ? (
        <View style={styles.holidayBanner}>
          <Text style={styles.holidayBannerText}>{holidayName}</Text>
        </View>
      ) : null}

      <FlatList
        data={eventsForDay}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.agendaList}
        ListEmptyComponent={<Text style={styles.emptyText}>등록된 일정이 없어요.</Text>}
        renderItem={({ item }) => (
          <View
            style={[styles.eventCard, { borderLeftColor: CATEGORY_COLOR[item.category] ?? colors.warmGray }]}
          >
            <View style={styles.eventCardBody}>
              <Text style={styles.eventCategory}>{CATEGORY_LABEL[item.category] ?? item.category}</Text>
              <Text style={styles.eventTitle}>{item.title}</Text>
              <Text style={styles.eventTime}>
                {item.time} · {item.durationMin}분
              </Text>
            </View>
            <View style={styles.eventCardActions}>
              <Pressable testID={`delete-${item.id}`} onPress={() => handleDelete(item)} style={styles.deleteButton}>
                <Text style={styles.deleteButtonText}>×</Text>
              </Pressable>
              <View style={styles.secondaryButtonRow}>
                <Pressable
                  testID={`gcal-${item.id}`}
                  onPress={() => Linking.openURL(buildGoogleCalendarLink(item))}
                  style={styles.editButton}
                >
                  <Text style={styles.editButtonText}>구글</Text>
                </Pressable>
                <Pressable testID={`edit-${item.id}`} onPress={() => handleEdit(item)} style={styles.editButton}>
                  <Text style={styles.editButtonText}>수정</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}
      />

      {googleStatus.connected ? (
        <Text style={styles.syncStatusText}>
          {pendingSyncCount > 0 ? '구글 캘린더와 동기화 중…' : '✓ 구글 캘린더와 동기화 완료'}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    width: '100%',
    maxWidth: 480,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 16,
  },
  monthLabel: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textDark,
  },
  headerDateEditor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  yearInput: {
    backgroundColor: colors.lightBeige,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    fontSize: 14,
    fontWeight: '700',
    color: colors.textDark,
    width: 64,
    textAlign: 'center',
  },
  headerDateEditorUnit: {
    fontSize: 14,
    color: colors.textDark,
    marginRight: 2,
  },
  monthInput: {
    backgroundColor: colors.lightBeige,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    fontSize: 14,
    fontWeight: '700',
    color: colors.textDark,
    width: 48,
    textAlign: 'center',
  },
  headerDateDoneButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: colors.terracotta,
  },
  headerDateDoneButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.white,
  },
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: colors.lightBeige,
    borderRadius: 10,
    padding: 3,
  },
  toggleButton: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  toggleButtonActive: {
    backgroundColor: colors.terracotta,
  },
  toggleText: {
    fontSize: 12,
    color: colors.warmGray,
    fontWeight: '600',
  },
  toggleTextActive: {
    color: colors.white,
  },
  dayStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  dayButton: {
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 14,
    minWidth: 40,
  },
  dayWeekday: {
    fontSize: 12,
    color: colors.warmGray,
    marginBottom: 6,
  },
  dayNumber: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textDark,
  },
  dayTextSelected: {
    color: colors.white,
  },
  holidayText: {
    color: colors.terracotta,
  },
  monthCard: {
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  monthNav: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
    marginBottom: 6,
  },
  monthNavButton: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  monthNavText: {
    fontSize: 20,
    color: colors.warmGray,
  },
  weekdayHeaderRow: {
    flexDirection: 'row',
  },
  weekdayHeaderText: {
    flexBasis: '14.28%',
    textAlign: 'center',
    fontSize: 11,
    color: colors.warmGray,
    marginBottom: 4,
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  monthCell: {
    flexBasis: '14.28%',
    alignItems: 'center',
    paddingVertical: 5,
  },
  monthCellCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthCellCircleSelected: {
    backgroundColor: colors.terracotta,
    borderWidth: 2,
    borderColor: '#8a4a36',
  },
  monthCellText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textDark,
  },
  monthCellTextOutside: {
    color: colors.lightBeige,
  },
  monthCellDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.terracotta,
    marginTop: 2,
  },
  quickAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  quickAddInput: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.white,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 14,
    color: colors.textDark,
  },
  quickAddButton: {
    backgroundColor: colors.terracotta,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  quickAddButtonDisabled: {
    opacity: 0.6,
  },
  quickAddButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  quickAddCancel: {
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  quickAddCancelText: {
    color: colors.warmGray,
    fontSize: 13,
  },
  errorText: {
    color: colors.terracotta,
    fontSize: 12,
    marginBottom: 10,
  },
  holidayBanner: {
    backgroundColor: colors.lightBeige,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  holidayBannerText: {
    color: colors.textDark,
    fontSize: 13,
    fontWeight: '600',
  },
  agendaList: {
    paddingBottom: 24,
  },
  eventCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderLeftWidth: 4,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  eventCardBody: {
    flex: 1,
  },
  eventCardActions: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginLeft: 10,
  },
  deleteButton: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonText: {
    color: colors.warmGray,
    fontSize: 16,
    lineHeight: 16,
  },
  secondaryButtonRow: {
    flexDirection: 'row',
    gap: 6,
  },
  editButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: colors.lightBeige,
  },
  editButtonText: {
    color: colors.textDark,
    fontSize: 12,
    fontWeight: '600',
  },
  syncStatusText: {
    fontSize: 12,
    color: colors.warmGray,
    textAlign: 'center',
    paddingVertical: 8,
  },
  eventCategory: {
    fontSize: 11,
    color: colors.warmGray,
    marginBottom: 4,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textDark,
    marginBottom: 4,
  },
  eventTime: {
    fontSize: 12,
    color: colors.warmGray,
  },
  emptyText: {
    textAlign: 'center',
    color: colors.warmGray,
    marginTop: 40,
    fontSize: 14,
  },
});

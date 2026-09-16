import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { GlossyBox } from '../components/GlossyBox';
import { colors } from '../constants/colors';
import koreanHolidays from '../data/koreanHolidays.json';
import type { Event } from '../types/schema';
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

const HOLIDAYS: Record<string, string> = koreanHolidays;
const WEEKDAY_HEADERS = ['일', '월', '화', '수', '목', '금', '토'];

const CATEGORY_LABEL: Record<string, string> = {
  exercise: '운동',
  work: '업무',
  personal: '개인',
  study: '공부',
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

export function CalendarScreen() {
  const today = useMemo(() => todayISODate(), []);
  const [events, setEvents] = useState<Event[]>(() => buildSampleEvents(today));
  const [selectedDate, setSelectedDate] = useState(today);
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [viewedMonth, setViewedMonth] = useState(() => startOfMonth(today));
  const [inputText, setInputText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(today, i)), [today]);
  const monthGrid = useMemo(() => buildMonthGrid(viewedMonth), [viewedMonth]);

  const hasEventsOn = (date: string) =>
    events.some((event) => event.startDate <= date && event.endDate >= date);

  const holidayName = HOLIDAYS[selectedDate];
  const eventsForDay = events
    .filter((event) => event.startDate <= selectedDate && event.endDate >= selectedDate)
    .sort((a, b) => a.time.localeCompare(b.time));

  const switchToWeek = () => setViewMode('week');
  const switchToMonth = () => {
    setViewMode('month');
    setViewedMonth(startOfMonth(selectedDate));
  };

  const resetEntry = () => {
    setInputText('');
    setEditingId(null);
    setErrorMessage(null);
  };

  const handleSubmit = () => {
    const parsed = parseQuickEntry(inputText);
    if (!parsed) {
      setErrorMessage('몇 시인지 알려주세요. 예: 15시 회의');
      return;
    }

    if (editingId) {
      setEvents((prev) =>
        prev.map((event) =>
          event.id === editingId
            ? { ...event, title: parsed.title, time: parsed.time, startDate: selectedDate, endDate: selectedDate }
            : event
        )
      );
    } else {
      const newEvent: Event = {
        id: generateEventId(),
        userId: 'local',
        title: parsed.title,
        category: 'personal',
        startDate: selectedDate,
        endDate: selectedDate,
        time: parsed.time,
        durationMin: 60,
        place: null,
        remindMin: 0,
        bufferMin: 0,
        createdFrom: 'text',
        sharedWith: [],
      };
      setEvents((prev) => [...prev, newEvent]);
    }
    resetEntry();
  };

  const handleEdit = (event: Event) => {
    const [hour, minute] = event.time.split(':');
    const minuteLabel = minute !== '00' ? ` ${Number(minute)}분` : '';
    setInputText(`${Number(hour)}시${minuteLabel} ${event.title}`);
    setSelectedDate(event.startDate);
    setEditingId(event.id);
    setErrorMessage(null);
  };

  const handleDelete = (id: string) => {
    setEvents((prev) => prev.filter((event) => event.id !== id));
    if (editingId === id) {
      resetEntry();
    }
  };

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.monthLabel}>
          {formatMonthLabel(viewMode === 'month' ? viewedMonth : selectedDate)}
        </Text>
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
                  {selected ? (
                    <GlossyBox
                      colors={['#d49478', '#b56d52']}
                      shadowColor="#b17644"
                      borderRadius={14}
                      style={styles.monthCellCircle}
                    >
                      {cellText}
                    </GlossyBox>
                  ) : (
                    <View style={styles.monthCellCircle}>{cellText}</View>
                  )}
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
        />
        <Pressable testID="quick-add-submit" onPress={handleSubmit} style={styles.quickAddButton}>
          <Text style={styles.quickAddButtonText}>{editingId ? '수정' : '등록'}</Text>
        </Pressable>
        {editingId ? (
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
              <Pressable
                testID={`delete-${item.id}`}
                onPress={() => handleDelete(item.id)}
                style={styles.deleteButton}
              >
                <Text style={styles.deleteButtonText}>×</Text>
              </Pressable>
              <Pressable testID={`edit-${item.id}`} onPress={() => handleEdit(item)} style={styles.editButton}>
                <Text style={styles.editButtonText}>수정</Text>
              </Pressable>
            </View>
          </View>
        )}
      />
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

import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { colors } from './constants/colors';
import koreanHolidays from './data/koreanHolidays.json';
import type { Event } from './types/schema';
import { addDays, dayOfMonth, formatMonthLabel, formatWeekday, todayISODate } from './utils/date';

const HOLIDAYS: Record<string, string> = koreanHolidays;

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

export default function App() {
  const today = useMemo(() => todayISODate(), []);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(today, i)), [today]);
  const sampleEvents = useMemo(() => buildSampleEvents(today), [today]);
  const [selectedDate, setSelectedDate] = useState(today);

  const holidayName = HOLIDAYS[selectedDate];
  const eventsForDay = sampleEvents
    .filter((event) => event.startDate <= selectedDate && event.endDate >= selectedDate)
    .sort((a, b) => a.time.localeCompare(b.time));

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="dark" />
        <View style={styles.page}>
        <Text style={styles.monthLabel}>{formatMonthLabel(selectedDate)}</Text>

        <View style={styles.dayStrip}>
          {days.map((date) => {
            const selected = date === selectedDate;
            const holiday = Boolean(HOLIDAYS[date]);
            return (
              <Pressable
                key={date}
                onPress={() => setSelectedDate(date)}
                style={[styles.dayButton, selected && styles.dayButtonSelected]}
              >
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
              </Pressable>
            );
          })}
        </View>

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
              style={[
                styles.eventCard,
                { borderLeftColor: CATEGORY_COLOR[item.category] ?? colors.warmGray },
              ]}
            >
              <Text style={styles.eventCategory}>{CATEGORY_LABEL[item.category] ?? item.category}</Text>
              <Text style={styles.eventTitle}>{item.title}</Text>
              <Text style={styles.eventTime}>
                {item.time} · {item.durationMin}분
              </Text>
            </View>
          )}
        />
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.cream,
    alignItems: 'center',
  },
  page: {
    flex: 1,
    width: '100%',
    maxWidth: 480,
    paddingHorizontal: 20,
  },
  monthLabel: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textDark,
    marginTop: 12,
    marginBottom: 16,
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
  dayButtonSelected: {
    backgroundColor: colors.terracotta,
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
    backgroundColor: colors.white,
    borderLeftWidth: 4,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
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

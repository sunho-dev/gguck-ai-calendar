import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import {check} from '../utils/scheduler';
import {toSchedule,loadRules,categoryKey} from '../utils/scheduleAdapter';
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
import { interpretEvent } from '../utils/interpretEvent';
import { syncEventCreate, syncEventDelete, syncEventUpdate } from '../utils/googleSync';
import { useGoogleSyncStatus } from '../utils/useGoogleSyncStatus';
import { mergeGoogleEvents, pullGoogleEvents } from '../utils/googlePull';
import { loadStoredEvents, saveStoredEvents } from '../utils/eventsStorage';
import { loadShiftColors } from '../utils/shiftColorStore';
import { ShareCalendarModal } from '../components/ShareCalendarModal';
import {findCategoryForText,getCategory} from '../utils/categoryStore';
import {useCategories} from '../utils/useCategories';

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
    const baseCategory=categoryKey(interpreted.category);
    const matchedCategory=findCategoryForText(`${text} ${interpreted.title}`,baseCategory);
    const hasExplicitReminder=/알림|미리\s*알려|\d+\s*(?:분|시간|일)\s*전/.test(text);
    return {
      title: interpreted.title,
      category: matchedCategory.id,
      time: interpreted.time!,
      durationMin: interpreted.durationMin ?? 60,
      place: interpreted.place ? { ...interpreted.place, lat: 0, lng: 0 } : null,
      remindMin: hasExplicitReminder ? (interpreted.remindMin ?? matchedCategory.defaultReminderMin) : matchedCategory.defaultReminderMin,
      bufferMin: interpreted.bufferMin ?? 0,
    };
  } catch (err) {
    console.warn('[quick-add] AI 해석 실패, 기본 파서로 대체합니다:', err);
    const parsed = parseQuickEntry(text);
    if (!parsed || (!/오전|오후/.test(text) && Number(parsed.time.slice(0,2))<=12)) return null;
    const matchedCategory=findCategoryForText(`${text} ${parsed.title}`,'personal');
    return {
      title: parsed.title,
      category: matchedCategory.id,
      time: parsed.time,
      durationMin: 60,
      place: null,
      remindMin: matchedCategory.defaultReminderMin,
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

export function CalendarScreen({onCompose,onCategories=()=>{}}:{onCompose:(text:string)=>void;onCategories?:()=>void}) {
  const today = useMemo(() => todayISODate(), []);
  const googleStatus = useGoogleSyncStatus();
  const userCategories = useCategories();
  const [selectedCategory,setSelectedCategory]=useState<string>('all');
  // 카테고리가 많아지면 캘린더 탭이 아래로 밀려 캘린더의 존재감이 옅어져서, 6개가
  // 넘으면 기본으로 접어두고 펼치기 버튼으로만 전체를 보여준다.
  const CATEGORY_COLLAPSE_THRESHOLD = 6;
  const [categoriesExpanded, setCategoriesExpanded] = useState(false);
  const canCollapseCategories = userCategories.length > CATEGORY_COLLAPSE_THRESHOLD;
  const visibleCategories = canCollapseCategories && !categoriesExpanded ? [] : userCategories;
  const [events, setEvents] = useState<Event[]>(() => loadStoredEvents() ?? []);
  const [shiftColors] = useState(() => loadShiftColors());
  const getEventColor = (event: Event): string =>
    (event.shiftType && shiftColors[event.shiftType]) || getCategory(event.category,userCategories)?.color || CATEGORY_COLOR[event.category] || colors.warmGray;
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
  const [shareModalVisible, setShareModalVisible] = useState(false);

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

  // 하루짜리 일정은 기존처럼 작은 점으로, 여러 날짜에 걸친 일정(예: 3박 여행)은
  // 아래 multiDayLaneOf에서 이어지는 색 막대로 따로 그린다 — 겹쳐서 두 번 표시되지
  // 않도록 여기서는 하루짜리(startDate===endDate)만 대상으로 한다.
  const eventColorsOn = (date: string): string[] => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const event of events) {
      if (event.cancelledAt || event.startDate !== event.endDate || event.startDate > date || event.endDate < date || (selectedCategory!=='all'&&event.category!==selectedCategory)) continue;
      const color = getEventColor(event);
      if (!seen.has(color)) {
        seen.add(color);
        result.push(color);
      }
    }
    return result;
  };

  const MAX_MULTIDAY_LANES = 2;
  // 여러 날짜에 걸친 일정끼리 겹칠 때 같은 일정이 매일 같은 줄(레인)에 그려지도록
  // 미리 배정해둔다 — 이걸 안 하면 날짜마다 다른 줄에 배정되어 막대가 하루씩 위아래로
  // 어긋나 보인다. 구간이 겹치지 않는 일정끼리는 같은 레인을 재사용한다.
  const multiDayLaneOf = useMemo(() => {
    const laneOf = new Map<string, number>();
    if (monthGrid.length === 0) return laneOf;
    const gridStart = monthGrid[0];
    const gridEnd = monthGrid[monthGrid.length - 1];
    const candidates = events
      .filter((e) => !e.cancelledAt && e.startDate !== e.endDate && e.startDate <= gridEnd && e.endDate >= gridStart && (selectedCategory === 'all' || e.category === selectedCategory))
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || b.endDate.localeCompare(a.endDate) || a.id.localeCompare(b.id));
    const laneEnds: string[] = [];
    for (const e of candidates) {
      let lane = laneEnds.findIndex((end) => end < e.startDate);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(e.endDate);
      } else {
        laneEnds[lane] = e.endDate;
      }
      laneOf.set(e.id, lane);
    }
    return laneOf;
  }, [events, monthGrid, selectedCategory]);
  const maxMultiDayLane = multiDayLaneOf.size ? Math.max(...multiDayLaneOf.values()) : -1;
  const multiDayEventsOn = (date: string) =>
    events.filter((e) => !e.cancelledAt && e.startDate !== e.endDate && e.startDate <= date && e.endDate >= date && (selectedCategory === 'all' || e.category === selectedCategory));

  const holidayName = HOLIDAYS[selectedDate];
  const eventsForDay = events
    .filter((event) => !event.cancelledAt && event.startDate <= selectedDate && event.endDate >= selectedDate && (selectedCategory==='all'||event.category===selectedCategory))
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
    const toAssistant = () => {
      const dated=/오늘|내일|모레|다음.*주|이번.*주|매주|매일|매월|평일|\d{4}-\d{2}-\d{2}/.test(inputText);
      onCompose(dated?inputText:selectedDate+' '+inputText);
    };

    const text = inputText.trim();
    if (!text || isSubmitting) return;

    setIsSubmitting(true);
    const resolved = await resolveQuickEntry(text);
    setIsSubmitting(false);

    if (!resolved) {
      // 몇 시인지 등 정보가 불명확해서 확인이 필요한 경우에만 일정비서로 넘긴다.
      if (!editingId) { toAssistant(); return; }
      setErrorMessage('몇 시인지 알려주세요. 예: 15시 회의');
      return;
    }

    if (!editingId) {
      const newEvent: Event = {
        id: generateEventId(),
        userId: 'local',
        startDate: selectedDate,
        endDate: selectedDate,
        createdFrom: 'text',
        sharedWith: [],
        notificationEnabled: true,
        ...resolved,
      };
      const verdict = check(toSchedule(newEvent), events.map(toSchedule), loadRules());
      if (!verdict.ok) {
        // 규칙에 걸리는 등 확인이 필요한 경우도 일정비서의 "꾹이 확인할게요" 흐름으로 넘긴다.
        toAssistant();
        return;
      }
      setEvents((prev) => [...prev, newEvent]);
      if (googleStatus.connected) {
        runGoogleSync(() => syncEventCreate(newEvent)).then((googleEventId) => {
          if (googleEventId) applyGoogleEventId(newEvent.id, googleEventId);
        });
      }
      resetEntry();
      return;
    }

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


  const upcomingCount=(categoryId:string)=>events.filter(e=>!e.cancelledAt&&e.startDate>=today&&(categoryId==='all'||e.category===categoryId)).length;

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.pageContent}
      showsVerticalScrollIndicator
    >
      <View style={styles.calendarHero}>
        <View style={{flex:1,minWidth:0}}><Text style={styles.calendarEyebrow}>MY CALENDAR</Text><Text style={styles.calendarTitle}>내 생활을 한눈에.</Text><Text style={styles.calendarSubtitle}>카테고리를 만들면 꾹이 대화 속 일정을 알아서 분류해요.</Text></View>
        <View style={styles.heroButtonRow}>
          <Pressable onPress={onCategories} style={styles.manageCategoryButton}><Text style={styles.manageCategoryButtonText}>＋ 카테고리</Text></Pressable>
          {canCollapseCategories && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={categoriesExpanded?'카테고리 접기':'카테고리 펼치기'}
              onPress={()=>setCategoriesExpanded(v=>!v)}
              style={styles.categoryToggleButton}
            >
              <Text style={styles.categoryToggleButtonText}>{categoriesExpanded?'▲':'▼'}</Text>
            </Pressable>
          )}
        </View>
      </View>
      <View style={styles.categoryBoard}>
        <Pressable onPress={()=>setSelectedCategory('all')} style={[styles.categoryCard,selectedCategory==='all'&&styles.categoryCardSelected]}><View style={[styles.categoryColorBar,{backgroundColor:'#B9ADA2'}]}/><Text style={styles.categoryName}>전체</Text><Text style={styles.categoryCount}>{upcomingCount('all')}개 예정</Text></Pressable>
        {visibleCategories.map(category=><Pressable key={category.id} onPress={()=>setSelectedCategory(category.id)} style={[styles.categoryCard,{borderTopColor:category.color},selectedCategory===category.id&&styles.categoryCardSelected]}><View style={[styles.categoryColorBar,{backgroundColor:category.color}]}/><Text style={styles.categoryName}>{category.label}</Text><Text style={styles.categoryCount}>{upcomingCount(category.id)}개 예정 · {category.defaultReminderMin===0?'정각 알림':`${category.defaultReminderMin}분 전`}</Text></Pressable>)}
      </View>
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

      {Platform.OS === 'web' && (
        <View style={styles.shareRow}>
          <Pressable style={styles.shareRowButton} onPress={() => setShareModalVisible(true)}>
            <Text style={styles.shareRowButtonText}>근무 공유하기</Text>
          </Pressable>
          <Text style={styles.shareRowCaption}>개인 일정은 제외하고 근무 일정만 표시해서 친구와 공유할 수 있어요.</Text>
        </View>
      )}

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
              const dayColors = eventColorsOn(date);
              const multiDayToday = multiDayEventsOn(date);
              return (
                <Pressable key={date} onPress={() => setSelectedDate(date)} style={styles.monthCell}>
                  <View style={[styles.monthCellCircle, selected && styles.monthCellCircleSelected]}>
                    {cellText}
                  </View>
                  {maxMultiDayLane >= 0 && (
                    <View style={styles.monthCellBars}>
                      {Array.from({ length: Math.min(maxMultiDayLane + 1, MAX_MULTIDAY_LANES) }, (_, lane) => {
                        const event = multiDayToday.find((e) => multiDayLaneOf.get(e.id) === lane);
                        if (!event) return <View key={lane} style={styles.monthCellBarEmpty} />;
                        return (
                          <View
                            key={lane}
                            style={[
                              styles.monthCellBar,
                              { backgroundColor: getEventColor(event) },
                              event.startDate === date && styles.monthCellBarStart,
                              event.endDate === date && styles.monthCellBarEnd,
                            ]}
                          />
                        );
                      })}
                    </View>
                  )}
                  {dayColors.length > 0 && (
                    <View style={styles.monthCellBlocks}>
                      {dayColors.slice(0, 3).map((color, index) => (
                        <View key={index} style={[styles.monthCellBlock, { backgroundColor: color }]} />
                      ))}
                    </View>
                  )}
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
          placeholder="민수랑 토요일 7시 강남 · 카톡 대화를 붙여넣어도 돼요"
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

      <View style={styles.agendaList}>
        {eventsForDay.length===0 ? (
          <Text style={styles.emptyText}>등록된 일정이 없어요.</Text>
        ) : eventsForDay.map(item => (
          <View
            key={item.id}
            style={[styles.eventCard, { borderLeftColor: getEventColor(item) }]}
          >
            <View style={styles.eventCardBody}>
              <View style={styles.eventCategoryRow}><View style={[styles.eventCategoryDot,{backgroundColor:getCategory(item.category,userCategories)?.color||'#B9ADA2'}]}/><Text style={styles.eventCategory}>{getCategory(item.category,userCategories)?.label ?? CATEGORY_LABEL[item.category] ?? item.category}</Text></View>
              <Text style={styles.eventTitle}>{item.title}</Text>
              <Text style={styles.eventTime}>
                {item.time} · {item.durationMin}분
              </Text>
            </View>
            <View style={styles.eventCardActions}>
              <Pressable testID={`delete-${item.id}`} onPress={() => handleDelete(item)} style={styles.deleteButton}>
                <Text style={styles.deleteButtonText}>×</Text>
              </Pressable>
              <View style={styles.notificationToggle}>
                <Text style={styles.notificationToggleText}>{item.notificationEnabled===false?'알림 OFF':'알림 ON'}</Text>
                <Switch
                  testID={`notification-${item.id}`}
                  accessibilityLabel={`${item.title} 개별 알림 ${item.notificationEnabled===false?'켜기':'끄기'}`}
                  value={item.notificationEnabled!==false}
                  onValueChange={notificationEnabled=>setEvents(prev=>prev.map(event=>event.id===item.id?{...event,notificationEnabled}:event))}
                  trackColor={{false:'#D8CEC4',true:'#D79A7F'}}
                  thumbColor="#FFF9F2"
                />
              </View>
              <View style={styles.secondaryButtonRow}>
                <Pressable testID={`edit-${item.id}`} onPress={() => handleEdit(item)} style={styles.editButton}>
                  <Text style={styles.editButtonText}>수정</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ))}
      </View>

      {googleStatus.connected ? (
        <Text style={styles.syncStatusText}>
          {pendingSyncCount > 0 ? '구글 캘린더와 동기화 중…' : '✓ 구글 캘린더와 동기화 완료'}
        </Text>
      ) : null}

      <ShareCalendarModal
        visible={shareModalVisible}
        onClose={() => setShareModalVisible(false)}
        events={events}
        viewedMonth={viewMode === 'month' ? viewedMonth : startOfMonth(selectedDate)}
        shiftColors={shiftColors}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    width: '100%',
    maxWidth: 980,
  },
  pageContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  calendarHero:{flexDirection:'row',alignItems:'flex-end',gap:16,flexWrap:'wrap',marginTop:18,marginBottom:14},
  calendarEyebrow:{fontSize:10,letterSpacing:1.5,color:'#9B6C51',fontWeight:'700'},
  calendarTitle:{fontSize:28,fontWeight:'800',color:colors.textDark,marginTop:5},
  calendarSubtitle:{fontSize:13,color:colors.warmGray,marginTop:5},
  heroButtonRow:{flexDirection:'row',gap:8},
  categoryToggleButton:{backgroundColor:'#EFE2D5',width:34,height:34,borderRadius:12,alignItems:'center',justifyContent:'center'},
  categoryToggleButtonText:{fontSize:12,color:colors.textDark,fontWeight:'700'},
  manageCategoryButton:{backgroundColor:'#EFE2D5',paddingVertical:9,paddingHorizontal:13,borderRadius:12},
  manageCategoryButtonText:{fontSize:12,color:colors.textDark,fontWeight:'700'},
  categoryBoard:{flexDirection:'row',flexWrap:'wrap',gap:9,marginBottom:18},
  categoryCard:{minWidth:118,maxWidth:175,flexGrow:1,backgroundColor:'#FFFAF4',borderWidth:1,borderColor:'#E5D8CB',borderTopWidth:4,borderTopColor:'#D5C7BA',borderRadius:15,paddingVertical:11,paddingHorizontal:12},
  categoryCardSelected:{borderColor:colors.terracotta,backgroundColor:'#F9EDE4'},
  categoryColorBar:{width:42,height:8,borderRadius:4},
  categoryName:{fontSize:13,fontWeight:'700',color:colors.textDark,marginTop:5},
  categoryCount:{fontSize:10,color:colors.warmGray,marginTop:3},
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
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  shareRowCaption: {
    fontSize: 11,
    color: colors.warmGray,
  },
  shareRowButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.lightBeige,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  shareRowButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textDark,
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
    paddingVertical: 10,
    minHeight: 60,
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
  monthCellBlocks: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 2,
    marginTop: 6,
  },
  monthCellBlock: {
    width: 13,
    height: 5,
    borderRadius: 2.5,
  },
  monthCellBars: {
    width: '100%',
    marginTop: 6,
    gap: 3,
  },
  // 셀에 좌우 여백이 없어서(monthCell에 paddingHorizontal 없음) 이 막대가 폭 100%로
  // 옆 날짜 셀과 틈 없이 맞닿는다 — 그 덕에 여러 날짜에 걸친 일정이 하루하루 끊긴
  // 점이 아니라 하나로 이어진 막대처럼 보인다. 진짜 시작/끝나는 날에만 둥글게 마감하고,
  // 중간(또는 주가 바뀌어 다음 줄로 넘어가는 지점)은 각지게 두어 계속된다는 인상을 준다.
  monthCellBar: {
    width: '100%',
    height: 7,
  },
  monthCellBarStart: {
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
  },
  monthCellBarEnd: {
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  monthCellBarEmpty: {
    width: '100%',
    height: 7,
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
  notificationToggle: {
    alignItems: 'center',
    gap: 4,
  },
  notificationToggleText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.warmGray,
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
  eventCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  eventCategoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  eventCategory: {
    fontSize: 11,
    color: colors.warmGray,
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

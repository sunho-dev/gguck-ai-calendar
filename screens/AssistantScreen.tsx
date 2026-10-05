import * as DocumentPicker from 'expo-document-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as XLSX from 'xlsx';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Switch,
  useWindowDimensions,
} from 'react-native';
import { AgendaPreview } from '../components/AgendaPreview';
import { Toast } from '../components/Toast';
import DateTimeField from '../components/DateTimeField';
import { ColorDropdown } from '../components/ColorDropdown';
import { RuleAwareImportReview } from '../components/RuleAwareImportReview';
import {
  Choice,
  RepeatChoices,
  RepeatFields,
  recurrenceFor,
  type RepeatMode,
} from '../components/ScheduleControls';
import { useScheduleStaging } from '../utils/useScheduleStaging';
import { formatFriendlyDateTime } from '../utils/date';
import { colors } from '../constants/colors';
import type { Event } from '../types/schema';
import { interpretEvent, interpretCommand } from '../utils/interpretEvent';
import { getPlaceAliases, savePlaceAlias } from '../utils/placeAliasStore';
import { loadStoredEvents, saveStoredEvents } from '../utils/eventsStorage';
import { getGoogleSyncStatus, syncEventCreate, syncEventDelete } from '../utils/googleSync';
import { categoryKey, loadRules, toEvent, toSchedule } from '../utils/scheduleAdapter';
import {
  applyAlias,
  interpretChat,
  normalizeChat,
  hasCancelIntent,
  findCancellation,
  matchCancellation,
  cancellationTargets,
  check,
  alternatives,
  planSeries,
  categories,
  addDays,
  stamp,
  todayKST,
  matchesRule,
  reminderFor,
  type Schedule,
  type Category,
} from '../utils/scheduler';
import { generateEventId } from '../utils/quickEntry';
import { parseIcsContent, type ImportedEventDraft } from '../utils/icsImport';
import { DEMO_EXCEL_CSV } from '../utils/demoImportData';
import { interpretBulkImage, interpretBulkTable } from '../utils/bulkInterpret';
import { loadMyName, saveMyName } from '../utils/myNameStorage';
import { extractShiftLabel, suggestColorForLabel } from '../utils/shiftClassify';
import { loadShiftColors, saveShiftColors, type ShiftColorMap } from '../utils/shiftColorStore';
import { findCategoryForText, getCategory } from '../utils/categoryStore';
import { useCategories } from '../utils/useCategories';

// 사진 가져오기는 원래 expo-image-picker가 넘겨주는 asset.width/height로 리사이즈
// 방향(가로/세로)을 정했는데, 파일 종류를 가리지 않는 단일 DocumentPicker로 통합하면서
// 그 정보가 없어졌다. 웹에서는 Image 엘리먼트로 실제 픽셀 크기를 직접 읽어와 대체한다.
function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = uri;
  });
}

type Scope = 'one' | 'following' | 'all';
const SHARED_SYNC_MAX_WAIT_MS = 4000;
// 공유 등록 후 "돌아가기"로 앱 창을 닫는 기능은 실기기에서 동작을 확인한 크롬(홈 화면에 설치한 앱 포함)에서만 쓴다.
// 삼성 인터넷은 window.close()가 페이지 내용만 비우고 앱 창은 남겨서 흰 화면이 된다(플립7 확인).
// 그 밖의 브라우저는 검증 전이라 크롬 기반 변종(삼성/엣지/오페라/웨일 등)도 제외한다.
// 지원하지 않는 브라우저에서는 닫기·확인창 없이 평소처럼 등록 완료 알림(토스트)만 보여준다.
const CAN_CLOSE_WINDOW =
  typeof navigator !== 'undefined' &&
  typeof navigator.userAgent === 'string' &&
  /Chrome\//.test(navigator.userAgent) &&
  !/SamsungBrowser|EdgA|OPR\/|Whale|Firefox|DuckDuckGo|UCBrowser|MiuiBrowser|YaBrowser/i.test(
    navigator.userAgent,
  );
const AUTO_CANCEL_NOTICE =
  '취소 요청으로 보여요. 자동으로 취소하지 않았어요. 내용을 확인하고 “요청 보내기”를 눌러 주세요.';
export function AssistantScreen({
  initialText = '',
  autoSubmit = false,
  onAutoSubmitted = () => {},
  onRules = () => {},
  onCalendar = () => {},
}: {
  initialText?: string;
  autoSubmit?: boolean;
  onAutoSubmitted?: () => void;
  onRules?: () => void;
  onCalendar?: () => void;
}) {
  const userCategories = useCategories();
  const [categoryOverride, setCategoryOverride] = useState<string | null>(null);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('none'),
    [selectedDate, setSelectedDate] = useState(todayKST());
  const [failure, setFailure] = useState('');
  const wide = useWindowDimensions().width >= 1100;
  const [text, setText] = useState(initialText),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const [draft, setDraft] = useState<Schedule | null>(null),
    [unknown, setUnknown] = useState<string | null>(null);
  const [name, setName] = useState(''),
    [address, setAddress] = useState(''),
    [category, setCategory] = useState<Category>('personal'),
    [remember, setRemember] = useState(true);
  const [issues, setIssues] = useState<string[]>([]),
    [choices, setChoices] = useState<Schedule[]>([]),
    [skipped, setSkipped] = useState<string[]>([]);
  const [showRepeatExceptions, setShowRepeatExceptions] = useState(false);
  const [cancelChoices, setCancelChoices] = useState<Schedule[]>([]),
    [target, setTarget] = useState<Schedule | null>(null),
    [scope, setScope] = useState<Scope>('one');
  const [selectedCancelIds, setSelectedCancelIds] = useState<Set<string>>(new Set());
  const [importDrafts, setImportDrafts] = useState<ImportedEventDraft[] | null>(null),
    [importSource, setImportSource] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null),
    [isImporting, setIsImporting] = useState(false),
    [myName, setMyName] = useState(() => loadMyName());
  const [shiftColors, setShiftColors] = useState<ShiftColorMap>(() => loadShiftColors());
  const handleShiftColorChange = (label: string, hex: string) => {
    const next = { ...shiftColors, [label]: hex };
    setShiftColors(next);
    saveShiftColors(next);
  };
  // 근무 유형 색상 지정은 데이/이브닝/나이트처럼 몇 가지 라벨이 반복되는 근무표를 위한
  // 기능이라, 제목이 거의 다 서로 다른 일반 개인 일정(예: 평범한 .ics 캘린더)을 가져오면
  // 고유 라벨이 지나치게 많아져서(일정 개수만큼) 오히려 방해가 된다. 이럴 땐 색상 지정
  // UI 자체를 건너뛴다.
  const MAX_SHIFT_LABELS = 8;
  const getShiftLabels = (drafts: ImportedEventDraft[]): string[] =>
    Array.from(new Set(drafts.map((d) => extractShiftLabel(d.title))));
  const isShiftLikeImport = (drafts: ImportedEventDraft[]): boolean => {
    const labels = getShiftLabels(drafts);
    return labels.length > 0 && labels.length <= MAX_SHIFT_LABELS;
  };
  // 새로 가져온 일정들에 등장하는 근무 유형 라벨마다 아직 색이 없으면 기본값을 배정해둔다
  // (드롭다운이 항상 값을 갖고 있어야 하므로, 화면에 보여주기 직전에 한 번 채워준다).
  const ensureShiftColorsFor = (drafts: ImportedEventDraft[]) => {
    if (!isShiftLikeImport(drafts)) return;
    const labels = getShiftLabels(drafts);
    const next = { ...shiftColors };
    let changed = false;
    for (const label of labels) {
      if (!next[label]) {
        next[label] = suggestColorForLabel(label, Object.values(next));
        changed = true;
      }
    }
    if (changed) {
      setShiftColors(next);
      saveShiftColors(next);
    }
  };
  const lock = useRef(false);
  // 공유하기로 시작된 세션: 등록이 (구글 동기화 대기까지) 끝나면 토스트 대신 "돌아가기" 확인창을
  // 띄우고, 사용자가 버튼을 누르면 창을 닫아 공유를 시작한 메신저로 돌아가게 한다.
  // 확인창은 등록 성공 경로에서만 뜬다(실패하면 에러 창이 뜨고 앱은 그대로 남는다).
  const sharedSession = useRef(false),
    [sharedDone, setSharedDone] = useState(false),
    [sharedMessage, setSharedMessage] = useState('');
  const finishShared = () => {
    if (sharedSession.current) setSharedDone(true);
  };
  // 등록 완료 문구를 보여주는 곳: 공유 세션이면 확인창용으로 보관, 아니면 평소처럼 토스트.
  const announce = (message: string) => {
    if (sharedSession.current) {
      setNotice('');
      setSharedMessage(message);
    } else setNotice(message);
  };
  const all = () => loadStoredEvents() || [];
  const handleMyNameChange = (value: string) => {
    setMyName(value);
    saveMyName(value);
  };
  const handleImport = async () => {
    setImportError(null);
    const picked = await DocumentPicker.getDocumentAsync({ type: '*/*' });
    if (picked.canceled) return;
    const asset = picked.assets[0];
    const fileName = asset.name.toLowerCase();
    if (fileName.endsWith('.ics')) {
      try {
        const content = asset.file
          ? await asset.file.text()
          : await (await fetch(asset.uri)).text();
        const drafts = parseIcsContent(content);
        if (drafts.length === 0) {
          setImportError('.ics 파일에서 일정을 찾지 못했어요.');
          return;
        }
        setImportSource('.ics 파일에서 찾은 일정');
        setImportDrafts(drafts);
        ensureShiftColorsFor(drafts);
      } catch (err) {
        console.warn('[ics-import] 실패:', err);
        setImportError('.ics 파일을 읽는 데 실패했어요.');
      }
      return;
    }
    if (fileName.endsWith('.csv') || fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      if (!myName.trim()) {
        setImportError('이름을 정확히 입력해 주세요.');
        return;
      }
      try {
        let csvText: string;
        if (fileName.endsWith('.csv')) {
          csvText = asset.file ? await asset.file.text() : await (await fetch(asset.uri)).text();
        } else {
          const buffer = asset.file
            ? await asset.file.arrayBuffer()
            : await (await fetch(asset.uri)).arrayBuffer();
          const workbook = XLSX.read(buffer, { type: 'array' });
          csvText = XLSX.utils.sheet_to_csv(workbook.Sheets[workbook.SheetNames[0]]);
        }
        setIsImporting(true);
        const drafts = await interpretBulkTable(csvText, myName);
        setIsImporting(false);
        if (drafts.length === 0) {
          setImportError('파일에서 일정을 찾지 못했어요.');
          return;
        }
        setImportSource('엑셀 파일에서 찾은 일정');
        setImportDrafts(drafts);
        ensureShiftColorsFor(drafts);
      } catch (err) {
        setIsImporting(false);
        console.warn('[excel-import] 실패:', err);
        setImportError(err instanceof Error ? err.message : '엑셀 파일을 처리하는 데 실패했어요.');
      }
      return;
    }
    if (/\.(jpe?g|png|heic|heif|webp)$/.test(fileName)) {
      if (!myName.trim()) {
        setImportError('이름을 정확히 입력해 주세요.');
        return;
      }
      if (typeof window !== 'undefined')
        window.alert('방향이 돌아가지 않고 선명하게 찍힌 사진으로 준비해주세요.');
      try {
        setIsImporting(true);
        const { width, height } = await getImageSize(asset.uri);
        const maxDimension = 1600,
          isLandscape = width >= height;
        const resizeAction = isLandscape
          ? { resize: { width: Math.min(width, maxDimension) } }
          : { resize: { height: Math.min(height, maxDimension) } };
        const manipulated = await manipulateAsync(asset.uri, [resizeAction], {
          base64: true,
          compress: 0.7,
          format: SaveFormat.JPEG,
        });
        if (!manipulated.base64) {
          setImportError('이미지를 처리하지 못했어요.');
          setIsImporting(false);
          return;
        }
        const drafts = await interpretBulkImage(manipulated.base64, 'image/jpeg', myName);
        setIsImporting(false);
        if (drafts.length === 0) {
          setImportError('사진에서 일정을 찾지 못했어요.');
          return;
        }
        setImportSource('사진에서 찾은 일정');
        setImportDrafts(drafts);
        ensureShiftColorsFor(drafts);
      } catch (err) {
        setIsImporting(false);
        console.warn('[photo-import] 실패:', err);
        setImportError(err instanceof Error ? err.message : '사진을 처리하는 데 실패했어요.');
      }
      return;
    }
    setImportError('지원하지 않는 파일 형식이에요. .ics, 엑셀, 사진 파일만 가져올 수 있어요.');
  };
  // 심사위원 등이 실제 파일 없이도 바로 눌러볼 수 있는 데모 버튼. 파일 선택 과정만
  // 생략할 뿐, 그 다음(실제 Gemini 호출까지)은 엑셀 가져오기와 동일한 경로를 탄다.
  const handleDemoExcel = async () => {
    setImportError(null);
    if (!myName.trim()) {
      setImportError('이름을 정확히 입력해 주세요.');
      return;
    }
    try {
      setIsImporting(true);
      const drafts = await interpretBulkTable(DEMO_EXCEL_CSV, myName);
      setIsImporting(false);
      if (drafts.length === 0) {
        setImportError('엑셀 샘플에서 일정을 찾지 못했어요.');
        return;
      }
      setImportSource('엑셀 샘플에서 찾은 일정');
      setImportDrafts(drafts);
      ensureShiftColorsFor(drafts);
    } catch (err) {
      setIsImporting(false);
      console.warn('[demo-excel] 실패:', err);
      setImportError(err instanceof Error ? err.message : '엑셀 샘플을 처리하는 데 실패했어요.');
    }
  };
  const handleConfirmImport = async (approved: Event[]) => {
    const shiftLike = importDrafts ? isShiftLikeImport(importDrafts) : false;
    const created: Event[] = approved.map((e) => {
      const shifted = shiftLike ? { ...e, shiftType: extractShiftLabel(e.title) } : e;
      const chosen = findCategoryForText(
        shifted.title,
        categoryKey(shifted.category),
        userCategories,
      );
      return { ...shifted, category: chosen.id, remindMin: chosen.defaultReminderMin };
    });
    saveStoredEvents([...all(), ...created]);
    setImportDrafts(null);
    setNotice(`가져온 일정 ${created.length}개를 등록했어요.`);
    if (created[0]) setSelectedDate(created[0].startDate);

    const status = await getGoogleSyncStatus();
    if (!status.connected) return;
    for (const e of created) {
      const id = await syncEventCreate(e);
      if (id) saveStoredEvents(all().map((x) => (x.id === e.id ? { ...x, googleEventId: id } : x)));
    }
  };
  useScheduleStaging(async ({ text: input }) => {
    if (lock.current || draft || target || cancelChoices.length)
      throw Error('현재 확인 중인 요청을 먼저 마쳐 주세요.');
    if (typeof input !== 'string' || !input.trim() || input.length > 300 || hasCancelIntent(input))
      throw Error('300자 이내의 등록 검토 문장을 입력해 주세요. 취소는 입력창에서 요청해 주세요.');
    const aliases = (await getPlaceAliases()).map((a) => ({
      term: a.alias,
      meaning: a.name,
      location: a.address || a.name,
      category: categoryKey(a.category || 'personal'),
    }));
    const result = interpretChat(input, aliases);
    setText(input);
    setDraft(result.event);
    setCategoryOverride(findCategoryForText(input, result.event.category).id);
    setSelectedDate(result.event.date);
    setIssues([]);
    setSkipped([]);
    setFailure('');
    if (result.unknown) {
      setUnknown(result.unknown);
      setName('');
      setAddress('');
      setCategory(result.event.category);
      setRemember(true);
    }
    return { status: result.unknown ? 'clarification_required' : 'staged', draft: result.event };
  });
  const close = () => {
    if (lock.current) return;
    setDraft(null);
    setCategoryOverride(null);
    setUnknown(null);
    setTarget(null);
    setCancelChoices([]);
    setSelectedCancelIds(new Set());
    setIssues([]);
    setChoices([]);
    setSkipped([]);
    setShowRepeatExceptions(false);
    setFailure('');
  };
  async function guarded(job: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setFailure('');
    try {
      await job();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : '처리하지 못했어요.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  // 구글 캘린더 동기화는 선택 기능이다. 연동이 안 돼 있거나 동기화가 실패해도(sync 함수들은
  // 실패를 예외가 아니라 "연결 안 됨"/null로 돌려준다) 등록과 공유 세션 종료에는 영향이 없다.
  // 공유 세션에서는 진행 중인 요청을 끊지 않으려고 최대 SHARED_SYNC_MAX_WAIT_MS까지만 기다리고,
  // 그보다 느리면 동기화는 백그라운드로 두고 종료 준비를 한다.
  async function syncOptional(created: Event[]) {
    const sync = (async () => {
      const status = await getGoogleSyncStatus();
      if (!status.connected) return;
      for (const e of created) {
        const id = await syncEventCreate(e);
        if (id)
          saveStoredEvents(all().map((x) => (x.id === e.id ? { ...x, googleEventId: id } : x)));
      }
    })();
    if (sharedSession.current) {
      sync.catch(() => {});
      await Promise.race([
        sync,
        new Promise<void>((resolve) => setTimeout(resolve, SHARED_SYNC_MAX_WAIT_MS)),
      ]);
    } else await sync;
    finishShared();
  }
  async function persist(schedules: Schedule[]) {
    const rules = loadRules(),
      seriesId = schedules[0]?.recurrence ? `series-${Date.now()}` : undefined;
    const previous = all().map(toSchedule);
    const warningMessages = new Set<string>();
    for (const s of schedules) {
      check(s, previous, rules).warnings?.forEach((r) => warningMessages.add(r.message));
      previous.push(s);
    }
    const warningText = warningMessages.size ? ' · 참고: ' + [...warningMessages].join(' / ') : '';
    const created = schedules.map((s) => {
      const baseEvent = toEvent({ ...s, seriesId }, rules);
      const chosen = categoryOverride
        ? getCategory(categoryOverride, userCategories)
        : findCategoryForText(`${text} ${s.title}`, s.category, userCategories);
      if (!chosen) return baseEvent;
      const hasExplicitReminder = /알림|미리\s*알려|\d+\s*(?:분|시간|일)\s*전/.test(text);
      return {
        ...baseEvent,
        category: chosen.id,
        remindMin: hasExplicitReminder ? baseEvent.remindMin : chosen.defaultReminderMin,
      };
    });
    saveStoredEvents([...all(), ...created]);
    setSelectedDate(created[0].startDate);
    setDraft(null);
    setCategoryOverride(null);
    setIssues([]);
    setChoices([]);
    setSkipped([]);
    setText('');
    const when = formatFriendlyDateTime(created[0].startDate, created[0].time);
    const countSuffix = created.length > 1 ? ` 외 ${created.length - 1}건` : '';
    const confirmMessage = `${when}에 ${created[0].title}으로 일정이 등록되었습니다${countSuffix}`;
    announce(`${confirmMessage}${warningText}`);
    await syncOptional(created);
  }
  async function proceed(s: Schedule, confirmed = false, skip: string[] = skipped) {
    setChoices([]);
    setIssues([]);
    // gguck (5)와 동일: 시간은 비워둘 수 있다("시간 미정"). 소요 시간은 비워두면 기본 60분으로.
    if (!Number.isFinite(s.duration) || s.duration <= 0) s = { ...s, duration: 60 };
    const hasTime = !!s.time;
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(s.date) ||
      (hasTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time)) ||
      !s.title.trim() ||
      s.duration < 15 ||
      s.duration > 480 ||
      (hasTime &&
        (!Number.isFinite(stamp(s.date, s.time)) ||
          todayKST(new Date(stamp(s.date, s.time))) !== s.date))
    ) {
      setDraft(s);
      setIssues(['날짜·제목과 소요 시간(15~480분)을 확인해 주세요.']);
      return;
    }
    if (s.ambiguous) {
      setDraft(s);
      return;
    }
    const events = all().map(toSchedule),
      rules = loadRules();
    if (s.recurrence) {
      const plan = planSeries(s, events, rules, skip);
      if (!confirmed || plan.error || plan.conflicts.length || !plan.accepted.length) {
        setDraft(s);
        setIssues(
          plan.error
            ? [plan.error]
            : plan.conflicts.length
              ? [
                  `반복 일정 중 ${plan.conflicts.length}개 날짜에 확인이 필요해요. 아래에서 건너뛸 날짜를 선택해 주세요.`,
                ]
              : [],
        );
        return;
      }
      await persist(plan.accepted);
      return;
    }
    const verdict = check(s, events, rules);
    if (!verdict.ok) {
      setDraft(s);
      setIssues(verdict.reasons.map((r) => r.message));
      setChoices(alternatives(s, events, rules));
      return;
    }
    if (
      !confirmed &&
      !rules.auto &&
      !(rules.items || []).some((r) => r.type === 'auto' && matchesRule(s, r))
    ) {
      setDraft(s);
      return;
    }
    await persist([s]);
  }
  async function cancel(t: Schedule, range: Scope) {
    const selected = new Set(cancellationTargets(all().map(toSchedule), t, range).map((e) => e.id));
    const entries = all().filter((e) => selected.has(e.id));
    let done = 0;
    for (const entry of entries) {
      // Do not report a Google deletion as successful if the request failed.
      if (entry.googleEventId) await syncEventDelete(entry);
      saveStoredEvents(
        all().map((e) => (e.id === entry.id ? { ...e, cancelledAt: new Date().toISOString() } : e)),
      );
      done++;
    }
    setNotice(`${done}개 일정 취소 완료`);
    setTarget(null);
    setCancelChoices([]);
    setText('');
    setSelectedDate(t.date);
  }
  // 카테고리·제목이 겹쳐 여러 일정이 후보로 나왔을 때, 사용자가 체크박스로 고른
  // 항목들을 한 번에 취소한다. 이미 정확한 대상 id들을 알고 있으므로(선택 자체가
  // 곧 대상 지정) cancellationTargets의 반복 범위 확장은 쓰지 않고 고른 항목만 지운다.
  async function cancelSelected(items: Schedule[]) {
    const ids = new Set(items.map((i) => i.id));
    const entries = all().filter((e) => ids.has(e.id));
    let done = 0;
    for (const entry of entries) {
      if (entry.googleEventId) await syncEventDelete(entry);
      saveStoredEvents(
        all().map((e) => (e.id === entry.id ? { ...e, cancelledAt: new Date().toISOString() } : e)),
      );
      done++;
    }
    setNotice(`${done}개 일정 취소 완료`);
    setCancelChoices([]);
    setSelectedCancelIds(new Set());
    setText('');
    if (items[0]) setSelectedDate(items[0].date);
  }
  // Schedule/규칙 엔진은 하루짜리 일정만 알아서, 여행처럼 기간이 있는 일정은 그 경로를
  // 안 태우고 Event를 직접 만들어 저장한다(가져오기 일정과 동일한 방식). 규칙 검사는
  // 애초에 기간 일정을 모델링하지 못해 건너뛴다.
  async function persistMultiDayEvent(ai: Awaited<ReturnType<typeof interpretEvent>>) {
    const chosen = findCategoryForText(
      `${text} ${ai.title}`,
      categoryKey(ai.category),
      userCategories,
    );
    const created: Event = {
      id: generateEventId(),
      userId: 'local',
      title: ai.title,
      category: chosen.id,
      startDate: ai.startDate,
      endDate: ai.endDate,
      time: ai.time || '',
      durationMin: ai.durationMin ?? 60,
      place: ai.place ? { ...ai.place, lat: 0, lng: 0 } : null,
      remindMin: chosen.defaultReminderMin,
      bufferMin: ai.bufferMin ?? 0,
      createdFrom: 'text',
      sharedWith: [],
      notificationEnabled: true,
    };
    saveStoredEvents([...all(), created]);
    setSelectedDate(created.startDate);
    setText('');
    const when = formatFriendlyDateTime(created.startDate, created.time);
    const confirmMessage = `${when}부터 ${created.endDate}까지 ${created.title} 일정이 등록되었습니다`;
    announce(confirmMessage);
    await syncOptional([created]);
  }
  // auto=true는 공유하기로 들어온 문장을 사용자가 버튼을 누르기 전에 자동 처리할 때만 쓴다.
  // 등록은 평소와 똑같이 확인이 필요한 경우(모르는 장소·불확실한 시간·규칙 충돌)에 물어보지만,
  // 취소는 확인 없이 바로 실행되는 경로가 있어서 자동 실행에서는 절대 취소하지 않는다
  // (예: 카톡의 "약속 취소됐어" 문장을 공유했다고 기존 일정이 조용히 지워지면 안 된다).
  async function submit(auto = false) {
    await guarded(async () => {
      setNotice('');
      setCategoryOverride(null);
      setSkipped([]);
      setIssues([]);
      setChoices([]);
      if (hasCancelIntent(text)) {
        if (auto) {
          setNotice(AUTO_CANCEL_NOTICE);
          return;
        }
        const r = findCancellation(normalizeChat(text), all().map(toSchedule));
        setScope(r.scope);
        if (!r.matches.length) throw Error('일치하는 일정이 없어요.');
        if (r.matches.length === 1 && !r.matches[0].seriesId) {
          await cancel(r.matches[0], 'one');
          return;
        }
        if (r.matches.length === 1) setTarget(r.matches[0]);
        else {
          setSelectedCancelIds(new Set());
          setCancelChoices(r.matches);
        }
        return;
      }
      const aliases = (await getPlaceAliases()).map((a) => ({
        term: a.alias,
        meaning: a.name,
        location: a.address || a.name,
        category: categoryKey(a.category || 'personal'),
      }));
      let event: Schedule,
        unrecognized: string | null = null,
        needsReview = false;
      try {
        const r = interpretChat(text, aliases);
        event = r.event;
        unrecognized = r.unknown;
        setNotice('기본 문장 규칙으로 해석했어요.');
      } catch (localError) {
        if (/매주|매일|매월|평일|매달|격주|마다/.test(text)) throw localError;
        // 로컬 규칙으로는 등록 문장인지 취소 문장인지조차 판단하지 못했다 — AI에게
        // 의도부터 물어보고, 그 결과에 맞는 해석(등록 또는 취소)만 이어서 진행한다.
        const barePeriod =
          /\d+\s*일\s*동안|\d+\s*박\s*\d+\s*일/.test(text) &&
          !/(오늘|내일|모레|이번\s*주|다음\s*주|\d{4}-\d{2}-\d{2}|\d{1,2}월\s*\d{1,2}일|월요일|화요일|수요일|목요일|금요일|토요일|일요일)/.test(
            text,
          );
        const command = await interpretCommand({
          text: barePeriod ? `${selectedDate}부터 ${text}` : text,
        });
        if (command.intent === 'cancel') {
          if (auto) {
            setNotice(AUTO_CANCEL_NOTICE);
            return;
          }
          if (!command.cancellation) throw Error('취소할 내용을 확인하지 못했어요.');
          const c = command.cancellation;
          const r = matchCancellation(
            {
              query: c.title || '',
              category: c.category ? categoryKey(c.category) : null,
              date: c.date,
              month: c.month,
              times: c.time ? [c.time] : null,
              scope: c.scope,
            },
            all().map(toSchedule),
          );
          setScope(r.scope);
          if (!r.matches.length) throw Error('일치하는 일정이 없어요.');
          if (r.matches.length === 1 && !r.matches[0].seriesId) {
            await cancel(r.matches[0], 'one');
            return;
          }
          if (r.matches.length === 1) setTarget(r.matches[0]);
          else {
            setSelectedCancelIds(new Set());
            setCancelChoices(r.matches);
          }
          return;
        }
        if (!command.event) throw Error('AI가 일정 정보를 해석하지 못했어요.');
        const ai = command.event;
        if (ai.endDate !== ai.startDate) {
          await persistMultiDayEvent(ai);
          return;
        }
        event = {
          title: ai.title,
          date: ai.startDate,
          time: ai.time || '',
          duration: ai.durationMin ?? 60,
          category: categoryKey(ai.category),
          location: ai.place?.name,
          ambiguous: ai.ambiguousFields.includes('time'),
        };
        unrecognized = ai.placeAliasCandidate;
        needsReview = ai.ambiguousFields.some((f) => f !== 'place') || !ai.time;
        setNotice('Gemini로 해석했어요.');
      }
      setCategoryOverride(
        findCategoryForText(`${text} ${event.title}`, event.category, userCategories).id,
      );
      if (!event.recurrence && repeatMode !== 'none')
        event = { ...event, recurrence: recurrenceFor(repeatMode, event.date) };
      setShowRepeatExceptions(false);
      if (/^\d{4}-\d{2}-\d{2}$/.test(event.date)) setSelectedDate(event.date);
      if (unrecognized) {
        setDraft(event);
        setUnknown(unrecognized);
        setName('');
        setAddress('');
        setCategory(event.category);
        setRemember(true);
        return;
      }
      if (needsReview) {
        setDraft(event);
        setIssues(['AI가 불확실하게 해석한 정보가 있어요. 아래 값을 확인해 주세요.']);
        return;
      }
      await proceed(event, false, []);
    });
  }
  // 공유하기로 열린 경우: 입력창에 채워진 문장으로 "일정 등록" 버튼을 한 번만 자동으로 누른다.
  // ref로 막아서 개발 모드의 이펙트 이중 실행이나 재렌더로 두 번 등록되는 일이 없게 한다.
  const autoRan = useRef(false);
  useEffect(() => {
    if (!autoSubmit || autoRan.current) return;
    autoRan.current = true;
    // 창 닫기를 지원하지 않는 브라우저는 공유 세션 전용 동작(확인창·동기화 대기 제한)을 꺼서 평소 등록과 똑같이 처리한다.
    sharedSession.current = CAN_CLOSE_WINDOW;
    onAutoSubmitted();
    if (initialText.trim()) void submit(true);
  }, []);
  // "돌아가기" 버튼: 앱 창을 닫는다. window.close()는 브라우저가 "스크립트로 닫을 수 있는 창"에만
  // 허용해서(공유로 열린 홈 화면 앱은 히스토리가 1개뿐이라 보통 허용) 기기에 따라 무시될 수 있다.
  // 무시돼 앱이 그대로 남아 있으면 확인창만 걷고, 직접 뒤로가기로 돌아가도록 안내한다.
  const closeShared = () => {
    if (typeof window !== 'undefined') window.close();
    setTimeout(() => {
      sharedSession.current = false;
      setSharedDone(false);
      setSharedMessage('');
      setNotice('등록은 끝났어요. 뒤로가기로 돌아가 주세요.');
    }, 400);
  };
  const field = (label: string, value: string, change: (s: string) => void) => (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={styles.input}
        value={value}
        onChangeText={change}
        editable={!busy}
      />
    </View>
  );
  const button = (label: string, onPress: () => void, secondary = false, disabled = false) => (
    <Pressable
      accessibilityRole="button"
      disabled={busy || disabled}
      onPress={onPress}
      style={[styles.button, secondary && styles.secondary, (busy || disabled) && { opacity: 0.5 }]}
    >
      <Text style={{ color: secondary ? colors.textDark : colors.white }}>{label}</Text>
    </Pressable>
  );
  const patch = (p: Partial<Schedule>) => {
    if (draft) {
      setDraft({ ...draft, ruleExceptions: [], ...p });
      setChoices([]);
      setIssues([]);
      setSkipped([]);
      setShowRepeatExceptions(false);
    }
  };
  const recurrencePlan = draft?.recurrence
    ? planSeries(draft, all().map(toSchedule), loadRules(), skipped)
    : null;
  const baseRecurrencePlan = draft?.recurrence
    ? planSeries(draft, all().map(toSchedule), loadRules(), [])
    : null;
  const liveVerdict =
    draft && !draft.recurrence && !draft.ambiguous
      ? check(draft, all().map(toSchedule), loadRules())
      : null;
  const liveChoices =
    draft && liveVerdict && !liveVerdict.ok
      ? alternatives(draft, all().map(toSchedule), loadRules())
      : [];
  const exceptionReasons = recurrencePlan
    ? recurrencePlan.conflicts.flatMap((c) => c.reasons)
    : (liveVerdict?.reasons || []).filter((r) => r.action !== 'warn');
  const canExcept =
    exceptionReasons.length > 0 && exceptionReasons.every((r) => r.overridable && r.ruleId);
  async function acceptExceptions() {
    if (!draft || !canExcept) return;
    await guarded(() =>
      proceed(
        {
          ...draft,
          ruleExceptions: [
            ...new Set([
              ...(draft.ruleExceptions || []),
              ...exceptionReasons.map((r) => r.ruleId!),
            ]),
          ],
        },
        true,
      ),
    );
  }
  return (
    <>
      <Toast message={notice} onDismiss={() => setNotice('')} />
      <ScrollView style={styles.page} contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={styles.heading}>일정은 꾹에게 맡겨요.</Text>
        <Text style={styles.label}>한 줄로 남기면, 시간과 규칙을 함께 살펴볼게요.</Text>
        <View style={[styles.columns, wide && { flexDirection: 'row' }]}>
          <View style={{ flex: wide ? 1.35 : undefined, minWidth: 0 }}>
            <View style={styles.panel}>
              <Text style={styles.sectionTitle}>어떤 일정이 있나요?</Text>
              <TextInput
                accessibilityLabel="일정 문장"
                multiline
                style={[styles.input, { minHeight: 120, fontSize: 19 }]}
                value={text}
                onChangeText={setText}
                placeholder="EX) 내일 오후 8시 집에서 운동, 매주 월수금 오후 8시 운동, 다음주 금요일 8시 종숲 ㄱ, 내일 운동 취소"
                placeholderTextColor="rgba(136,120,110,0.45)"
                editable={!busy}
              />
              {!hasCancelIntent(text) && (
                <>
                  <Text style={styles.label}>반복 방식</Text>
                  <RepeatChoices value={repeatMode} onChange={setRepeatMode} disabled={busy} />
                  <Text style={styles.label}>문장에 적은 반복 조건이 우선해요.</Text>
                </>
              )}
              {button(
                busy ? '처리 중…' : hasCancelIntent(text) ? '요청 보내기' : '일정 등록',
                () => void submit(),
              )}
              <Text style={styles.label}>
                확인이 필요할 때만 물어봐요. 일반 일정은 시간을 확인하고, 여러 날 일정은 시간 없이도
                등록할 수 있어요. 소요 시간 생략 시 60분으로 등록돼요.
              </Text>
            </View>
            {Platform.OS === 'web' && (
              <View style={[styles.panel, styles.importPanel]}>
                <Text style={styles.sectionTitle}>여러 일정 한 번에 가져오기</Text>
                <Text style={styles.label}>
                  .ics 파일, 근무표 엑셀, 근무표 사진에서 일정을 한 번에 뽑아 등록해요.
                </Text>
                {field('표/사진 속 내 이름', myName, handleMyNameChange)}
                {!importDrafts && (
                  <View style={styles.row}>
                    {button('가져오기', () => void handleImport(), true, isImporting)}
                  </View>
                )}
                {!importDrafts && (
                  <Text style={styles.label}>.ics, 엑셀, 사진 파일을 사용할 수 있어요.</Text>
                )}
                {!importDrafts && (
                  <View style={styles.row}>
                    <Choice
                      label="샘플 사용해보기"
                      disabled={isImporting}
                      onPress={() => void handleDemoExcel()}
                    />
                  </View>
                )}
                {!importDrafts && (
                  <Text style={styles.label}>
                    샘플 사용해보기를 할 땐 길선호, 김창민, 황수민 세 이름 중에 하나로 테스트
                    하세요.
                  </Text>
                )}
                {isImporting && (
                  <View style={styles.row}>
                    <ActivityIndicator color={colors.terracotta} />
                    <Text style={styles.label}>AI가 일정을 읽는 중…</Text>
                  </View>
                )}
                {!!importError && <Text style={styles.notice}>{importError}</Text>}
                {importDrafts && isShiftLikeImport(importDrafts) && (
                  <View style={styles.shiftColorPanel}>
                    <Text style={styles.label}>
                      근무 유형별 색을 정해두면 캘린더에서 한눈에 구분돼요.
                    </Text>
                    {getShiftLabels(importDrafts).map((label) => (
                      <View key={label} style={styles.shiftColorRow}>
                        <Text style={styles.shiftColorLabel}>{label}</Text>
                        <ColorDropdown
                          value={
                            shiftColors[label] ??
                            suggestColorForLabel(label, Object.values(shiftColors))
                          }
                          onChange={(hex) => handleShiftColorChange(label, hex)}
                        />
                      </View>
                    ))}
                  </View>
                )}
                {importDrafts && (
                  <RuleAwareImportReview
                    title={importSource ?? '가져온 일정'}
                    drafts={importDrafts}
                    onConfirm={handleConfirmImport}
                    onCancel={() => setImportDrafts(null)}
                  />
                )}
              </View>
            )}
            <View style={[styles.panel, styles.importPanel]}>
              <Text style={styles.sectionTitle}>말 한마디가 일정이 되는 순간.</Text>
              <Text style={styles.label}>
                등록도 취소도 한 문장으로. 일정은 이 브라우저에 저장돼요.
              </Text>
            </View>
          </View>
          <View style={{ flex: wide ? 1 : undefined, minWidth: 0 }}>
            <AgendaPreview
              date={selectedDate}
              onDate={setSelectedDate}
              onRules={onRules}
              onCalendar={onCalendar}
            />
          </View>
        </View>
        <Modal
          visible={!!draft || !!target || cancelChoices.length > 0 || !!failure}
          transparent
          animationType="fade"
          onRequestClose={close}
        >
          <View style={styles.overlay}>
            <ScrollView style={styles.modal} contentContainerStyle={{ padding: 22 }}>
              <Text style={styles.heading}>꾹이 확인할게요</Text>
              {!!unknown && draft ? (
                <>
                  <Text>
                    ‘{unknown}’은 무슨 뜻인가요? 알고 있는 일반 장소의 주소는 묻지 않아요.
                  </Text>
                  {field('뜻 / 장소 이름', name, setName)}
                  {field('주소·지점 설명 (선택)', address, setAddress)}
                  <View style={styles.row}>
                    {Object.entries(categories).map(([key, label]) => (
                      <View key={key}>
                        {button(
                          (category === key ? '✓ ' : '') + label,
                          () => setCategory(key as Category),
                          true,
                        )}
                      </View>
                    ))}
                  </View>
                  <View style={styles.row}>
                    <Switch value={remember} onValueChange={setRemember} disabled={busy} />
                    <Text>이 뜻을 다음부터 기억하기</Text>
                  </View>
                  {button(
                    '이 뜻으로 계속하기',
                    () =>
                      void guarded(async () => {
                        if (!name.trim()) throw Error('뜻이나 장소 이름을 적어 주세요.');
                        const value = {
                          term: unknown,
                          meaning: name.trim(),
                          location: address.trim() || name.trim(),
                          category,
                        };
                        if (remember)
                          await savePlaceAlias({
                            alias: unknown,
                            name: value.meaning,
                            address: address.trim() || null,
                            category,
                          });
                        setUnknown(null);
                        await proceed(applyAlias(draft, value));
                      }),
                  )}
                  {button(
                    '원문 그대로 계속',
                    () => {
                      setUnknown(null);
                      void guarded(() => proceed(draft));
                    },
                    true,
                  )}
                </>
              ) : draft ? (
                <>
                  <Text style={styles.sectionTitle}>
                    {draft.ambiguous
                      ? '오전일까요, 오후일까요?'
                      : draft.recurrence
                        ? '언제까지 함께할까요?'
                        : liveVerdict && !liveVerdict.ok
                          ? '이 일정은 조정이 필요해요.'
                          : '일정 확인'}
                  </Text>
                  <View style={styles.summaryLine}>
                    <View
                      style={[
                        styles.categoryDot,
                        {
                          backgroundColor:
                            (categoryOverride &&
                              getCategory(categoryOverride, userCategories)?.color) ||
                            '#B9ADA2',
                        },
                      ]}
                    />
                    <Text style={styles.label}>
                      {draft.title} · {draft.time || '시간 미정'} · {draft.duration}분 ·{' '}
                      {(categoryOverride && getCategory(categoryOverride, userCategories)?.label) ||
                        categories[draft.category]}{' '}
                      · 알림{' '}
                      {draft.time
                        ? `${(categoryOverride && getCategory(categoryOverride, userCategories)?.defaultReminderMin) ?? reminderFor(draft, loadRules()).minutes}분 전`
                        : '시간 미정이라 알림 없음'}
                    </Text>
                  </View>
                  {field('제목', draft.title, (title) => patch({ title }))}
                  <Text style={styles.label}>{draft.recurrence ? '반복 시작일' : '날짜'}</Text>
                  <DateTimeField
                    label="일정 날짜"
                    kind="date"
                    value={draft.date}
                    onChange={(date) => patch({ date })}
                    disabled={busy}
                  />
                  <Text style={styles.label}>시간 (비워두면 시간 미정으로 등록돼요)</Text>
                  <DateTimeField
                    label="일정 시간"
                    kind="time"
                    value={draft.time}
                    timeAmbiguous={draft.ambiguous}
                    onChange={(time) => patch({ time, ambiguous: false })}
                    disabled={busy}
                  />
                  {draft.ambiguous && Platform.OS !== 'web' && (
                    <View style={styles.row}>
                      {[0, 12].map((n) => (
                        <View key={n}>
                          {button(
                            (n ? '오후' : '오전') + (draft.recurrence ? ' 선택' : '로 등록'),
                            () => {
                              const resolved = {
                                ...draft,
                                time:
                                  String((Number(draft.time.slice(0, 2)) % 12) + n).padStart(
                                    2,
                                    '0',
                                  ) + draft.time.slice(2),
                                ambiguous: false,
                              };
                              if (draft.recurrence) patch(resolved);
                              else void guarded(() => proceed(resolved));
                            },
                            true,
                          )}
                        </View>
                      ))}
                    </View>
                  )}
                  {field('소요 시간 (분)', String(draft.duration), (v) =>
                    patch({ duration: Number(v) }),
                  )}
                  <Text>장소: {draft.location || '없음'} · 기본 소요 시간 60분</Text>
                  <Text style={styles.label}>내 카테고리</Text>
                  <View style={styles.row}>
                    {userCategories.map((c) => (
                      <Pressable
                        key={c.id}
                        onPress={() => {
                          setCategoryOverride(c.id);
                          patch({ category: c.baseCategory as Category });
                        }}
                        style={[
                          styles.categoryChoice,
                          categoryOverride === c.id && styles.categoryChoiceSelected,
                        ]}
                      >
                        <View style={[styles.categoryDot, { backgroundColor: c.color }]} />
                        <Text style={styles.categoryChoiceText}>
                          {categoryOverride === c.id ? '✓ ' : ''}
                          {c.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <RepeatFields draft={draft} onChange={patch} disabled={busy} />
                  {draft.recurrence && (
                    <>
                      <Text style={styles.label}>반복 종료일 (포함) · 최대 1년</Text>
                      <DateTimeField
                        label="반복 종료일"
                        kind="date"
                        value={draft.recurrence.until}
                        onChange={(until) => patch({ recurrence: { ...draft.recurrence!, until } })}
                        disabled={busy}
                      />
                      <Text style={styles.label}>
                        전체 {recurrencePlan?.occurrences.length}회 · 등록 가능{' '}
                        {recurrencePlan?.accepted.length}회 · 확인 필요{' '}
                        {recurrencePlan?.conflicts.length}회 · 건너뛰기 {skipped.length}회
                      </Text>
                      {recurrencePlan?.error && (
                        <Text style={styles.notice}>{recurrencePlan.error}</Text>
                      )}
                      {!!baseRecurrencePlan?.conflicts.length && (
                        <View style={styles.repeatExceptionSummary}>
                          <Text style={styles.label}>
                            충돌하는 날짜 {baseRecurrencePlan.conflicts.length}개 · 건너뛸 날짜{' '}
                            {skipped.length}개
                          </Text>
                          {button(
                            showRepeatExceptions
                              ? '건너뛸 날짜 접기'
                              : `건너뛸 날짜 선택 · ${skipped.length}개`,
                            () => setShowRepeatExceptions((v) => !v),
                            true,
                          )}
                        </View>
                      )}
                      {showRepeatExceptions && !!baseRecurrencePlan?.conflicts.length && (
                        <View style={styles.repeatExceptionList}>
                          {baseRecurrencePlan.conflicts.map((c) => {
                            const selected = skipped.includes(c.event.date);
                            return (
                              <Pressable
                                key={c.event.date}
                                accessibilityRole="checkbox"
                                accessibilityState={{ checked: selected }}
                                onPress={() =>
                                  setSkipped(
                                    selected
                                      ? skipped.filter((d) => d !== c.event.date)
                                      : [...skipped, c.event.date],
                                  )
                                }
                                style={[
                                  styles.repeatExceptionRow,
                                  selected && styles.repeatExceptionRowSelected,
                                ]}
                              >
                                <Text style={styles.repeatExceptionCheck}>
                                  {selected ? '✓' : '○'}
                                </Text>
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.repeatExceptionDate}>{c.event.date}</Text>
                                  <Text style={styles.repeatExceptionReason}>
                                    {c.reasons.map((r) => r.message).join(' ')}
                                  </Text>
                                </View>
                              </Pressable>
                            );
                          })}
                        </View>
                      )}
                    </>
                  )}
                  {issues.map((message, i) => (
                    <Text key={i} style={styles.notice}>
                      {message}
                    </Text>
                  ))}
                  {liveVerdict &&
                    !liveVerdict.ok &&
                    liveVerdict.reasons.map((r, i) => (
                      <Text key={i} style={styles.notice}>
                        {r.message}
                      </Text>
                    ))}
                  {liveChoices.map((c) => (
                    <View key={c.date + c.time}>
                      {button(
                        `${c.date} ${c.time}로 등록`,
                        () => void guarded(() => proceed(c, true)),
                        true,
                      )}
                    </View>
                  ))}
                  {draft &&
                    !draft.recurrence &&
                    liveVerdict &&
                    !liveVerdict.ok &&
                    !liveChoices.length && (
                      <Text style={styles.notice}>
                        앞으로 14일 안에 모든 규칙을 만족하는 시간이 없어요. 규칙을 수정하거나
                        이번만 예외로 등록할 수 있어요.
                      </Text>
                    )}
                  {canExcept &&
                    button(
                      draft.recurrence
                        ? '표시된 반복 회차의 규칙 위반을 허용하고 등록'
                        : '이번만 예외로 등록',
                      () => void acceptExceptions(),
                      true,
                      !!draft.ambiguous,
                    )}
                  {button(
                    draft.recurrence
                      ? `${recurrencePlan?.accepted.length || 0}회 반복 일정 등록`
                      : '확인하고 등록',
                    () => void guarded(() => proceed(draft, true)),
                    false,
                    !!draft.ambiguous ||
                      !draft.title.trim() ||
                      !!(
                        recurrencePlan &&
                        (recurrencePlan.error ||
                          recurrencePlan.conflicts.length ||
                          !recurrencePlan.accepted.length)
                      ) ||
                      !!(liveVerdict && !liveVerdict.ok),
                  )}
                </>
              ) : target ? (
                <>
                  <Text>
                    {target.title} · {target.date} {target.time}
                  </Text>
                  <Text>어느 범위를 취소할까요?</Text>
                  {(['one', 'following', 'all'] as Scope[]).map((s, i) => (
                    <View key={s}>
                      {button(
                        (scope === s ? '✓ ' : '') + ['이번만', '선택 회차 및 이후', '전체 반복'][i],
                        () => setScope(s),
                        true,
                      )}
                    </View>
                  ))}
                  {button(
                    `${cancellationTargets(all().map(toSchedule), target, scope).length}개 취소 확인`,
                    () => void guarded(() => cancel(target, scope)),
                  )}
                </>
              ) : cancelChoices.length ? (
                <>
                  <Text style={styles.label}>
                    취소할 일정을 선택하세요 ({selectedCancelIds.size}/{cancelChoices.length}개
                    선택)
                  </Text>
                  {cancelChoices.map((c) => {
                    const checked = !!c.id && selectedCancelIds.has(c.id);
                    return (
                      <Pressable
                        key={c.id}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked }}
                        onPress={() => {
                          if (!c.id) return;
                          setSelectedCancelIds((prev) => {
                            const next = new Set(prev);
                            next.has(c.id!) ? next.delete(c.id!) : next.add(c.id!);
                            return next;
                          });
                        }}
                        style={[
                          styles.categoryChoice,
                          styles.cancelChoiceRow,
                          checked && styles.categoryChoiceSelected,
                        ]}
                      >
                        <Text style={styles.categoryChoiceText}>
                          {checked ? '✓ ' : '☐ '}
                          {c.date} {c.time || '시간 미정'} · {c.title}
                        </Text>
                      </Pressable>
                    );
                  })}
                  <View style={styles.row}>
                    {button(
                      selectedCancelIds.size === cancelChoices.length ? '전체 해제' : '전체 선택',
                      () =>
                        setSelectedCancelIds(
                          selectedCancelIds.size === cancelChoices.length
                            ? new Set()
                            : new Set(
                                cancelChoices.map((c) => c.id).filter((id): id is string => !!id),
                              ),
                        ),
                      true,
                    )}
                  </View>
                  {button(
                    `선택한 ${selectedCancelIds.size}개 취소`,
                    () =>
                      void guarded(() =>
                        cancelSelected(
                          cancelChoices.filter((c) => !!c.id && selectedCancelIds.has(c.id)),
                        ),
                      ),
                    false,
                    !selectedCancelIds.size,
                  )}
                </>
              ) : null}
              {button('닫기', close, true)}
              {!!failure && (
                <Text accessibilityRole="alert" style={styles.notice}>
                  {failure}
                </Text>
              )}
            </ScrollView>
          </View>
        </Modal>
        <Modal
          visible={sharedDone && !!sharedMessage}
          transparent
          animationType="fade"
          onRequestClose={closeShared}
        >
          <View style={styles.overlay}>
            <View style={[styles.modal, { padding: 22 }]}>
              <Text
                style={{ fontSize: 17, color: colors.textDark, lineHeight: 26, marginBottom: 12 }}
              >
                {sharedMessage}
              </Text>
              {button('돌아가기', closeShared)}
            </View>
          </View>
        </Modal>
      </ScrollView>
    </>
  );
}
const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: 1400, padding: 24 },
  columns: { gap: 24 },
  panel: {
    padding: 24,
    backgroundColor: '#FFFAF4',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5D8CB',
  },
  importPanel: { marginTop: 18 },
  shiftColorPanel: {
    backgroundColor: '#F6EEE4',
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    marginBottom: 10,
    gap: 8,
  },
  shiftColorRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  shiftColorLabel: { fontSize: 13, fontWeight: '600', color: colors.textDark },
  sectionTitle: { fontSize: 17, fontWeight: '600', color: colors.textDark, marginVertical: 10 },
  summaryLine: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  categoryDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  categoryChoice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: colors.lightBeige,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  categoryChoiceSelected: { borderColor: colors.terracotta, backgroundColor: '#F7E8DF' },
  cancelChoiceRow: { marginBottom: 8 },
  categoryChoiceText: { fontSize: 13, color: colors.textDark, fontWeight: '600' },
  heading: { fontSize: 30, fontWeight: '700', color: colors.textDark, marginBottom: 12 },
  label: { fontSize: 13, color: colors.warmGray, marginVertical: 8, lineHeight: 21 },
  input: {
    backgroundColor: '#F6EEE4',
    padding: 14,
    borderRadius: 12,
    color: colors.textDark,
    marginBottom: 8,
  },
  button: {
    backgroundColor: colors.terracotta,
    padding: 12,
    borderRadius: 10,
    marginVertical: 5,
    alignItems: 'center',
  },
  secondary: { backgroundColor: colors.lightBeige },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  notice: { color: colors.terracotta, marginVertical: 12, lineHeight: 22 },
  attentionBox: {
    borderWidth: 2,
    borderColor: '#D76B4F',
    borderRadius: 12,
    padding: 4,
    backgroundColor: '#FFF3EC',
  },
  repeatExceptionSummary: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#F8F1E8',
  },
  repeatExceptionList: { marginTop: 8, gap: 8 },
  repeatExceptionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E4D3C2',
    borderRadius: 12,
    backgroundColor: '#FFFCF8',
  },
  repeatExceptionRowSelected: { borderColor: colors.terracotta, backgroundColor: '#F7E8DF' },
  repeatExceptionCheck: { fontSize: 18, color: colors.terracotta, lineHeight: 22 },
  repeatExceptionDate: { fontSize: 14, fontWeight: '700', color: colors.textDark },
  repeatExceptionReason: { fontSize: 12, color: colors.warmGray, lineHeight: 18, marginTop: 3 },
  overlay: {
    flex: 1,
    backgroundColor: '#0006',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: colors.cream,
    borderRadius: 20,
    width: '100%',
    maxWidth: 560,
    maxHeight: '90%',
  },
});

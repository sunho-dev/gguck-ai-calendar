import { todayKST, addDays, stamp, clock } from './engine.js';
// "취소"뿐 아니라 "삭제"·"제거"도 같은 뜻으로 쓰는 사용자가 많고, 세 단어 모두
// "~해줘/~해주세요/~해/~할래" 형태로 똑같이 활용되므로 하나의 어간군으로 묶는다.
const CANCEL_WORD = '(?:취소|삭제|제거)';
export const hasCancelIntent = (text) => new RegExp(CANCEL_WORD).test(text);
function categoryFromQuery(text) {
  if (/운동|클라이밍|헬스|러닝|산책|요가|수영/.test(text)) return 'exercise';
  if (/업무|회의|미팅|출근/.test(text)) return 'work';
  if (/공부|학습|수업|스터디/.test(text)) return 'study';
  if (/병원|건강|진료|치과/.test(text)) return 'health';
  if (/개인|약속/.test(text)) return 'personal';
  return null;
}
const KNOWN_CATEGORY_WORD =
  /^(운동|헬스|클라이밍|러닝|산책|요가|수영|업무|회의|미팅|출근|공부|학습|수업|스터디|병원|건강|진료|치과|개인|약속)$/;
// 텍스트 파싱과 실제 일정 매칭을 분리해서, 로컬 규칙 파서뿐 아니라 AI가 뽑아준
// 구조화된 취소 정보(제목/카테고리/날짜/달/시간/범위)로도 같은 매칭 로직을 재사용한다.
export function matchCancellation(
  { query = '', category = null, date = null, month = null, times = null, scope = 'one' } = {},
  events,
  now = new Date(),
) {
  const q = (query || '').trim().replace(/\s+/g, '').toLowerCase();
  // "카테고리"라는 말 없이 "운동 취소"처럼 흔한 카테고리 단어 하나만 딱 입력한
  // 경우엔, 시간 없이 등록한 일정이 AI 해석을 거치며 제목이 "운동"이라는 글자
  // 그대로 남지 않을 수 있어(예: 다르게 요약됨) 제목만으로 못 찾을 수 있다.
  // 이럴 때는 카테고리가 일치해도 후보로 잡히게 한다(제목 일치와 OR로 결합).
  const impliedCategory = !category && KNOWN_CATEGORY_WORD.test(q) ? categoryFromQuery(q) : null;
  const matches = events
    .filter((e) => {
      if (e.cancelledAt) return false;
      if (date) {
        if (e.date !== date) return false;
      } else if (month) {
        if (!e.date.startsWith(month)) return false;
      }
      // 명시적으로 날짜/달을 지정하지 않았을 때는 이미 지난 일정은 제외한다.
      // 시간 미정 일정은 비교할 시각이 없으므로 날짜만으로 지난 일정인지 판단한다.
      else if (e.time ? stamp(e.date, e.time) < +now : e.date < todayKST(now)) return false;
      if (times && !times.includes(e.time)) return false;
      if (category && e.category !== category) return false;
      if (q) {
        const textMatch = [e.title, e.aliasTerm || '', e.location || ''].some((v) =>
          v.replace(/\s+/g, '').toLowerCase().includes(q),
        );
        if (!textMatch && !(impliedCategory && e.category === impliedCategory)) return false;
      }
      return true;
    })
    .sort((a, b) => stamp(a.date, a.time || '00:00') - stamp(b.date, b.time || '00:00'));
  return { matches, scope, query: q, date, month, times, category };
}
// "9월 운동 카테고리 취소해줘"처럼 "카테고리"라는 말이 명시적으로 있을 때만
// 카테고리 단위 일괄 취소로 해석한다. 그냥 "운동 취소"는 제목이 "운동"인
// 특정 일정을 가리키는 경우가 훨씬 많아서, 명시적 신호 없이 카테고리 전체를
// 지우면 사용자가 의도하지 않은 대량 취소가 일어날 수 있기 때문.
export function parseCancelText(text, now = new Date()) {
  const suffix = new RegExp(
    CANCEL_WORD + '(?:\\s*(?:해\\s*줘|해\\s*주세요|해|할래|해주세요|해줘))?[.!。]?\\s*$',
  );
  const negated = new RegExp(
    CANCEL_WORD + '\\s*(?:하지|안|말|하지마)|' + CANCEL_WORD + '.*(?:말아|아니)',
  );
  if (!suffix.test(text) || negated.test(text))
    throw Error(
      '취소 요청을 확인하지 못했어요. “내일 운동 취소”처럼 입력해 주세요. 아무 일정도 바꾸지 않았어요.',
    );
  let q = text.trim().replace(suffix, '').trim();
  const scope = /전체|전부|모두/.test(q) ? 'all' : /이후|앞으로/.test(q) ? 'following' : 'one';
  q = q.replace(/전체|전부|모두|이후|앞으로|반복|이번만|이번/g, '');
  let category = null;
  if (/카테고리/.test(q)) {
    category = categoryFromQuery(q);
    if (!category)
      throw Error(
        '어떤 카테고리인지 확인하지 못했어요. 예: “운동 카테고리 취소해줘”처럼 입력해 주세요.',
      );
    q = q
      .replace(
        /운동|클라이밍|헬스|러닝|산책|요가|수영|업무|회의|미팅|출근|공부|학습|수업|스터디|병원|건강|진료|치과|개인|약속/g,
        '',
      )
      .replace(/카테고리/g, '');
  }
  let date = null,
    monthPrefix = null;
  const dateTokens = q.match(/\d{4}-\d{2}-\d{2}|오늘|내일|모레/g) || [];
  if (dateTokens.length > 1) throw Error('취소할 날짜는 하나만 입력해 주세요.');
  if (dateTokens.length) {
    const t = dateTokens[0];
    date =
      t === '오늘'
        ? todayKST(now)
        : t === '내일'
          ? addDays(todayKST(now), 1)
          : t === '모레'
            ? addDays(todayKST(now), 2)
            : t;
    const ms = stamp(date, '12:00');
    if (!Number.isFinite(ms) || todayKST(new Date(ms)) !== date)
      throw Error('취소할 날짜를 확인해 주세요.');
    q = q.replace(t, '');
  } else {
    // "9월"처럼 달만 지정한 경우 해당 달 전체를 범위로 잡는다. 이미 지난 달이면
    // 올해가 아니라 내년으로 해석해서 "다가올 9월"을 가리키도록 한다.
    const mm = q.match(/(\d{1,2})월(?!\s*\d{1,2}\s*일)/);
    if (mm) {
      const month = +mm[1];
      if (month < 1 || month > 12) throw Error('취소할 달을 확인해 주세요.');
      const base = todayKST(now);
      const curYear = +base.slice(0, 4),
        curMonth = +base.slice(5, 7);
      const year = month >= curMonth ? curYear : curYear + 1;
      monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
      q = q.replace(mm[0], '');
    }
  }
  const tm = q.match(
    /(?:(오전|오후|아침|저녁|밤)\s*)?(\d{1,2})(?:시(?!간)(?:\s*(\d{1,2})분|\s*(반))?|:(\d{2}))/,
  );
  let times = null;
  if (tm) {
    const h = +tm[2],
      m = +(tm[3] || tm[5] || (tm[4] ? 30 : 0));
    if (h > 23 || m > 59 || (tm[1] && (h < 1 || h > 12)))
      throw Error('취소할 시간을 확인해 주세요.');
    times = tm[1]
      ? [clock(((h % 12) + (/오후|저녁|밤/.test(tm[1]) ? 12 : 0)) * 60 + m)]
      : h >= 1 && h <= 12
        ? [clock((h % 12) * 60 + m), clock(((h % 12) + 12) * 60 + m)]
        : [clock(h * 60 + m)];
    q = q.replace(tm[0], '');
  }
  q = q
    .replace(/일정(?:을|은|만)?/g, '')
    .trim()
    .replace(/(?:을|를)\s*$/, '')
    .replace(/\s+/g, '')
    .toLowerCase();
  if (!q && !date && !monthPrefix && !times && !category)
    throw Error('무엇을 취소할까요? “내일 운동 취소”처럼 날짜나 일정 이름을 함께 적어 주세요.');
  return { query: q, category, date, month: monthPrefix, times, scope };
}
export function findCancellation(text, events, now = new Date()) {
  return matchCancellation(parseCancelText(text, now), events, now);
}

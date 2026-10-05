const day = (d) => new Date(d + 'T12:00:00+09:00').getUTCDay();
const dateNumber = (d) => Date.parse(d + 'T00:00:00+09:00') / 86400000;
const start = (e) => Date.parse(e.date + 'T' + e.time + ':00+09:00');
export const ruleTypes = ['rest', 'weeklyLimit', 'timeBlock', 'weekdayBlock', 'reminder', 'auto'];
export const actionLabels = { warn: '알려만 주기', confirm: '확인 후 등록', suggest: '대안 제안' };
export const PERIOD_RULE_MESSAGE =
  '기간이 정해진 규칙은 아직 지원하지 않아요. 매주 반복하거나 계속 적용할 규칙을 입력해 주세요. 예: 클라이밍 주 3회 이하';
export function assertPermanentRule(text) {
  // Inspect the condition, not quoted reminder payloads such as "내일 병원".
  const s = String(text)
    .split(/(?:준비물|메시지)\s*[:：]/)[0]
    .replace(/\s+/g, '');
  const duration =
    /(?:\d+(?:일|주일?|개월|달|년)|일주일|한주|두주|세주|한달|두달|하루|이틀|사흘)(?:간|동안|만)/;
  const anchored =
    /(?:이번|다음|금|금번)(?:주|달|월)|오늘|내일|모레|당분간|잠시|임시|\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d+월\d+일|\d+일까지|[월화수목금토일]요일(?:까지|부터)/;
  if (duration.test(s) || anchored.test(s))
    throw Object.assign(Error(PERIOD_RULE_MESSAGE), { code: 'PERIOD_RULE_UNSUPPORTED' });
}
export function validateRule(input) {
  const r = JSON.parse(JSON.stringify(input));
  if (
    !r ||
    !ruleTypes.includes(r.type) ||
    !['warn', 'confirm', 'suggest'].includes(r.action) ||
    typeof r.text !== 'string' ||
    r.text.length > 300
  )
    throw Error('규칙 종류와 동작을 확인해 주세요.');
  if (!['all', 'exercise', 'work', 'study', 'personal', 'health'].includes(r.category))
    throw Error('카테고리를 확인해 주세요.');
  if (typeof r.keyword !== 'string' || r.keyword.length > 50)
    throw Error('대상 표현은 50자 이내로 적어 주세요.');
  assertPermanentRule(r.text);
  const p = r.params || {},
    integer = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
  if (r.type === 'rest' && !integer(p.days, 1, 7)) throw Error('휴식은 1~7일로 설정해 주세요.');
  if (r.type === 'weeklyLimit' && !integer(p.count, 1, 30))
    throw Error('주간 횟수는 1~30회로 설정해 주세요.');
  if (
    r.type === 'timeBlock' &&
    (!integer(p.from, 0, 1439) || !integer(p.to, 0, 1439) || p.from === p.to)
  )
    throw Error('제한 시간 범위를 확인해 주세요.');
  if (
    p.weekdays &&
    (!Array.isArray(p.weekdays) || !p.weekdays.length || p.weekdays.some((d) => !integer(d, 0, 6)))
  )
    throw Error('적용 요일을 확인해 주세요.');
  if (
    r.type === 'weekdayBlock' &&
    (!Array.isArray(p.days) || !p.days.length || p.days.some((d) => !integer(d, 0, 6)))
  )
    throw Error('요일을 확인해 주세요.');
  if (
    r.type === 'reminder' &&
    (!integer(p.minutes, 0, 10080) || typeof p.message !== 'string' || p.message.length > 200)
  )
    throw Error('알림 시간과 문구를 확인해 주세요.');
  return {
    ...r,
    id:
      typeof r.id === 'string'
        ? r.id
        : 'rule-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    enabled: r.enabled !== false,
    params: p,
  };
}
export function matchesRule(e, r) {
  return (
    r.enabled !== false &&
    (r.category === 'all' || e.category === r.category) &&
    (!r.keyword ||
      [e.title, e.aliasTerm, e.aliasMeaning, e.location]
        .filter(Boolean)
        .join(' ')
        .includes(r.keyword))
  );
}
export function describeRule(r) {
  const target =
      r.keyword ||
      {
        all: '모든 일정',
        exercise: '운동',
        work: '업무',
        study: '공부',
        personal: '개인',
        health: '건강',
      }[r.category],
    p = r.params;
  const time = (n) =>
    String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
  return (
    target +
    ' · ' +
    {
      rest: `사이에 ${p.days}일 쉬기`,
      weeklyLimit: `월~일 주 ${p.count}회 이하`,
      timeBlock: `${p.weekdays ? p.weekdays.map((d) => '일월화수목금토'[d]).join('·') + '요일 ' : ''}${time(p.from || 0)}~${time(p.to || 0)} 피하기`,
      weekdayBlock: `${(Array.isArray(p.days) ? p.days : []).map((d) => '일월화수목금토'[d]).join('·')}요일 피하기`,
      reminder: `${p.minutes}분 전 알림${p.message ? ' · ' + p.message : ''}`,
      auto: '명확한 일정은 바로 등록',
    }[r.type]
  );
}
export function policyReasons(e, events, items = []) {
  const result = [];
  for (const raw of items) {
    let r;
    try {
      r = validateRule(raw);
    } catch {
      continue;
    }
    if (!matchesRule(e, r) || ['auto', 'reminder'].includes(r.type)) continue;
    const others = events.filter(
      (x) => !x.cancelledAt && (!e.id || x.id !== e.id) && matchesRule(x, r),
    );
    let hit = false;
    if (r.type === 'rest')
      hit = others.some((x) => {
        const endDay = (y) =>
          dateNumber(
            new Date(start(y) + y.duration * 60000 - 1).toLocaleDateString('en-CA', {
              timeZone: 'Asia/Seoul',
            }),
          );
        return (
          dateNumber(e.date) <= endDay(x) + r.params.days &&
          dateNumber(x.date) <= endDay(e) + r.params.days
        );
      });
    if (r.type === 'weeklyLimit') {
      const monday = dateNumber(e.date) - ((day(e.date) + 6) % 7);
      hit =
        others.filter((x) => dateNumber(x.date) >= monday && dateNumber(x.date) < monday + 7)
          .length >= r.params.count;
    }
    if (r.type === 'timeBlock' || r.type === 'weekdayBlock')
      for (let t = start(e); t < start(e) + Math.min(e.duration, 10080) * 60000; t += 60000) {
        const d = new Date(t + 9 * 3600000),
          minute = d.getUTCHours() * 60 + d.getUTCMinutes();
        if (
          r.type === 'timeBlock' &&
          r.params.weekdays &&
          !r.params.weekdays.includes(d.getUTCDay())
        )
          continue;
        if (
          r.type === 'weekdayBlock'
            ? r.params.days.includes(d.getUTCDay())
            : r.params.from < r.params.to
              ? minute >= r.params.from && minute < r.params.to
              : minute >= r.params.from || minute < r.params.to
        ) {
          hit = true;
          break;
        }
      }
    if (hit)
      result.push({
        type: r.type,
        ruleId: r.id,
        action: r.action,
        message: describeRule(r),
        overridable: true,
      });
  }
  return result;
}
export function reminderFor(e, rules) {
  const r = (rules.items || []).filter((r) => r.type === 'reminder' && matchesRule(e, r)).at(-1);
  return {
    minutes: r ? r.params.minutes : rules.reminders[e.category],
    message: r?.params.message || '',
  };
}
export function parseRule(text) {
  assertPermanentRule(text);
  const s = text.trim();
  if (!s || s.length > 300) throw Error('규칙은 1~300자로 적어 주세요.');
  if (/하지\s*마|않아도|아니|또는|거나/.test(s))
    throw Error('조건을 하나씩 적어 주세요. 예: 운동 다음 날은 쉬기');
  const action = /알려|경고/.test(s) ? 'warn' : /확인|물어/.test(s) ? 'confirm' : 'suggest';
  const category = /운동|클라이밍|헬스|러닝/.test(s)
    ? 'exercise'
    : /업무|회의|미팅/.test(s)
      ? 'work'
      : /공부|스터디/.test(s)
        ? 'study'
        : /병원|진료|건강/.test(s)
          ? 'health'
          : /약속|개인/.test(s)
            ? 'personal'
            : 'all';
  const keyword =
    s.match(/[“"‘']([^”"’']+)[”"’']/)?.[1] ||
    (/클라이밍/.test(s) ? '클라이밍' : /스터디/.test(s) ? '스터디' : '');
  let type, params;
  const alarm = s.match(/(\d+)\s*(분|시간)\s*전/),
    limit = s.match(/(?:매주|일주일|주)\s*(?:최대\s*)?(\d+)\s*(?:회|번)/);
  if (alarm && /알림|알려|챙|준비/.test(s)) {
    type = 'reminder';
    params = {
      minutes: +alarm[1] * (alarm[2] === '시간' ? 60 : 1),
      message: s.match(/(?:준비물|메시지)\s*[:：]\s*(.+)$/)?.[1] || '',
    };
  } else if (/바로\s*등록|자동\s*등록/.test(s)) {
    type = 'auto';
    params = {};
  } else if (/다음\s*날|연속|하루\s*쉬|\d+일\s*쉬/.test(s)) {
    type = 'rest';
    params = { days: +(s.match(/(\d+)일\s*쉬/)?.[1] || 1) };
  } else if (limit && /이하|최대|넘|까지만/.test(s)) {
    type = 'weeklyLimit';
    params = { count: +limit[1] };
  } else if (/시/.test(s)) {
    const tm = s.match(
      /(오전|오후|밤|저녁)?\s*(\d{1,2})시(?:\s*(\d{1,2})분)?\s*(이후|부터|이전|전)/,
    );
    if (!tm) throw Error('제한 시각을 적어 주세요. 예: 업무 오후 10시 이후는 알려줘');
    let hour = +tm[2];
    if (hour > 23 || +(tm[3] || 0) > 59) throw Error('올바른 시간을 적어 주세요.');
    if (!tm[1] && hour >= 1 && hour <= 12) throw Error('오전 또는 오후를 함께 적어 주세요.');
    if (tm[1]) {
      if (hour < 1 || hour > 12) throw Error('오전·오후 시간은 1~12시예요.');
      hour = (hour % 12) + (/오후|밤|저녁/.test(tm[1]) ? 12 : 0);
    }
    type = 'timeBlock';
    const n = hour * 60 + +(tm[3] || 0);
    params = /이전|전/.test(tm[4]) ? { from: 0, to: n } : { from: n, to: 0 };
    if (/평일/.test(s)) params.weekdays = [1, 2, 3, 4, 5];
    else if (/주말/.test(s)) params.weekdays = [0, 6];
  } else if (/주말|평일|요일/.test(s)) {
    type = 'weekdayBlock';
    params = {
      days: /주말/.test(s)
        ? [0, 6]
        : /평일/.test(s)
          ? [1, 2, 3, 4, 5]
          : [...'일월화수목금토'].flatMap((d, i) => (s.includes(d + '요일') ? [i] : [])),
    };
  } else
    throw Error('아직 해석할 수 없는 규칙이에요. 아래 예시를 선택하거나 한 조건씩 적어 주세요.');
  return validateRule({ text: s, category, keyword, type, params, action, enabled: true });
}

import type { DateTimeFieldProps } from './DateTimeField';

const baseStyle: React.CSSProperties = {
  boxSizing: 'border-box',
  padding: 12,
  borderRadius: 10,
  border: '1px solid #E4D3C2',
  color: '#4A3F38',
  background: '#fff',
  font: 'inherit',
};

// 브라우저 기본 <input type="time">는 오전/오후 구간을 작은 스피너(▲▼ 클릭이나 스크롤)로
// 바꾸게 돼 있어서 마우스로 조작하기 불편하다는 피드백이 있었다. 시/분/오전·오후를 각각
// 진짜 드롭다운(select)으로 분리해서 클릭 한 번으로 고를 수 있게 한다.
function parseTime(value: string): { hour: number; minute: number; period: 'AM' | 'PM' } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value || '');
  const h = match ? Number(match[1]) : 9;
  const m = match ? Number(match[2]) : 0;
  return { hour: h % 12 === 0 ? 12 : h % 12, minute: m, period: h >= 12 ? 'PM' : 'AM' };
}
function formatTime(hour: number, minute: number, period: 'AM' | 'PM'): string {
  const h = (hour % 12) + (period === 'PM' ? 12 : 0);
  return `${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export default function DateTimeField({
  label,
  value,
  onChange,
  kind,
  disabled,
  timeAmbiguous,
}: DateTimeFieldProps) {
  if (kind === 'date') {
    return (
      <input
        aria-label={label}
        type="date"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...baseStyle, width: '100%' }}
      />
    );
  }
  const { hour, minute, period } = parseTime(value);
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <select
        aria-label={`${label} 시`}
        value={hour}
        disabled={disabled}
        onChange={(e) => onChange(formatTime(Number(e.target.value), minute, period))}
        style={{ ...baseStyle, flex: 1 }}
      >
        {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
          <option key={h} value={h}>
            {h}시
          </option>
        ))}
      </select>
      <select
        aria-label={`${label} 분`}
        value={minute}
        disabled={disabled}
        onChange={(e) => onChange(formatTime(hour, Number(e.target.value), period))}
        style={{ ...baseStyle, flex: 1 }}
      >
        {Array.from({ length: 60 }, (_, i) => i).map((m) => (
          <option key={m} value={m}>
            {String(m).padStart(2, '0')}분
          </option>
        ))}
      </select>
      {/* 시간이 오전/오후 어느 쪽인지 불확실할 땐(timeAmbiguous) 값을 미리 채워두지 않고
       "오전/오후 선택" 자리표시자를 보여줘서, 추측이 우연히 맞았더라도 사용자가 직접
       하나를 골라야만(반드시 값이 바뀌어야만) onChange가 발생해 ambiguous가 풀리게 한다. */}
      <select
        aria-label={`${label} 오전/오후`}
        value={timeAmbiguous ? '' : period}
        disabled={disabled}
        onChange={(e) => {
          if (!e.target.value) return;
          onChange(formatTime(hour, minute, e.target.value as 'AM' | 'PM'));
        }}
        style={{ ...baseStyle, flex: 1 }}
      >
        {timeAmbiguous && <option value="">오전/오후 선택</option>}
        <option value="AM">오전</option>
        <option value="PM">오후</option>
      </select>
    </div>
  );
}

import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../constants/colors';
import { addDays, buildMonthGrid, dayOfMonth, formatMonthLabel, isSameMonth } from '../utils/date';
import type { ShiftColorMap } from '../utils/shiftColorStore';
import type { Event } from '../types/schema';

const WEEKDAY_HEADERS = ['일', '월', '화', '수', '목', '금', '토'];

// 카카오톡/인스타그램에 우리 사이트가 직접 꽂아 넣을 수 있는 공식 웹 API는 없다(각자 앱의
// SDK/API 키 등록이 필요). 대신 브라우저 표준인 Web Share API로 이미지 파일을 넘기면,
// 기기에 설치된 카카오톡/인스타그램/메시지 등이 실제 OS 공유 시트에 그대로 뜬다 — 사용자가
// 요청한 "각 앱으로 연결"에 가장 가까운, 실제로 동작하는 방법이다. 파일 공유를 지원하지
// 않는 환경(대부분의 데스크탑 브라우저)에서는 이미지를 대신 다운로드하고 안내만 띄운다.
type ShareTarget = { key: string; label: string; color: string };
const SHARE_TARGETS: ShareTarget[] = [
  { key: 'kakao', label: '카카오톡', color: '#FEE500' },
  { key: 'instagram', label: '인스타그램', color: '#D6336C' },
  { key: 'message', label: '메시지', color: '#5FC76A' },
];

export function ShareCalendarModal({
  visible,
  onClose,
  events,
  viewedMonth,
  shiftColors,
}: {
  visible: boolean;
  onClose: () => void;
  events: Event[];
  viewedMonth: string;
  shiftColors: ShiftColorMap;
}) {
  const captureRef = useRef<View>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 가져오기(엑셀/사진/.ics)로 등록되어 shiftType이 붙은 일정만 남긴다 — 직접 입력하거나
  // AI로 해석해 등록한 개인 일정은 shiftType이 없어서 여기서 걸러진다.
  const shiftEvents = events.filter((e) => !e.cancelledAt && e.shiftType);
  const monthGrid = buildMonthGrid(viewedMonth);
  const labels = Array.from(new Set(shiftEvents.map((e) => e.shiftType!)));

  const colorsOn = (date: string): string[] => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const e of shiftEvents) {
      if (e.startDate > date || e.endDate < date) continue;
      const color = shiftColors[e.shiftType!] ?? colors.warmGray;
      if (!seen.has(color)) {
        seen.add(color);
        result.push(color);
      }
    }
    return result;
  };

  async function captureImage(): Promise<Blob | null> {
    if (!captureRef.current) return null;
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(captureRef.current as unknown as HTMLElement, {
      backgroundColor: '#F8F1E9',
      scale: 2,
    });
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
  }

  async function downloadBlob(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `꾹-캘린더-${viewedMonth}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleDownload() {
    setBusy('download');
    setNotice(null);
    try {
      const blob = await captureImage();
      if (blob) await downloadBlob(blob);
    } finally {
      setBusy(null);
    }
  }

  async function handleAppShare(target: ShareTarget) {
    setBusy(target.key);
    setNotice(null);
    try {
      const blob = await captureImage();
      if (!blob) return;
      const file = new File([blob], '꾹-캘린더.png', { type: 'image/png' });
      const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
      if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
        try {
          await nav.share({ files: [file], title: '꾹 캘린더' });
        } catch {
          // 사용자가 공유 시트에서 취소한 경우 등 - 별도 안내 없이 조용히 종료
        }
      } else {
        await downloadBlob(blob);
        setNotice(`이 브라우저에서는 ${target.label}로 바로 연결할 수 없어서 이미지를 다운로드했어요. 다운로드된 이미지를 ${target.label}에 직접 첨부해 보내주세요.`);
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <Text style={styles.heading}>근무 공유하기</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.closeX}>×</Text>
            </Pressable>
          </View>
          <Text style={styles.subheading}>가져오기로 등록한 근무 일정만 공유돼요. 직접 등록한 개인 일정은 포함되지 않아요.</Text>

          <View ref={captureRef} style={styles.card} collapsable={false}>
            <Text style={styles.cardBrand}>꾹</Text>
            <Text style={styles.cardMonth}>{formatMonthLabel(viewedMonth)}</Text>
            <View style={styles.weekdayRow}>
              {WEEKDAY_HEADERS.map((d) => (
                <Text key={d} style={styles.weekdayText}>{d}</Text>
              ))}
            </View>
            <View style={styles.grid}>
              {monthGrid.map((date) => {
                const inMonth = isSameMonth(date, viewedMonth);
                const dayColors = colorsOn(date);
                return (
                  <View key={date} style={styles.cell}>
                    <Text style={[styles.cellText, !inMonth && styles.cellTextOutside]}>{dayOfMonth(date)}</Text>
                    {dayColors.length > 0 && (
                      <View style={styles.cellBlocks}>
                        {dayColors.slice(0, 3).map((c, i) => (
                          <View key={i} style={[styles.cellBlock, { backgroundColor: c }]} />
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
            {labels.length > 0 && (
              <View style={styles.legend}>
                {labels.map((label) => (
                  <View key={label} style={styles.legendItem}>
                    <View style={[styles.legendSwatch, { backgroundColor: shiftColors[label] ?? colors.warmGray }]} />
                    <Text style={styles.legendText}>{label}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {shiftEvents.length === 0 && (
            <Text style={styles.emptyNotice}>이 달에는 가져오기로 등록한 근무 일정이 없어요.</Text>
          )}

          <View style={styles.shareRow}>
            {SHARE_TARGETS.map((target) => (
              <Pressable
                key={target.key}
                style={styles.shareButton}
                disabled={busy !== null}
                onPress={() => void handleAppShare(target)}
              >
                <View style={[styles.shareIcon, { backgroundColor: target.color }]} />
                <Text style={styles.shareLabel}>{busy === target.key ? '준비 중…' : target.label}</Text>
              </Pressable>
            ))}
            <Pressable style={styles.shareButton} disabled={busy !== null} onPress={() => void handleDownload()}>
              <View style={[styles.shareIcon, styles.downloadIcon]}>
                <Text style={styles.downloadIconText}>↓</Text>
              </View>
              <Text style={styles.shareLabel}>{busy === 'download' ? '저장 중…' : '이미지 다운로드'}</Text>
            </Pressable>
          </View>

          {!!notice && <Text style={styles.notice}>{notice}</Text>}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  sheet: {
    backgroundColor: colors.cream,
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 420,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  heading: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textDark,
  },
  closeX: {
    color: colors.warmGray,
    fontSize: 20,
    lineHeight: 20,
  },
  subheading: {
    fontSize: 12,
    color: colors.warmGray,
    marginBottom: 16,
    lineHeight: 18,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 16,
  },
  cardBrand: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.terracotta,
    marginBottom: 2,
  },
  cardMonth: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textDark,
    marginBottom: 10,
  },
  weekdayRow: {
    flexDirection: 'row',
  },
  weekdayText: {
    flexBasis: '14.28%',
    textAlign: 'center',
    fontSize: 10,
    color: colors.warmGray,
    marginBottom: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    flexBasis: '14.28%',
    alignItems: 'center',
    paddingVertical: 6,
  },
  cellText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textDark,
  },
  cellTextOutside: {
    color: colors.lightBeige,
  },
  cellBlocks: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 3,
  },
  cellBlock: {
    width: 10,
    height: 4,
    borderRadius: 2,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.lightBeige,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  legendText: {
    fontSize: 11,
    color: colors.textDark,
  },
  emptyNotice: {
    fontSize: 12,
    color: colors.warmGray,
    marginTop: 10,
    textAlign: 'center',
  },
  shareRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 18,
    justifyContent: 'center',
  },
  shareButton: {
    alignItems: 'center',
    width: 76,
    gap: 6,
  },
  shareIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  downloadIcon: {
    backgroundColor: colors.lightBeige,
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadIconText: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textDark,
  },
  shareLabel: {
    fontSize: 11,
    color: colors.textDark,
    textAlign: 'center',
  },
  notice: {
    fontSize: 12,
    color: colors.terracotta,
    marginTop: 14,
    lineHeight: 18,
    textAlign: 'center',
  },
});

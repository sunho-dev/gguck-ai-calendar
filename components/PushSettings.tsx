import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { Choice } from './ScheduleControls';
import { disablePush, enablePush, pushEnabled, syncPush, testPush } from '../utils/pushClient';
import { colors } from '../constants/colors';

export function PushSettings() {
  const [enabled, setEnabled] = useState(pushEnabled),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      setMessage(success);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setEnabled(pushEnabled());
      setBusy(false);
    }
  }
  async function toggle(next: boolean) {
    if (next === enabled || busy) return;
    if (next) {
      await run(
        () => enablePush(false),
        '전체 알림을 켰어요. 등록된 일정의 알림 예약을 동기화했어요.',
      );
    } else {
      await run(disablePush, '전체 알림을 껐어요. 이 기기로 예약된 푸시 알림도 해제했어요.');
    }
  }
  return (
    <View style={styles.card}>
      <View style={styles.toggleRow}>
        <View style={styles.copy}>
          <Text style={styles.title}>전체 알림</Text>
          <Text style={styles.status}>
            {enabled ? 'ON · 이 기기에서 알림을 받아요' : 'OFF · 이 기기의 알림을 받지 않아요'}
          </Text>
        </View>
        <Switch
          value={enabled}
          disabled={busy}
          onValueChange={(next) => void toggle(next)}
          trackColor={{ false: '#D8CFC6', true: '#D8A28E' }}
          thumbColor={enabled ? colors.terracotta : '#FFF9F2'}
          accessibilityLabel="전체 알림 켜기 또는 끄기"
          accessibilityHint="켜면 일정 알림을 이 기기로 받고, 끄면 예약된 푸시 알림을 해제합니다."
        />
      </View>
      <Text style={styles.description}>
        {enabled
          ? '앱을 닫아도 등록된 일정에 맞춰 알림을 받을 수 있어요. Google 알림도 켜져 있다면 두 곳에서 받을 수 있어요.'
          : '알림이 꺼져 있어도 일정과 알림 예정 시간은 그대로 저장돼요. 다시 켜면 현재 일정 기준으로 예약을 다시 동기화해요.'}
      </Text>
      {enabled && (
        <View style={styles.actions}>
          <Choice
            label="테스트 알림 보내기"
            disabled={busy}
            onPress={() =>
              void run(
                testPush,
                '테스트 알림을 요청했어요. 이 기기에 실제 도착했는지 확인해 주세요.',
              )
            }
          />
          <Choice
            label="알림 예약 다시 동기화"
            disabled={busy}
            onPress={() =>
              void run(
                syncPush,
                '알림 예약을 갱신했어요. 실제 발송에는 서버 예약 실행 설정이 필요해요.',
              )
            }
          />
        </View>
      )}
      {!!message && (
        <Text style={styles.message} accessibilityLiveRegion="polite">
          {message}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 20,
    gap: 12,
    backgroundColor: '#FFFAF4',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5D8CB',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  copy: { flex: 1, gap: 4 },
  title: { fontSize: 17, fontWeight: '700', color: colors.textDark },
  status: { fontSize: 13, color: colors.warmGray },
  description: { fontSize: 13, lineHeight: 21, color: colors.warmGray },
  actions: { gap: 8 },
  message: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.textDark,
    backgroundColor: '#F7EFE5',
    padding: 10,
    borderRadius: 10,
  },
});

import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { syncPush } from '../utils/pushClient';
export function ReminderSync() {
  const [error, setError] = useState('');
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let active = true,
      running = false,
      dirty = false;
    async function sync() {
      dirty = true;
      if (running) return;
      running = true;
      do {
        dirty = false;
        try {
          await syncPush();
          if (active) setError('');
        } catch (e) {
          if (active)
            setError(
              '일정은 저장됐지만 알림 예약을 갱신하지 못했어요. 알림함에서 재시도해 주세요.',
            );
        }
      } while (dirty && active);
      running = false;
    }
    void sync();
    window.addEventListener('gguck-events-changed', sync);
    window.addEventListener('storage', sync);
    window.addEventListener('online', sync);
    const timer = setInterval(() => void sync(), 60000);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('gguck-events-changed', sync);
      window.removeEventListener('storage', sync);
      window.removeEventListener('online', sync);
    };
  }, []);
  return error ? (
    <Text accessibilityRole="alert" style={{ padding: 10, color: '#A54130' }}>
      {error}
    </Text>
  ) : null;
}

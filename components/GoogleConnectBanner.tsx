import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { colors } from '../constants/colors';

// 구글 OAuth 콜백이 끝나면 api/auth/google-callback.ts가 ?googleConnected=1|0으로 돌려보낸다.
// 그 값을 읽어서 눈에 띄는 배너로 알려주고, 새로고침해도 다시 안 뜨게 URL에서 지운다.
export function GoogleConnectBanner() {
  const [result, setResult] = useState<'success' | 'error' | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const status = params.get('googleConnected');
    if (status === null) return;

    setResult(status === '1' ? 'success' : 'error');

    params.delete('googleConnected');
    params.delete('googleConnectError');
    const query = params.toString();
    const cleanedUrl = window.location.pathname + (query ? `?${query}` : '') + window.location.hash;
    window.history.replaceState({}, '', cleanedUrl);
  }, []);

  if (!result) return null;

  return (
    <Pressable
      onPress={() => setResult(null)}
      style={[styles.banner, result === 'success' ? styles.success : styles.error]}
    >
      <Text style={styles.text}>
        {result === 'success'
          ? '✓ Google Calendar가 연동됐어요. 이제부터 일정이 자동으로 동기화돼요.'
          : '구글 캘린더 연동에 실패했어요. 다시 시도해 주세요.'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    width: '100%',
  },
  success: {
    backgroundColor: '#dff0d8',
  },
  error: {
    backgroundColor: '#fbe8e3',
  },
  text: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textDark,
    textAlign: 'center',
  },
});

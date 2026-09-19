import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';

import { colors } from '../constants/colors';

interface ToastProps {
  message: string;
  onDismiss: () => void;
  duration?: number;
}

// 웹/모바일(같은 웹앱을 모바일 브라우저로 보는 경우 포함) 공통으로 쓰는 토스트/알림 배너.
// 페이지 레이아웃 안에 파묻히지 않도록 화면 위에 떠서 잠깐 보였다가 자동으로 사라진다.
export function Toast({ message, onDismiss, duration = 3200 }: ToastProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-16)).current;

  useEffect(() => {
    if (!message) return;

    opacity.setValue(0);
    translateY.setValue(-16);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -16, duration: 200, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) onDismiss();
      });
    }, duration);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, duration]);

  if (!message) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.container, { opacity, transform: [{ translateY }] }]}
    >
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 1000,
  },
  text: {
    backgroundColor: colors.terracotta,
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    overflow: 'hidden',
    maxWidth: 480,
    textAlign: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
});

import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

// 김창민 팀원 프로토타입의 그라데이션 + 상단 하이라이트(광택) 버튼 스타일을 RN으로 재현.
// 그림자는 overflow 클리핑과 함께 쓰면 잘려서, 그림자(바깥 View)와 둥근 모서리 클리핑(안쪽 그라데이션)을 분리했다.
export function GlossyBox({
  colors,
  shadowColor,
  borderRadius = 14,
  bordered = false,
  style,
  contentStyle,
  children,
}: {
  colors: [string, string];
  shadowColor: string;
  borderRadius?: number;
  bordered?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  return (
    <View
      style={[
        {
          borderRadius,
          shadowColor,
          shadowOffset: { width: 0, height: 5 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 4,
        },
        bordered && styles.border,
        style,
      ]}
    >
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.fill, { borderRadius }, contentStyle]}
      >
        <LinearGradient
          colors={['rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']}
          locations={[0, 0.75]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {children}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  border: {
    borderWidth: 2,
    borderColor: '#fff5e9',
  },
});

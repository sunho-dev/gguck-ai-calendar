import { StyleSheet, Text } from 'react-native';

import { GlossyBox } from './GlossyBox';

export function AppLogo({ size = 34 }: { size?: number }) {
  return (
    <GlossyBox
      colors={['#d99a7d', '#b76f54']}
      shadowColor="#9f6b42"
      borderRadius={size * 0.35}
      bordered
      style={{ width: size, height: size }}
    >
      <Text style={[styles.text, { fontSize: size * 0.42 }]}>꾹</Text>
    </GlossyBox>
  );
}

const styles = StyleSheet.create({
  text: {
    color: '#fff9f0',
    fontWeight: '800',
  },
});

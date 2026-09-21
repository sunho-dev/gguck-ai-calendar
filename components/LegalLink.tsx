import { Linking, Pressable, StyleSheet, Text } from 'react-native';

import { colors } from '../constants/colors';

// 네이티브(앱)용. 웹에서는 같은 이름의 LegalLink.web.tsx가 진짜 <a href> 링크로 대신 쓰인다.
export function LegalLink({ url, label }: { url: string; label: string }) {
  return (
    <Pressable accessibilityRole="link" onPress={() => Linking.openURL(url)}>
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: 10,
    color: colors.warmGray,
    textDecorationLine: 'underline',
  },
});

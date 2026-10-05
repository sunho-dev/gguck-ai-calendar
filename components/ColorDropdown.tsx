import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, shiftColorPalette } from '../constants/colors';

const LIST_WIDTH = 130;

// 절대 위치(position:absolute)로만 띄우면 카드 안 다른 요소한테 뒤로 밀리거나, 카드
// 영역을 벗어나는 순간 부모의 레이아웃에 잘려서 안 보이는 문제가 있었다(React Native
// Web에서 겹치는 View들의 stacking이 기대한 대로 안 됨). Modal은 화면 전체를 덮는 별도
// 레이어에 그려져서 항상 맨 위에, 잘림 없이 보인다 — 대신 트리거 버튼의 화면상 위치를
// 직접 측정해서(measureInWindow) 그 자리에 옵션 목록을 띄워준다.
export function ColorDropdown({
  value,
  onChange,
}: {
  value: string;
  onChange: (hex: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const triggerRef = useRef<View>(null);
  const selected = shiftColorPalette.find((c) => c.value === value) ?? shiftColorPalette[0];

  const openDropdown = () => {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setOpen(true);
    });
  };

  return (
    <View>
      <Pressable ref={triggerRef} style={styles.trigger} onPress={openDropdown}>
        <View style={[styles.swatch, { backgroundColor: selected.value }]} />
        <Text style={styles.triggerText}>{selected.name}</Text>
        <Text style={styles.caret}>▾</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)}>
          {anchor && (
            <View
              style={[
                styles.optionList,
                {
                  top: anchor.y + anchor.height + 4,
                  left: Math.max(8, anchor.x + anchor.width - LIST_WIDTH),
                },
              ]}
            >
              {shiftColorPalette.map((c) => (
                <Pressable
                  key={c.value}
                  style={styles.option}
                  onPress={() => {
                    onChange(c.value);
                    setOpen(false);
                  }}
                >
                  <View style={[styles.swatch, { backgroundColor: c.value }]} />
                  <Text style={styles.optionText}>{c.name}</Text>
                  {c.value === value && <Text style={styles.checkMark}>✓</Text>}
                </Pressable>
              ))}
            </View>
          )}
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.lightBeige,
  },
  swatch: {
    width: 14,
    height: 14,
    borderRadius: 4,
  },
  triggerText: {
    fontSize: 12,
    color: colors.textDark,
    fontWeight: '600',
  },
  caret: {
    fontSize: 10,
    color: colors.warmGray,
  },
  optionList: {
    position: 'absolute',
    width: LIST_WIDTH,
    backgroundColor: colors.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.lightBeige,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: colors.white,
  },
  optionText: {
    fontSize: 12,
    color: colors.textDark,
    flex: 1,
  },
  checkMark: {
    fontSize: 12,
    color: colors.terracotta,
    fontWeight: '700',
  },
});

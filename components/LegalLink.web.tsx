import type { CSSProperties } from 'react';

// Pressable + Linking.openURL은 웹에서 href 없는 <div>로 그려져서, 구글 검수 봇/검색 봇이
// 링크로 인식하지 못하고(개인정보처리방침 링크가 없다고 판단될 수 있음) 팝업 차단 환경에서는
// 열리지도 않았다. 웹에서는 진짜 <a href>로 그린다. 모양은 기존 링크 글자(10px, 밑줄)와 같다.
const style: CSSProperties = {
  fontSize: 10,
  color: '#88786E',
  textDecoration: 'underline',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  cursor: 'pointer',
};

export function LegalLink({ url, label }: { url: string; label: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={style}>
      {label}
    </a>
  );
}

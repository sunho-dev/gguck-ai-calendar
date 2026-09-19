import { interpretEventText, type KnownPlaceAlias } from '../api/_interpretCore'

const DEFAULT_TEXT = '다음주 화요일 저녁 7시에 강남역에서 팀 회식 있습니다. 1차는 고기집, 2차는 노래방 예정이에요.'

// 별명 학습/추측 동작을 테스트하기 위한 샘플 데이터. "종숲"은 등록돼있고 "잠숲" 같은 새 패턴이 추측되는지 확인용.
const SAMPLE_KNOWN_ALIASES: KnownPlaceAlias[] = [
  { alias: '종숲', name: '서울숲클라이밍 종로점', address: null, category: '클라이밍' },
]

async function main() {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('GEMINI_API_KEY 환경 변수가 설정되어 있지 않습니다.')
    console.error('PowerShell: $env:GEMINI_API_KEY = "AIza..."')
    process.exit(1)
  }

  const text = process.argv.slice(2).join(' ').trim() || DEFAULT_TEXT
  const nowIso = new Date().toISOString()

  console.log('--- 입력 텍스트 ---')
  console.log(text)
  console.log('--- 기준 시각 ---')
  console.log(nowIso)
  console.log('--- 등록된 장소 별명 (샘플) ---')
  console.log(JSON.stringify(SAMPLE_KNOWN_ALIASES, null, 2))
  console.log('--- 호출 중... ---')

  const command = await interpretEventText(text, nowIso, apiKey, SAMPLE_KNOWN_ALIASES)

  console.log('--- 결과 ---')
  console.log(JSON.stringify(command, null, 2))
}

main().catch((err) => {
  console.error('해석 실패:', err)
  process.exit(1)
})

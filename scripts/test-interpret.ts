import { interpretEventText } from '../api/_interpretCore'

const DEFAULT_TEXT = '다음주 화요일 저녁 7시에 강남역에서 팀 회식 있습니다. 1차는 고기집, 2차는 노래방 예정이에요.'

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY 환경 변수가 설정되어 있지 않습니다.')
    console.error('PowerShell: $env:ANTHROPIC_API_KEY = "sk-ant-..."')
    process.exit(1)
  }

  const text = process.argv.slice(2).join(' ').trim() || DEFAULT_TEXT
  const nowIso = new Date().toISOString()

  console.log('--- 입력 텍스트 ---')
  console.log(text)
  console.log('--- 기준 시각 ---')
  console.log(nowIso)
  console.log('--- 호출 중... ---')

  const event = await interpretEventText(text, nowIso, apiKey)

  console.log('--- 결과 ---')
  console.log(JSON.stringify(event, null, 2))
}

main().catch((err) => {
  console.error('해석 실패:', err)
  process.exit(1)
})

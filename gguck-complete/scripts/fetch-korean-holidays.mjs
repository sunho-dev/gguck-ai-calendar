// 공공데이터포털 "한국천문연구원_특일 정보" API에서 공휴일(대체공휴일 포함)을 받아와
// data/koreanHolidays.json으로 저장한다. 음력 기반 공휴일(설날·추석·부처님오신날)이 매년
// 날짜가 바뀌기 때문에, 이 스크립트를 새해가 시작될 때마다 다시 돌려서 갱신해야 한다.
//
// 실행: node --env-file=.env scripts/fetch-korean-holidays.mjs 2025 2026 2027
// .env에 HOLIDAY_API_KEY=<공공데이터포털에서 발급받은 서비스키> 필요

const API_URL =
  'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo'

const serviceKey = process.env.HOLIDAY_API_KEY
if (!serviceKey) {
  console.error('HOLIDAY_API_KEY가 없어요. .env 파일을 만들고 다시 실행해주세요.')
  process.exit(1)
}

const years = process.argv.slice(2).map(Number)
if (years.length === 0) {
  console.error('연도를 하나 이상 넘겨주세요. 예: node scripts/fetch-korean-holidays.mjs 2026')
  process.exit(1)
}

function normalizeItems(body) {
  const items = body?.items
  if (!items || items === '') return []
  const item = items.item
  if (!item) return []
  return Array.isArray(item) ? item : [item]
}

function toISODate(locdate) {
  const s = String(locdate)
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
}

async function fetchMonth(year, month) {
  const url = new URL(API_URL)
  url.searchParams.set('serviceKey', serviceKey)
  url.searchParams.set('solYear', String(year))
  url.searchParams.set('solMonth', String(month).padStart(2, '0'))
  url.searchParams.set('numOfRows', '20')
  url.searchParams.set('_type', 'json')

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`${year}-${month}: HTTP ${res.status}`)
  }
  const json = await res.json()
  const header = json?.response?.header
  if (header?.resultCode !== '00') {
    throw new Error(`${year}-${month}: ${header?.resultCode} ${header?.resultMsg}`)
  }
  return normalizeItems(json.response.body)
}

const holidays = {}

for (const year of years) {
  for (let month = 1; month <= 12; month++) {
    const items = await fetchMonth(year, month)
    for (const item of items) {
      if (item.isHoliday !== 'Y') continue
      holidays[toISODate(item.locdate)] = item.dateName
    }
  }
  console.log(`${year}년 완료`)
}

const fs = await import('node:fs/promises')
await fs.mkdir('data', { recursive: true })
await fs.writeFile(
  'data/koreanHolidays.json',
  JSON.stringify(holidays, Object.keys(holidays).sort(), 2),
  'utf-8'
)

console.log(`data/koreanHolidays.json에 ${Object.keys(holidays).length}개 저장 완료`)

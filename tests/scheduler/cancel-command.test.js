import test from 'node:test';import assert from 'node:assert/strict';
import {findCancellation,hasCancelIntent,matchCancellation} from '../../utils/scheduler/cancel-command.js';
const now=new Date('2026-09-16T10:00:00+09:00');
const events=[{id:'a',title:'운동',date:'2026-09-17',time:'08:00'},{id:'b',title:'운동',date:'2026-09-17',time:'20:00',seriesId:'s'},{id:'c',title:'팀 회의',date:'2026-09-18',time:'14:00'},{id:'d',title:'운동',date:'2026-09-18',time:'20:00',seriesId:'s'},{id:'old',title:'운동',date:'2026-09-15',time:'20:00'},{id:'cancelled',title:'운동',date:'2026-09-17',time:'20:00',cancelledAt:'yes'}];
test('취소 의도 구분',()=>{assert.ok(hasCancelIntent('내일 운동 취소'));assert.ok(!hasCancelIntent('내일 8시 운동'))});
test('날짜와 제목으로 후보 검색',()=>assert.deepEqual(findCancellation('내일 운동 취소',events,now).matches.map(e=>e.id),['a','b']));
test('명확한 시간은 한 개',()=>assert.equal(findCancellation('내일 오후 8시 운동 취소해줘',events,now).matches[0].id,'b'));
test('모호한 시간은 양쪽 후보 보존',()=>assert.equal(findCancellation('내일 8시 운동 취소',events,now).matches.length,2));
test('ISO 날짜, 띄어쓰기, 조사',()=>assert.equal(findCancellation('2026-09-18 오후 2시 팀 회의를 취소해주세요',events,now).matches[0].id,'c'));
test('과거 및 취소된 일정 제외',()=>assert.equal(findCancellation('운동 취소',events,now).matches.length,3));
test('전체, 이후 범위 파악',()=>{assert.equal(findCancellation('운동 전체 반복 취소',events,now).scope,'all');assert.equal(findCancellation('내일 이후 운동 취소',events,now).scope,'following')});
test('취소만 입력하면 중단',()=>assert.throws(()=>findCancellation('취소',events,now)));
test('부정 및 언급은 취소하지 않음',()=>{assert.throws(()=>findCancellation('내일 운동 취소하지마',events,now));assert.throws(()=>findCancellation('취소 관련 회의',events,now))});
test('없는 일정과 잘못된 날짜',()=>{assert.equal(findCancellation('내일 수영 취소',events,now).matches.length,0);assert.throws(()=>findCancellation('2026-02-30 운동 취소',events,now))});
test('삭제·제거도 취소와 같은 뜻으로 인식',()=>{
 assert.ok(hasCancelIntent('내일 운동 삭제'));assert.ok(hasCancelIntent('내일 운동 제거해줘'));
 assert.equal(findCancellation('내일 운동 삭제해줘',events,now).matches.length,2);
 assert.throws(()=>findCancellation('운동 삭제하지마',events,now));
});
test('AI가 뽑아준 구조화 취소 정보로도 로컬 취소와 동일하게 매칭(카테고리 명시)',()=>{
 const withCategory=[...events,{id:'ex1',title:'헬스장 가기',date:'2026-09-20',time:'19:00',category:'exercise'}];
 const r=matchCancellation({query:'',category:'exercise',date:null,month:null,times:null,scope:'one'},withCategory,now);
 assert.deepEqual(r.matches.map(e=>e.id).sort(),['ex1']);
});
test('AI가 뽑아준 달 범위(9월)로도 매칭 (명시적 범위라 과거 일정도 포함)',()=>{
 const r=matchCancellation({query:'',category:null,date:null,month:'2026-09',times:null,scope:'one'},events,now);
 assert.deepEqual(r.matches.map(e=>e.id).sort(),['a','b','c','d','old']);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretChat} from '../../utils/scheduler/personal-dictionary.js';
import {restoreRules} from '../../utils/scheduler/engine.js';
const now=new Date('2026-09-16T10:00:00+09:00');
const parse=text=>interpretChat('내일 오후 3시 '+text,[],now);
for(const [text,location,category] of [
 ['집','집','personal'],['본가 방문','본가','personal'],['병원','병원','health'],
 ['병원 가기','병원','health'],['치과 진료','치과','health'],['약국','약국','health'],
 ['집에서 공부','집','study'],['집에서 운동','집','exercise'],
 ['병원에서 업무 미팅','병원','work'],['병원에 출근','병원','work'],
 ['병원에서 친구 방문','병원','personal'],['회사에서 운동','회사','exercise'],
 ['헬스장에서 업무 미팅','헬스장','work'],['도서관에서 공부','도서관','study'],
 ['우리 집에서 요가','우리 집','exercise']
])test(text+'은 일반 의미로 처리',()=>{
 const r=parse(text);assert.equal(r.unknown,null);assert.equal(r.event.category,category);
 assert.equal(r.event.location,location);assert.equal(r.event.aliasTerm,undefined);
});
test('장소의 부분 문자열은 일반 장소로 오인하지 않음',()=>{
 for(const term of ['종숲','구로숲','집중숲','병원숲'])assert.equal(parse(term+' ㄱ').unknown,term);
});
test('시간 모호성 확인은 유지',()=>{
 const r=interpretChat('내일 8시 병원',[],now);assert.equal(r.unknown,null);assert.equal(r.event.ambiguous,true);
});
test('개인 집 주소는 알려준 경우에만 적용',()=>{
 const r=interpretChat('내일 오후 3시 집에서 운동',[{term:'집',meaning:'집',location:'사용자가 정한 주소',category:'personal'}],now);
 assert.equal(r.event.location,'사용자가 정한 주소');assert.equal(r.event.category,'exercise');
});
test('반복 병원 일정도 건강으로 분류',()=>{
 const r=interpretChat('매주 월요일 오전 10시 병원 진료',[],now);
 assert.equal(r.unknown,null);assert.equal(r.event.category,'health');assert.ok(r.event.recurrence);
});
test('기존 알림 설정을 보존하고 건강 기본값 보충',()=>{
 const old={gap:30,reminders:{exercise:5,personal:0,work:15,study:30}};
 const restored=restoreRules(old);assert.equal(restored.gap,30);assert.equal(restored.reminders.personal,0);
 assert.equal(restored.reminders.health,60);assert.equal(old.reminders.health,undefined);
 assert.equal(restoreRules({reminders:{health:10}}).reminders.health,10);
});

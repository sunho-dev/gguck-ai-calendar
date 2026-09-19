import test from 'node:test';
import assert from 'node:assert/strict';
import {recurrenceFor} from '../utils/recurrenceSelection';
import {initialRules,planSeries,type Schedule} from '../utils/scheduler';
import {toEvent,toSchedule} from '../utils/scheduleAdapter';
const monday='2030-01-07';
const schedule:Schedule={title:'운동',date:monday,time:'08:00',duration:60,category:'exercise'};
test('UI에서 선택한 매주 기본값은 시작 요일과 4주 기간',()=>{
 const r=recurrenceFor('weekly',monday)!;
 assert.deepEqual(r.days,[1]);assert.equal(r.until,'2030-02-03');
});
test('반복 방식 변경 시 선택한 종료일과 요일을 유지',()=>{
 const r=recurrenceFor('weekly',monday,{frequency:'daily',days:[1,3,5],until:'2030-03-31'})!;
 assert.deepEqual(r.days,[1,3,5]);assert.equal(r.until,'2030-03-31');
 assert.equal(recurrenceFor('none',monday,r),null);
});
test('월 반복 날짜가 없는 달을 건너뛴다',()=>{
 const event={...schedule,date:'2030-01-31',recurrence:{...recurrenceFor('monthly','2030-01-31')!,until:'2030-03-31'}};
 const plan=planSeries(event,[],initialRules,[],Date.parse('2029-01-01'));
 assert.deepEqual(plan.accepted.map(e=>e.date),['2030-01-31','2030-03-31']);
});
test('충돌 회차를 건너뛰고 개별 다시 포함하면 충돌이 복원된다',()=>{
 const event={...schedule,recurrence:recurrenceFor('daily',monday)};
 const now=Date.parse('2029-01-01');
 assert.equal(planSeries(event,[schedule],initialRules,[],now).conflicts.length,1);
 assert.equal(planSeries(event,[schedule],initialRules,[monday],now).conflicts.length,0);
 assert.equal(planSeries(event,[schedule],initialRules,[],now).conflicts[0].event.date,monday);
});
test('잘못된 날짜 입력 중 반복 선택을 바꿔도 예외 없이 검토 상태를 유지',()=>{
 assert.doesNotThrow(()=>recurrenceFor('monthly',''));
 assert.ok(planSeries({...schedule,date:'',recurrence:recurrenceFor('monthly','')},[],initialRules).error);
});
test('개인 사전 뜻과 알림은 캘린더용 Event 변환 후에도 유지',()=>{
 const event=toEvent({...schedule,aliasTerm:'종숲',aliasMeaning:'내가 지정한 클라이밍장',location:'종로 지점'},initialRules);
 assert.equal(event.aliasMeaning,'내가 지정한 클라이밍장');assert.equal(event.remindMin,30);
 assert.equal(toSchedule(event).aliasMeaning,event.aliasMeaning);
});

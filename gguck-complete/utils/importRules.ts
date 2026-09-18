import type {Event} from '../types/schema';
import type {ImportedEventDraft} from './icsImport';
import {categoryKey,toEvent,toSchedule} from './scheduleAdapter';
import {check,type Rules,type Reason,type Schedule} from './scheduler';
export interface ImportAssessment {event:Event;reasons:Reason[];blocked:boolean}
export function assessImport(drafts:ImportedEventDraft[],existing:Event[],rules:Rules,now=Date.now()):ImportAssessment[]{
 const planned:Schedule[]=existing.filter(e=>!e.cancelledAt).map(toSchedule);
 return drafts.map(d=>{
  const schedule:Schedule={title:d.title,date:d.startDate,time:d.time,duration:d.durationMin,category:categoryKey(d.title),location:d.place?.name,imported:true};
  const event={...toEvent(schedule,rules),createdFrom:'paste' as const,place:d.place?{...d.place,lat:0,lng:0}:null};
  const verdict=check(schedule,planned,rules,now);
  if(!d.title.trim())verdict.reasons.push({type:'invalid',message:'일정 제목이 비어 있어요.',action:'block',overridable:false});
  // Include every selected item: approving exceptions must not hide later conflicts.
  planned.push({...schedule,id:event.id});
  return {event,reasons:verdict.reasons,blocked:verdict.reasons.some(r=>r.action!=='warn')};
 });
}
export function approveImport(items:ImportAssessment[],mode:'all'|'safe'):Event[]{
 if(mode==='all'&&items.some(x=>x.reasons.some(r=>r.action!=='warn'&&!r.overridable)))throw Error('날짜·시간·제목 오류는 먼저 수정해 주세요.');
 return items.filter(x=>mode==='all'||!x.blocked).map(x=>({...x.event,ruleExceptions:mode==='all'?x.reasons.filter(r=>r.overridable&&r.action!=='warn').map(r=>r.ruleId!):[]}));
}

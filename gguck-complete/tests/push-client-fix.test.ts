import test from 'node:test';
import assert from 'node:assert/strict';
import {syncPush,disablePush,pushEnabled,pushRequest} from '../utils/pushClient';
test('동기화와 해제를 동시에 눌러도 해제 후 예약을 다시 보내지 않음',async()=>{
 const names=['window','localStorage','navigator','fetch'] as const;
 const original=new Map(names.map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)]));
 const values=new Map([['gguck-push-token','token']]);
 const storage={getItem:(k:string)=>values.get(k)||null,removeItem:(k:string)=>values.delete(k)};
 const calls:string[]=[];
 try{
  Object.defineProperty(globalThis,'window',{configurable:true,value:{localStorage:storage}});
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:storage});
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{serviceWorker:{getRegistration:async()=>undefined}}});
  Object.defineProperty(globalThis,'fetch',{configurable:true,value:async(url:string)=>{calls.push(url);return new Response('{"ok":true}',{status:200});}});
  await Promise.all([syncPush(),disablePush(),syncPush()]);
  assert.deepEqual(calls,['/api/push?action=sync','/api/push?action=disable']);assert.equal(pushEnabled(),false);
 }finally{for(const n of names){const d=original.get(n);if(d)Object.defineProperty(globalThis,n,d);else Reflect.deleteProperty(globalThis,n);}}
});
test('알림 서버의 구체적인 오류 안내 보존',async()=>{
 const names=['localStorage','fetch'] as const;const original=new Map(names.map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)]));
 try{
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>null}});
  Object.defineProperty(globalThis,'fetch',{configurable:true,value:async()=>new Response(JSON.stringify({error:'서버 푸시 설정이 아직 준비되지 않았어요.'}),{status:503})});
  await assert.rejects(pushRequest('test'),/서버 푸시 설정이 아직 준비되지/);
 }finally{for(const n of names){const d=original.get(n);if(d)Object.defineProperty(globalThis,n,d);else Reflect.deleteProperty(globalThis,n);}}
});

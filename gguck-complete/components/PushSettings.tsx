import {useState} from 'react';
import {Text,View} from 'react-native';
import {Choice} from './ScheduleControls';
import {enablePush,disablePush,syncPush,pushEnabled} from '../utils/pushClient';
export function PushSettings(){
 const [enabled,setEnabled]=useState(pushEnabled),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function run(action:()=>Promise<unknown>){setBusy(true);try{await action();setEnabled(pushEnabled());setMessage('알림 서버에 반영했어요. 예약 발송은 서버 스케줄러 실행 시 처리돼요.');}catch(e){setMessage(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
 return <View style={{padding:20,gap:10,backgroundColor:'#FFFAF4',borderRadius:16}}><Text>이 기기 알림 · {enabled?'연결됨':'미연결'}</Text><Text>앱을 닫아도 받으려면 알림을 연결해 주세요. Google 알림과 함께 켜면 두 곳에서 받을 수 있어요.</Text><Choice label={enabled?'테스트 알림 보내기':'알림 연결하고 테스트'} disabled={busy} onPress={()=>void run(enablePush)}/>{enabled&&<><Choice label="알림 예약 다시 동기화" disabled={busy} onPress={()=>void run(syncPush)}/><Choice label="이 기기 알림 끄기" disabled={busy} onPress={()=>void run(disablePush)}/></>}<Text accessibilityLiveRegion="polite">{message}</Text></View>;
}

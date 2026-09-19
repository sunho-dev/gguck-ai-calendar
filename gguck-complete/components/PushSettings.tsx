import {useState} from 'react';
import {Text,View} from 'react-native';
import {Choice} from './ScheduleControls';
import {enablePush,disablePush,syncPush,pushEnabled} from '../utils/pushClient';
export function PushSettings(){
 const [enabled,setEnabled]=useState(pushEnabled),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function run(action:()=>Promise<unknown>,success:string){setBusy(true);try{await action();setEnabled(pushEnabled());setMessage(success);}catch(e){setMessage(e instanceof Error?e.message:String(e));}finally{setEnabled(pushEnabled());setBusy(false);}}
 return <View style={{padding:20,gap:10,backgroundColor:'#FFFAF4',borderRadius:16}}><Text>이 기기 알림 · {enabled?'연결됨':'미연결'}</Text><Text>앱을 닫아도 받으려면 알림을 연결해 주세요. Google 알림과 함께 켜면 두 곳에서 받을 수 있어요.</Text><Choice label={enabled?'테스트 알림 보내기':'알림 연결하고 테스트'} disabled={busy} onPress={()=>void run(enablePush,'테스트 알림을 요청했어요. 이 기기에 실제 도착했는지 확인해 주세요.')}/>{enabled&&<><Choice label="알림 예약 다시 동기화" disabled={busy} onPress={()=>void run(syncPush,'알림 예약을 갱신했어요. 실제 발송에는 서버 예약 실행 설정이 필요해요.')}/><Choice label="이 기기 알림 끄기" disabled={busy} onPress={()=>void run(disablePush,'이 기기의 알림과 서버 예약을 해제했어요.')}/></>}<Text accessibilityLiveRegion="polite">{message}</Text></View>;
}

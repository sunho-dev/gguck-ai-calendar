import {useState} from 'react';
import {Modal,ScrollView,Text,View,StyleSheet} from 'react-native';
import type {Event} from '../types/schema';
import {categories,stamp,type Category} from '../utils/scheduler';
import {categoryKey} from '../utils/scheduleAdapter';
import {useStoredEvents} from '../utils/useStoredEvents';
import {Choice} from '../components/ScheduleControls';
import {colors} from '../constants/colors';
import {PushSettings} from '../components/PushSettings';
import {reminderMessages} from '../utils/reminderPlan';
export function AlertsScreen({onCompose=()=>{}}:{onCompose?:()=>void}){
 const [notify,setNotify]=useState<Event|null>(null);
 const events=useStoredEvents().filter(e=>!e.cancelledAt).sort((a,b)=>stamp(a.startDate,a.time)-stamp(b.startDate,b.time));
 return <ScrollView style={styles.page}><Text style={styles.heading}>필요한 순간, 잊지 않게.</Text><PushSettings/><Text style={styles.muted}>카테고리와 개인 규칙에 맞춘 알림이에요. 아래 미리보기 버튼은 발송하지 않아요.</Text>
 {events.map(e=><View key={e.id} style={styles.card}><Text style={styles.muted}>{categories[categoryKey(e.category)]}{stamp(e.startDate,e.time)<Date.now()?' · 지난 일정':''}</Text><Text style={styles.title}>{e.title}</Text><Text style={styles.muted}>{e.startDate} {e.time} · {e.remindMin}분 전</Text><Text style={styles.muted}>알림 예정: {new Date(stamp(e.startDate,e.time)-e.remindMin*60000).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</Text><Choice label={`${e.title} 알림 미리보기`} onPress={()=>setNotify(e)}/></View>)}
 {!events.length&&<View style={styles.card}><Text style={styles.muted}>새 일정을 등록하면 카테고리별 알림이 여기에 표시돼요.</Text><Choice label="일정 등록하러 가기" onPress={onCompose}/></View>}
 <Modal visible={!!notify} transparent animationType="fade" onRequestClose={()=>setNotify(null)}><View style={styles.overlay}><View style={styles.dialog} accessibilityViewIsModal>
 <Text style={styles.heading}>꾹</Text><Text style={styles.muted}>알림 미리보기 · 실제 발송 아님</Text><Text style={styles.title}>{notify?.title}{notify?.remindMin?`까지 ${notify.remindMin}분`:' 시작 시간이에요'}</Text><Text style={styles.message}>{notify?(notify.reminderMessage||reminderMessages[categoryKey(notify.category)]):''}</Text><Choice label="확인" onPress={()=>setNotify(null)}/>
 </View></View></Modal></ScrollView>;
}
const styles=StyleSheet.create({page:{width:'100%',maxWidth:900,padding:24},heading:{fontSize:26,color:colors.textDark,fontWeight:'700',marginBottom:12},card:{padding:22,marginVertical:9,backgroundColor:'#FFFAF4',borderWidth:1,borderColor:'#E5D8CB',borderRadius:18,gap:8},title:{fontSize:18,fontWeight:'600',color:colors.textDark},muted:{fontSize:13,lineHeight:22,color:colors.warmGray},overlay:{flex:1,backgroundColor:'#0006',justifyContent:'center',alignItems:'center',padding:24},dialog:{width:'100%',maxWidth:440,backgroundColor:colors.cream,borderRadius:24,padding:28,gap:12},message:{fontSize:16,lineHeight:26,color:colors.textDark}});

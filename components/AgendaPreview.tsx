import {Text,View,StyleSheet} from 'react-native';
import DateTimeField from './DateTimeField';
import {Choice,repeatLabels} from './ScheduleControls';
import {useStoredEvents} from '../utils/useStoredEvents';
import {loadRules,categoryKey} from '../utils/scheduleAdapter';
import {addDays,categories,stamp,describeRule,actionLabels} from '../utils/scheduler';
import {colors} from '../constants/colors';
import {getCategory} from '../utils/categoryStore';
import {useCategories} from '../utils/useCategories';
export function AgendaPreview({date,onDate,onRules,onCalendar}:{date:string;onDate:(d:string)=>void;onRules:()=>void;onCalendar:()=>void}){
  const userCategories=useCategories();
  const events=useStoredEvents().filter(e=>!e.cancelledAt),rules=loadRules();
  const daily=events.filter(e=>e.startDate<=date&&e.endDate>=date).sort((a,b)=>a.time.localeCompare(b.time));
  return <View style={styles.column}><View style={styles.panel}>
    <Text style={styles.heading}>나의 캘린더</Text>
    <View style={styles.row}><Choice label="이전 날" onPress={()=>onDate(addDays(date,-1))}/><Choice label="다음 날" onPress={()=>onDate(addDays(date,1))}/></View>
    <DateTimeField label="캘린더 날짜 이동" kind="date" value={date} onChange={d=>{if(d)onDate(d);}}/>
    <View style={styles.row}>{Array.from({length:7},(_,i)=>addDays(date,i-3)).map(d=><Choice key={d} label={`${Number(d.slice(-2))}${events.some(e=>e.startDate<=d&&e.endDate>=d)?' ·':''}`} selected={d===date} onPress={()=>onDate(d)}/>)}</View>
    {daily.map(e=>{const userCategory=getCategory(e.category,userCategories);return <View key={e.id} style={[styles.event,{borderLeftColor:userCategory?.color||({exercise:'#81A894',work:'#8E9DBA',study:'#D3AF77',health:'#AF90BB',personal:'#D98773'})[categoryKey(e.category)]}]}>
      <View style={styles.categoryLine}><View style={[styles.categoryDot,{backgroundColor:userCategory?.color||'#B9ADA2'}]}/><Text style={styles.label}>{userCategory?userCategory.label:categories[categoryKey(e.category)]} · {e.time?`${e.time}–${new Date(stamp(e.startDate,e.time)+e.durationMin*60000).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false})}`:'시간 미정'}</Text></View>
      <Text style={styles.title}>{e.title}</Text>
      {e.place&&<Text style={styles.label}>장소: {e.place.name}</Text>}
      {e.aliasTerm&&<Text style={styles.label}>개인 사전 · {e.aliasTerm} → {e.aliasMeaning||e.place?.name}</Text>}
      {e.recurrence&&<Text style={styles.label}>↻ {repeatLabels[e.recurrence.frequency]} 반복</Text>}
      {e.time?<Text style={styles.label}>알림 {e.remindMin}분 전</Text>:<Text style={styles.label}>시간 미정이라 알림 없음</Text>}
      {!!e.ruleExceptions?.length&&<Text style={styles.label}>이번 일정만 규칙 예외 적용</Text>}
      {!!e.reminderMessage&&<Text style={styles.label}>{e.reminderMessage}</Text>}
    </View>})}
    {!daily.length&&<Text style={styles.empty}>등록된 일정이 없어요. 여유 있는 하루를 계획해 보세요.</Text>}
    <Text style={styles.label}>{daily.length}개 일정 · 한국 시간</Text><Choice label="전체 캘린더 보기" onPress={onCalendar}/>
  </View><View style={styles.panel}><Text style={styles.heading}>지금 적용 중인 규칙</Text>
    <Text style={styles.label}>일정 사이 {rules.gap}분 여유 · {actionLabels[rules.actions?.gap||'suggest']}</Text><Text style={styles.label}>운동은 {rules.exerciseEnd}시 전에 끝내기</Text><Text style={styles.label}>{rules.weekendWork?'주말 업무 쉬기':'주말 업무 일정 허용'}</Text>
    {(rules.items||[]).filter(r=>r.enabled).map(r=><Text key={r.id} style={styles.label}>{describeRule(r)} · {['auto','reminder'].includes(r.type)?'자동 적용':actionLabels[r.action]}</Text>)}<Choice label="규칙 설정" onPress={onRules}/>
  </View></View>;
}
const styles=StyleSheet.create({column:{gap:18},panel:{backgroundColor:'#FFFAF4',borderRadius:18,borderWidth:1,borderColor:'#E5D8CB',padding:20},heading:{fontSize:18,fontWeight:'600',color:colors.textDark,marginBottom:12},row:{flexDirection:'row',flexWrap:'wrap',gap:6,marginVertical:10},event:{borderLeftWidth:3,padding:13,borderRadius:10,backgroundColor:'#F6EEE4',marginVertical:7},categoryLine:{flexDirection:'row',alignItems:'center',gap:6},categoryDot:{width:9,height:9,borderRadius:5,flexShrink:0},label:{fontSize:12,color:colors.warmGray,lineHeight:21},title:{fontSize:15,fontWeight:'600',color:colors.textDark,marginVertical:4},empty:{paddingVertical:25,color:colors.warmGray,lineHeight:22}});

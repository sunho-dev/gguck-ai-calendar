import {Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {colors} from '../constants/colors';
import type {Recurrence, Schedule} from '../utils/scheduler';
import {addDays,stamp} from '../utils/scheduler';
import {repeatLabels,recurrenceFor,type RepeatMode} from '../utils/recurrenceSelection';
export {repeatLabels,recurrenceFor,type RepeatMode} from '../utils/recurrenceSelection';

export function Choice({label,selected,onPress,disabled=false}:{label:string;selected?:boolean;onPress:()=>void;disabled?:boolean}) {
  return <Pressable accessibilityRole="button" accessibilityState={{selected,disabled}} disabled={disabled} onPress={onPress} style={[controlStyles.choice,selected&&controlStyles.selected,disabled&&{opacity:.45}]}><Text style={{color:selected?colors.white:colors.textDark}}>{label}</Text></Pressable>;
}
export function RepeatChoices({value,onChange,disabled=false}:{value:RepeatMode;onChange:(mode:RepeatMode)=>void;disabled?:boolean}) {
  return <View style={controlStyles.row}>{Object.entries(repeatLabels).map(([key,label])=><Choice key={key} label={label} selected={key===value} disabled={disabled} onPress={()=>onChange(key as RepeatMode)}/>)}</View>;
}
export function RepeatFields({draft,onChange,disabled=false}:{draft:Schedule;onChange:(value:Partial<Schedule>)=>void;disabled?:boolean}) {
  const r=draft.recurrence;
  const update=(patch:Partial<Recurrence>)=>{if(r)onChange({recurrence:{...r,...patch}});};
  return <View style={controlStyles.section}>
    <Text style={controlStyles.heading}>반복 설정</Text>
    <RepeatChoices value={r?.frequency||'none'} disabled={disabled} onChange={mode=>onChange({recurrence:recurrenceFor(mode,draft.date,r)})}/>
    {r&&<>
      <View style={controlStyles.row}>{[4,12].map(weeks=><Choice key={weeks} label={`${weeks}주 동안`} disabled={disabled||!Number.isFinite(stamp(draft.date,'12:00'))} onPress={()=>update({until:addDays(draft.date,weeks*7-1)})}/>)}</View>
      {r.frequency==='weekly'&&<><Text style={controlStyles.label}>반복 요일</Text><View style={controlStyles.row}>{[1,2,3,4,5,6,0].map(day=><Choice key={day} label={'일월화수목금토'[day]+'요일'} selected={r.days.includes(day)} disabled={disabled} onPress={()=>update({days:r.days.includes(day)?r.days.filter(n=>n!==day):[...r.days,day]})}/>)}</View></>}
      {r.frequency==='monthly'&&<><Text style={controlStyles.label}>매월 반복 날짜 (1~31일)</Text><TextInput accessibilityLabel="매월 반복 날짜" editable={!disabled} keyboardType="number-pad" value={String(r.monthDay??'')} onChangeText={value=>update({monthDay:Number(value)})} style={controlStyles.input}/><Text style={controlStyles.label}>해당 날짜가 없는 달은 건너뛰어요.</Text></>}
    </>}
  </View>;
}
export const controlStyles=StyleSheet.create({row:{flexDirection:'row',flexWrap:'wrap',gap:8,marginVertical:8},choice:{paddingVertical:9,paddingHorizontal:12,borderRadius:10,backgroundColor:'#F0E4D8',borderWidth:1,borderColor:'#E4D3C2'},selected:{backgroundColor:colors.terracotta,borderColor:colors.terracotta},section:{marginVertical:12},heading:{fontSize:16,fontWeight:'600',color:colors.textDark},label:{fontSize:13,color:colors.warmGray,marginVertical:8},input:{backgroundColor:colors.white,borderWidth:1,borderColor:'#E4D3C2',borderRadius:10,padding:12}});

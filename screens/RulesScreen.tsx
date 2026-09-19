import {useEffect,useState} from 'react';
import {ScrollView,Text,TextInput,Switch,View,Modal,StyleSheet} from 'react-native';
import {categories,actionLabels,type RuleAction,type Rules} from '../utils/scheduler';
import {RuleComposer} from '../components/RuleComposer';
import {loadRules,saveRules,categoryKey} from '../utils/scheduleAdapter';
import {Choice,controlStyles} from '../components/ScheduleControls';
import {getPlaceAliases,savePlaceAlias,deletePlaceAlias} from '../utils/placeAliasStore';
import type {PlaceAlias} from '../types/schema';
import {colors} from '../constants/colors';
export function RulesScreen(){
 const [rules,setRules]=useState(loadRules),[aliases,setAliases]=useState<PlaceAlias[]>([]),[notice,setNotice]=useState(''),[edit,setEdit]=useState<PlaceAlias|null>(null),[busy,setBusy]=useState(false);
 useEffect(()=>{getPlaceAliases().then(setAliases).catch(()=>setNotice('개인 사전을 불러오지 못했어요.'));},[]);
 function change(next:Rules){try{saveRules(next);setRules(next);setNotice('자동 저장됐어요. 새 일정부터 적용돼요.');return true;}catch{setNotice('저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.');return false;}}
 async function mutate(action:()=>Promise<unknown>){if(busy)return;setBusy(true);try{await action();setAliases(await getPlaceAliases());setNotice('개인 사전을 저장했어요.');}catch{setNotice('개인 사전을 저장하지 못했어요.');}finally{setBusy(false);}}
 return <ScrollView style={styles.page}><Text style={styles.heading}>내 하루에는, 내 규칙.</Text><Text style={styles.help}>선택하면 바로 저장돼요. 일정 검사와 추천에 적용할 나만의 규칙을 정해요.</Text>
 <Text accessibilityLiveRegion="polite" style={styles.help}>{notice}</Text>
 <View style={styles.panel}><RuleComposer rules={rules} onChange={change}/></View>
 <View style={styles.panel}><Text style={styles.title}>일정 보호 규칙</Text><Text style={styles.label}>일정 사이 여유 시간</Text>
 <View style={controlStyles.row}>{[0,15,30,60].map(gap=><Choice key={gap} label={`${gap}분 여유`} selected={rules.gap===gap} onPress={()=>change({...rules,gap})}/>)}</View>
 <Text style={styles.label}>운동을 마치는 시간</Text><View style={controlStyles.row}>{[20,21,22,23].map(exerciseEnd=><Choice key={exerciseEnd} label={`${exerciseEnd}시`} selected={rules.exerciseEnd===exerciseEnd} onPress={()=>change({...rules,exerciseEnd})}/>)}</View>
 <View style={controlStyles.row}><Switch accessibilityLabel="주말 업무 차단" value={rules.weekendWork} onValueChange={weekendWork=>void change({...rules,weekendWork})}/><Text style={styles.label}>주말에는 업무 쉬기</Text></View>
 {Object.entries({overlap:'일정 겹침',gap:'일정 사이 여유',category:'운동 시간',weekend:'주말 업무'}).map(([key,title])=><View key={key}><Text style={styles.label}>{title} 발생 시</Text><View style={controlStyles.row}>{Object.entries(actionLabels).map(([action,label])=><Choice key={action} label={label} selected={(rules.actions?.[key]||'suggest')===action} onPress={()=>change({...rules,actions:{...rules.actions,[key]:action as RuleAction}})}/>)}</View></View>)}
 <View style={controlStyles.row}><Switch accessibilityLabel="등록 전 항상 확인" value={!rules.auto} onValueChange={v=>void change({...rules,auto:!v})}/><Text>등록 전 항상 확인 (바로 등록 규칙은 예외)</Text></View>
 <Text style={styles.help}>과거 시각·잘못된 날짜는 예외 등록할 수 없어요. 생활 규칙은 이번만 예외를 선택할 수 있어요.</Text></View>
 <View style={styles.panel}><Text style={styles.title}>개인 사전</Text><Text style={styles.help}>뜻 수정·삭제는 이후 입력에 적용돼요. 기존 일정은 그대로예요.</Text>
 {!aliases.length&&<Text style={styles.help}>아직 기억한 표현이 없어요. ‘종숲’ 같은 나만의 표현을 알려주세요.</Text>}
 {aliases.map(a=><View key={a.alias} style={styles.alias}><Text style={styles.label}>{a.alias} → {a.name}</Text><Text style={styles.help}>{categories[categoryKey(a.category||'personal')]} · {a.address||'주소 미지정'}</Text><View style={controlStyles.row}><Choice label={`${a.alias} 뜻 수정`} disabled={busy} onPress={()=>setEdit(a)}/><Choice label={`${a.alias} 기억 삭제`} disabled={busy} onPress={()=>void mutate(()=>deletePlaceAlias(a.alias))}/></View></View>)}</View>

 <Modal visible={!!edit} transparent onRequestClose={()=>{if(!busy)setEdit(null);}}><View style={styles.overlay}><View style={styles.dialog}>
 {edit&&<><Text style={styles.title}>‘{edit.alias}’ 뜻 수정</Text><Text style={styles.label}>뜻 / 전체 이름</Text><TextInput style={controlStyles.input} accessibilityLabel="별칭 뜻" editable={!busy} value={edit.name} onChangeText={name=>setEdit({...edit,name})}/><Text style={styles.label}>주소 (선택)</Text><TextInput style={controlStyles.input} accessibilityLabel="별칭 주소" editable={!busy} value={edit.address||''} onChangeText={address=>setEdit({...edit,address})}/>
 <View style={controlStyles.row}>{Object.entries(categories).map(([key,label])=><Choice key={key} label={label} selected={categoryKey(edit.category||'personal')===key} disabled={busy} onPress={()=>setEdit({...edit,category:key})}/>)}</View>
 <Choice label="사전 수정 저장" disabled={busy||!edit.name.trim()} onPress={()=>void mutate(async()=>{await savePlaceAlias({...edit,name:edit.name.trim()});setEdit(null);})}/><Choice label="닫기" disabled={busy} onPress={()=>setEdit(null)}/></>}
 </View></View></Modal></ScrollView>;
}
const styles=StyleSheet.create({page:{width:'100%',maxWidth:1050,padding:24},heading:{fontSize:28,fontWeight:'700',color:colors.textDark},title:{fontSize:19,fontWeight:'600',color:colors.textDark,marginBottom:10},label:{fontSize:15,color:colors.textDark,marginVertical:8},help:{fontSize:13,color:colors.warmGray,lineHeight:22,marginVertical:8},panel:{borderRadius:18,borderWidth:1,borderColor:'#E5D8CB',backgroundColor:'#FFFAF4',padding:24,marginVertical:10},alias:{paddingVertical:10,borderBottomWidth:1,borderColor:'#E5D8CB'},overlay:{flex:1,backgroundColor:'#0006',alignItems:'center',justifyContent:'center',padding:24},dialog:{width:'100%',maxWidth:500,backgroundColor:colors.cream,borderRadius:20,padding:24,gap:8}});

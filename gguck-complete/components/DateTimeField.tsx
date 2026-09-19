import {TextInput} from 'react-native';
import {controlStyles} from './ScheduleControls';
export interface DateTimeFieldProps {label:string;value:string;onChange:(value:string)=>void;kind:'date'|'time';disabled?:boolean}
export default function DateTimeField({label,value,onChange,disabled}:DateTimeFieldProps){return <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} editable={!disabled} style={controlStyles.input}/>;}

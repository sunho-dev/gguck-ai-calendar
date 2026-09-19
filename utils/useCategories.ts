import {useEffect,useState} from 'react';
import {loadCategories} from './categoryStore';

export function useCategories(){
 const [categories,setCategories]=useState(()=>loadCategories());
 useEffect(()=>{
  if(typeof window==='undefined')return;
  const refresh=()=>setCategories(loadCategories());
  window.addEventListener('gguck-categories-changed',refresh);
  window.addEventListener('storage',refresh);
  return()=>{window.removeEventListener('gguck-categories-changed',refresh);window.removeEventListener('storage',refresh);};
 },[]);
 return categories;
}

import {ALL,IDX} from './music-data.js';
import {handFor} from './editor.js';
export function drawNotes(layer,stage,song,beat,skip){
  layer.innerHTML="";
  const hitY=stage.clientHeight-82,ppb=hitY/8,lw=stage.clientWidth/ALL.length;
  song.notes.forEach(n=>{
    if(n.type==="rest"||(skip&&skip.has(n.id)))return;
    const s=Number(n.start),d=Number(n.duration),delta=s-beat,i=IDX[n.note];
    if(i===undefined||delta>8||delta<-d)return;
    const chord=song.notes.filter(o=>o.type!=="rest"&&Number(o.start)===s).length>1;
    const b=document.createElement("div");
    b.className="falling-note"+(chord?" chord":"");
    b.style.cssText=`left:${i*lw+1}px;width:${Math.max(5,lw-2)}px;height:${Math.max(12,d*ppb)}px;top:${hitY-delta*ppb-d*ppb}px`;
    b.style.background=["#4f46e5","#0891b2","#b45309","#be185d"][handFor(n.note,song.handMode)-1];b.textContent="손 "+handFor(n.note,song.handMode);layer.appendChild(b);
  });
}
export const maxBeatOf=song=>song.notes.length?Math.max(...song.notes.map(n=>Number(n.start)+Number(n.duration))):0;

// The audio scheduler runs independently from drawing frames.
export function scheduleAhead(song,startAt,now,scheduled,play,horizon=.25){
 const beatSec=60/(Number(song.tempo)||120);
 song.notes.forEach((note,index)=>{if(note.type==='rest'||scheduled.has(index))return;const when=startAt+Number(note.start)*beatSec;if(when>now+horizon)return;scheduled.add(index);const duration=Math.max(.08,Number(note.duration)*beatSec);if(when+duration<now)return;play(note.note,duration,song.instrument,when)});
}

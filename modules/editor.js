import {IDX} from './music-data.js?v=b4c9e4deef97';
export function handFor(note,mode){const index=IDX[note];if(mode==='one')return 1;if(mode==='four')return Math.min(4,Math.floor(index/9)+1);return index<18?1:2}
export function validateHands(notes,mode){const starts=new Map();for(const n of notes){if(n.type==='rest')continue;const key=n.start+':'+handFor(n.note,mode);starts.set(key,(starts.get(key)||0)+1);if(starts.get(key)>5)throw new Error('한 손은 같은 박에 최대 5개 음을 연주할 수 있습니다. 손 모드나 화음을 조정하세요.')}return true}
export function normalizeSong(d){
 if(!d||typeof d!=='object'||!Array.isArray(d.notes)||d.notes.length>5000)throw new Error('음표 배열이 필요합니다 (최대 5,000개).');
 const mode=['one','two','four'].includes(d.handMode)?d.handMode:'two';
 const song={title:String(d.title||'가져온 음악').slice(0,100),instrument:['piano','violin','guitar','drum'].includes(d.instrument)?d.instrument:'piano',handMode:mode,tempo:Math.max(30,Math.min(300,Number(d.tempo)||120)),notes:d.notes.map(n=>{const start=Number(n.start??n.beat??0),duration=Number(n.duration??1);if(!Number.isFinite(start)||start<0||start>10000||!Number.isFinite(duration)||duration<=0||duration>64||(n.type!=='rest'&&IDX[n.note]===undefined))throw new Error('음높이, 시작 박 또는 길이가 잘못되었습니다.');return{id:crypto.randomUUID(),type:n.type==='rest'?'rest':'note',start,duration,...(n.type==='rest'?{}:{note:n.note})}})};validateHands(song.notes,mode);return song;
}

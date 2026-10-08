import {ref,push,set,get,query,orderByChild,limitToLast} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
const ROOT='formwheelMusic';
export async function saveSong(db,uid,composition){const target=push(ref(db,`${ROOT}/songs`));await set(target,{...composition,songId:target.key,owner:uid,public:true,updatedAt:Date.now(),version:3});return target.key}
export async function listSongs(db){const snapshot=await get(ref(db,`${ROOT}/songs`)),songs=[];snapshot.forEach(c=>{const s=c.val();if(s)songs.push({...s,songId:c.key})});return songs.sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0))}
export async function saveScore(db,songId,score){if(!songId)return;await set(push(ref(db,`${ROOT}/scores/${songId}`)),{...score,createdAt:Date.now()})}
export async function listScores(db,songId){const snapshot=await get(query(ref(db,`${ROOT}/scores/${songId}`),orderByChild('score'),limitToLast(20))),scores=[];snapshot.forEach(c=>scores.push(c.val()));return scores.sort((a,b)=>(b.score||0)-(a.score||0))}

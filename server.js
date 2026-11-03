const http=require('http'),fs=require('fs'),path=require('path'),{WebSocketServer}=require('ws');
const PUB=path.join(__dirname,'public'),DIR=process.env.DATA_DIR||path.join(__dirname,'data'),FILE=path.join(DIR,'db.json');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.webmanifest':'application/manifest+json','.json':'application/json'};
const LIMIT=108,WIN_NICK='Танос';
const NICKS={
 1:['Чайка','Осёл','Крыса','Таракан','Пельмень','Тапок','Бройлер','Хомяк в колесе','Сосиска','Картошка фри','Голубь с помойки','Сонная муха'],
 2:['Баран','Индюк','Утка','Курица','Ленивец','Сурок','Кабачок','Пингвин'],
 3:['Енот','Шакал','Скунс','Бобёр','Кабан','Барсук','Гиена'],
 4:['Халк','Шрек','Тор','Локи','Груут'],
 5:['Человек-паук','Бэтмен','Флэш','Робин'],
 6:['Железный человек','Капитан Америка','Супермен'],
 7:['Доктор Стрэндж','Чёрная пантера','Аквамен'],
 8:['Дэдпул','Росомаха','Джон Уик'],
 9:['Терминатор','Рэмбо','Брюс Ли']};
const rnd=n=>Math.random()*n|0;
const pickNick=(place,used)=>{const pool=NICKS[Math.min(place,9)],free=pool.filter(n=>!used.includes(n)),a=free.length?free:pool;return a[rnd(a.length)]};

let db={rooms:{}};
try{db=Object.assign(db,JSON.parse(fs.readFileSync(FILE,'utf8')))}catch{}
let tm=0;
const save=()=>{clearTimeout(tm);tm=setTimeout(()=>{try{fs.mkdirSync(DIR,{recursive:true});fs.writeFileSync(FILE+'.tmp',JSON.stringify(db));fs.renameSync(FILE+'.tmp',FILE)}catch(e){console.error(e)}},500)};

const srv=http.createServer((q,s)=>{
  let pathname;
  try { pathname=decodeURIComponent(new URL(q.url||'/', 'http://localhost').pathname); }
  catch { s.writeHead(400,{'Content-Type':'text/plain; charset=utf-8'}); return s.end('Bad request'); }
  if(pathname==='/health'){
    s.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});
    return s.end('ok');
  }
  if(pathname==='/') pathname='/index.html';
  const file=path.resolve(PUB, '.'+pathname);
  if(file!==PUB && !file.startsWith(PUB+path.sep)){
    s.writeHead(403,{'Content-Type':'text/plain; charset=utf-8'}); return s.end('Forbidden');
  }
  fs.readFile(file,(err,data)=>{
    if(err){
      s.writeHead(err.code==='ENOENT'?404:500,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});
      return s.end(err.code==='ENOENT'?'Not found':'Server error');
    }
    const ext=path.extname(file).toLowerCase();
    const mime={...MIME,'.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.ico':'image/x-icon'};
    s.writeHead(200,{'Content-Type':mime[ext]||'application/octet-stream','Cache-Control':(ext==='.html'||ext==='.js'||ext==='.webmanifest')?'no-store':'public, max-age=86400'});
    s.end(data);
  });
});
const wss=new WebSocketServer({server:srv,maxPayload:262144});

const alive=r=>r.players.filter(p=>!p.out);
const roundNo=r=>Math.min(...alive(r).map(p=>p.scores.length))+1;
const np=(id,name)=>({id,name,score:0,startScore:0,lateJoin:false,scores:[],out:false,place:null,nick:null,outRound:null});
const code4=()=>{let c;do c=String(1000+rnd(9000));while(db.rooms[c]);return c};
const bc=c=>{const r=db.rooms[c];if(r)wss.clients.forEach(w=>{if(w.code===c&&w.readyState===1)w.send(JSON.stringify({t:'room',room:r}))})};
const touch=r=>{r.updatedAt=Date.now();save()};
const num=x=>typeof x==='number'&&isFinite(x);

function clean(s,uid){ // проверка и пересборка комнаты при восстановлении
  if(!s||typeof s!=='object'||!/^\d{4}$/.test(String(s.code))||!Array.isArray(s.players)||s.players.length<1||s.players.length>10)return null;
  const players=[];
  for(const p of s.players){
    if(!p||typeof p.id!=='string'||typeof p.name!=='string'||!Array.isArray(p.scores)||!p.scores.every(num))return null;
    const scores=p.scores.slice(0,200);
    const startScore=num(p.startScore)?Math.max(0,p.startScore):0;
    players.push({id:p.id.slice(0,60),name:p.name.slice(0,14),score:startScore+scores.reduce((a,b)=>a+b,0),startScore,lateJoin:!!p.lateJoin,scores,out:!!p.out,
      place:num(p.place)?p.place:null,nick:typeof p.nick==='string'?p.nick.slice(0,30):null,outRound:num(p.outRound)?p.outRound:null});
  }
  if(!players.some(p=>p.id===uid)||!players.some(p=>p.id===s.creator))return null;
  const status=['lobby','active','done'].includes(s.status)?s.status:'lobby';
  const w=status==='done'?players.find(p=>p.id===(s.winner&&s.winner.id)):null;
  return {code:String(s.code),creator:s.creator,status,createdAt:num(s.createdAt)?s.createdAt:Date.now(),updatedAt:Date.now(),players,winner:w?{id:w.id,name:w.name}:null};
}

wss.on('connection',ws=>{
  ws.isAlive=true;ws.on('pong',()=>ws.isAlive=true);
  ws.on('message',raw=>{
    let m;try{m=JSON.parse(raw)}catch{return}
    if(m.t==='hello'){ws.uid=String(m.uid||'').slice(0,60);if(!ws.uid)return ws.close();ws.send('{"t":"hello"}');return}
    if(!ws.uid)return;
    const ack=(err,extra)=>{if(ws.readyState===1)ws.send(JSON.stringify({t:'ack',id:m.id,err:err||undefined,...extra}))};
    const nm=()=>String(m.name||'').trim().slice(0,14)||'Игрок';
    const code=String(m.code||ws.code||'');

    if(m.t==='create'){
      const c=code4(),now=Date.now();
      db.rooms[c]={code:c,creator:ws.uid,status:'lobby',createdAt:now,updatedAt:now,players:[np(ws.uid,nm())],winner:null};
      ws.code=c;save();ack(null,{code:c});bc(c);return}
    if(m.t==='unsub'){ws.code=null;return ack()}
    if(m.t==='restore'){
      const s=clean(m.room,ws.uid);if(!s)return ack('bad');
      if(!db.rooms[s.code]){db.rooms[s.code]=s;save()}
      ws.code=s.code;ack();bc(s.code);return}

    const r=db.rooms[code];
    if(!r){if(m.t==='sub')ws.send(JSON.stringify({t:'gone',code}));return ack('Комната не найдена')}
    const me=r.players.find(p=>p.id===ws.uid),isCreator=r.creator===ws.uid;

    switch(m.t){
      case'sub':ws.code=code;ack();ws.send(JSON.stringify({t:'room',room:r}));return;
      case'join':{
        if(!me){
          if(!['lobby','active'].includes(r.status))return ack('Игра уже окончена');
          if(r.players.length>=10)return ack('В комнате уже 10 игроков');
          const n=nm();if(r.players.some(p=>p.name.toLowerCase()===n.toLowerCase()))return ack('Такое имя уже есть, выбери другое');
          const newcomer=np(ws.uid,n);
          if(r.status==='active'){
            // Поздний участник начинает с текущего максимального счёта и входит в текущий раунд.
            newcomer.startScore=Math.max(0,...r.players.map(p=>p.score));
            newcomer.score=newcomer.startScore;
            newcomer.lateJoin=true;
            newcomer.scores=Array(Math.max(0,roundNo(r)-1)).fill(0);
          }
          r.players.push(newcomer);touch(r)}
        ws.code=code;ack();bc(code);return}
      case'start':
        if(!isCreator||r.status!=='lobby')return ack('Нельзя');
        if(r.players.length<2)return ack('Нужно минимум 2 игрока');
        r.status='active';break;
      case'score':{
        const pts=m.pts;
        if(!me||me.out||r.status!=='active')return ack('Нельзя');
        if(!Number.isInteger(pts)||pts<-100||pts>300)return ack('Некорректное число');
        if(me.scores.length!==roundNo(r)-1)return ack('Ты уже записал очки в этом раунде');
        me.scores.push(pts);me.score+=pts;
        if(me.score>=LIMIT){
          me.out=true;me.place=r.players.filter(p=>p.out).length;me.outRound=me.scores.length;
          me.nick=pickNick(me.place,r.players.map(p=>p.nick).filter(Boolean))}
        const al=alive(r);
        if(al.length===1){al[0].nick=WIN_NICK;r.status='done';r.winner={id:al[0].id,name:al[0].name}}
        break}
      case'fix':
        if(!me||me.out||r.status!=='active'||!me.scores.length||me.scores.length!==roundNo(r))return ack('Раунд уже закрыт');
        me.score-=me.scores.pop();break;
      case'again':
        if(!isCreator||r.status!=='done')return ack('Нельзя');
        r.players=r.players.map(p=>np(p.id,p.name));r.status='lobby';r.winner=null;break;
      case'del':
        if(!isCreator)return ack('Нельзя');
        delete db.rooms[code];save();
        wss.clients.forEach(w=>{if(w.code===code&&w.readyState===1){w.send(JSON.stringify({t:'gone',code,deleted:true}));w.code=null}});
        return ack();
      default:return;
    }
    touch(r);ack();bc(code);
  });
});
setInterval(()=>{wss.clients.forEach(c=>{if(!c.isAlive)return c.terminate();c.isAlive=false;c.ping()});
  const old=Date.now()-3*864e5;let ch=false;for(const c in db.rooms)if((db.rooms[c].updatedAt||0)<old){delete db.rooms[c];ch=true}if(ch)save()},25000);
const PORT=process.env.PORT||3000;
srv.listen(PORT,'0.0.0.0',()=>console.log('Schet108 on :'+PORT));

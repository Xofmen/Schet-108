const http=require('http'),fs=require('fs'),path=require('path'),{WebSocketServer}=require('ws');
const PUB=path.join(__dirname,'public'),DIR=process.env.DATA_DIR||path.join(__dirname,'data'),FILE=path.join(DIR,'db.json');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.webmanifest':'application/manifest+json','.json':'application/json','.svg':'image/svg+xml','.ico':'image/x-icon'};
let db={tables:{},roster:{}};
try{db=Object.assign(db,JSON.parse(fs.readFileSync(FILE,'utf8')))}catch{}
let tm=0;
const save=()=>{clearTimeout(tm);tm=setTimeout(()=>{try{fs.mkdirSync(DIR,{recursive:true});fs.writeFileSync(FILE+'.tmp',JSON.stringify(db));fs.renameSync(FILE+'.tmp',FILE)}catch(e){console.error(e)}},500)};

const srv=http.createServer((q,s)=>{
  let u;try{u=decodeURIComponent((q.url||'/').split('?')[0])}catch{s.writeHead(400);return s.end()}
  if(u==='/health')return s.end('ok');
  if(u.endsWith('/'))u+='index.html';
  const f=path.normalize(path.join(PUB,u));
  if(!f.startsWith(PUB+path.sep)){s.writeHead(403);return s.end()}
  fs.readFile(f,(e,d)=>{
    if(e){s.writeHead(404);return s.end('Not found')}
    const ext=path.extname(f);
    s.writeHead(200,{'Content-Type':MIME[ext]||'application/octet-stream','Cache-Control':ext==='.png'?'public, max-age=86400':'no-cache'});
    s.end(d)});
});

const wss=new WebSocketServer({server:srv,maxPayload:262144});
const items=c=>Object.entries(db[c]).map(([id,v])=>({id,...v}))
  .sort(c==='tables'?(a,b)=>(b.createdAt||0)-(a.createdAt||0):(a,b)=>(b.lastUsed||0)-(a.lastUsed||0)).slice(0,c==='tables'?200:100);
const snap=(ws,c)=>{if(ws.readyState===1)ws.send(JSON.stringify({t:'snap',c,items:items(c)}))};
const all=c=>wss.clients.forEach(ws=>{if(ws.uid)snap(ws,c)});
const BAD=['__proto__','constructor','prototype'];

wss.on('connection',ws=>{
  ws.isAlive=true;ws.on('pong',()=>ws.isAlive=true);
  ws.on('message',raw=>{
    let m;try{m=JSON.parse(raw)}catch{return}
    if(m.t==='hello'){
      ws.uid=String(m.uid||'').slice(0,60);if(!ws.uid)return ws.close();
      ws.send(JSON.stringify({t:'hello'}));snap(ws,'tables');snap(ws,'roster');return}
    if(!ws.uid)return;
    const ack=err=>{if(ws.readyState===1)ws.send(JSON.stringify({t:'ack',id:m.id,err}))};
    const key=String(m.key||'');
    if(!key||key.length>150||BAD.includes(key))return ack('bad key');
    const c=m.t==='del'?'tables':m.c;
    if(c!=='tables'&&c!=='roster')return ack('bad');
    if(m.t==='set'){
      const v=m.v;if(!v||typeof v!=='object'||Array.isArray(v))return ack('bad');
      if(c==='tables'){
        const old=db.tables[key];
        if(old?(old.creator!==ws.uid||v.creator!==old.creator):v.creator!==ws.uid)return ack('forbidden')}
      db[c][key]=v;
    }else if(m.t==='del'){
      const old=db.tables[key];if(old&&old.creator!==ws.uid)return ack('forbidden');
      delete db.tables[key];
    }else return;
    save();ack();all(c);
  });
});
setInterval(()=>wss.clients.forEach(c=>{if(!c.isAlive)return c.terminate();c.isAlive=false;c.ping()}),25000);
const PORT=process.env.PORT||3000;
srv.listen(PORT,'0.0.0.0',()=>console.log('Schet108 on :'+PORT));

import fs from 'fs';
import path from 'path';

const STORE_PATH = path.join(process.cwd(), 'tab-sessions.json');

function readStore(){
  try {
    if(!fs.existsSync(STORE_PATH)) return { tabs: [], lastSeq: 0 };
    const data = JSON.parse(fs.readFileSync(STORE_PATH,'utf8'));
    if(!Array.isArray(data.tabs)) data.tabs = [];
    if(typeof data.lastSeq !== 'number') data.lastSeq = data.tabs.length;
    return data;
  } catch { return { tabs: [], lastSeq: 0 }; }
}

function writeStore(store){
  try { fs.writeFileSync(STORE_PATH, JSON.stringify(store,null,2)); return true; } catch { return false; }
}

export async function GET(){
  const store = readStore();
  // If empty create a default one (lazy init)
  if(store.tabs.length === 0){
    store.lastSeq = 1;
    store.tabs = [{ id: 'tab-1', title: 'Tab 1' }];
    writeStore(store);
  }
  return new Response(JSON.stringify({ tabs: store.tabs }),{ status:200, headers:{ 'Content-Type':'application/json' }});
}

export async function POST(req){
  const body = await req.json().catch(()=>({}));
  const action = body.action || 'create';
  const store = readStore();
  if(action === 'create'){
    store.lastSeq += 1;
    const id = `tab-${store.lastSeq}`;
    const title = body.title && body.title.trim() ? body.title.trim() : `Tab ${store.lastSeq}`;
    store.tabs.push({ id, title });
    writeStore(store);
    return new Response(JSON.stringify({ ok:true, tab:{ id, title }, tabs: store.tabs }),{ status:201, headers:{ 'Content-Type':'application/json' }});
  }
  if(action === 'rename'){
    const { id, title } = body;
    if(!id || !title) return new Response(JSON.stringify({ error:'Missing id/title'}),{ status:400 });
    const tab = store.tabs.find(t=>t.id===id);
    if(!tab) return new Response(JSON.stringify({ error:'Not found'}),{ status:404 });
    tab.title = title.trim();
    writeStore(store);
    return new Response(JSON.stringify({ ok:true, tab, tabs:store.tabs }),{ status:200, headers:{ 'Content-Type':'application/json' }});
  }
  if(action === 'set-active'){
    // optional future field; currently just acknowledge
    return new Response(JSON.stringify({ ok:true }),{ status:200, headers:{ 'Content-Type':'application/json' }});
  }
  return new Response(JSON.stringify({ error:'Unsupported action'}),{ status:400 });
}

export async function DELETE(req){
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if(!id) return new Response(JSON.stringify({ error:'Missing id'}),{ status:400 });
  const store = readStore();
  const idx = store.tabs.findIndex(t=>t.id===id);
  if(idx === -1) return new Response(JSON.stringify({ error:'Not found'}),{ status:404 });
  if(store.tabs.length === 1) return new Response(JSON.stringify({ error:'Cannot remove last tab'}),{ status:400 });
  store.tabs.splice(idx,1);
  writeStore(store);
  return new Response(JSON.stringify({ ok:true, tabs:store.tabs }),{ status:200, headers:{ 'Content-Type':'application/json' }});
}

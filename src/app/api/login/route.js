import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

function currentAuthConfig(){
  let user = process.env.AUTH_USER || 'admin';
  let hash = process.env.AUTH_PASS_HASH || null;
  let plain = process.env.AUTH_PASS_PLAIN || null;
  // Strip wrapping quotes if present (safety in case server started before parser fix)
  if (plain && ((plain.startsWith('"') && plain.endsWith('"')) || (plain.startsWith("'") && plain.endsWith("'")))) {
    plain = plain.slice(1,-1);
  }
  return { user, hash, plain };
}

async function verifyPassword(input, { hash, plain }){
  if(hash){
    try { return await bcrypt.compare(input, hash); } catch { return false; }
  }
  if(plain){
    return input === plain;
  }
  return false;
}

export async function POST(req){
  try{
  const { u, p } = await req.json();
  const { user: USER, hash: PASS_HASH, plain: PASS_PLAIN } = currentAuthConfig();
    if(process.env.DEBUG_AUTH === '1'){
      console.log('[AUTH DEBUG] Incoming body', { uLength: u ? u.length : 0, pLength: p ? p.length : 0, sampleUser: u });
    }
    if(!u || !p) return NextResponse.json({ error:'Missing creds' }, { status:400 });
    const debug = process.env.DEBUG_AUTH === '1';
    // If no password config at all, always surface a clearer error (not just invalid creds)
    if(!PASS_HASH && !PASS_PLAIN){
      if(debug){ console.log('[AUTH DEBUG] No PASS_HASH or PASS_PLAIN configured'); }
      return NextResponse.json({ error:'Auth not configured', reason:'no_password_env', expectedUser: USER }, { status:500 });
    }
  if(u !== USER){
      if(debug){ console.log('[AUTH DEBUG] Username mismatch', { provided:u, expected:USER }); }
      return NextResponse.json({ error:'Invalid credentials', reason:'username_mismatch' }, { status:401 });
    }
  const ok = await verifyPassword(p, { hash: PASS_HASH, plain: PASS_PLAIN });
    if(ok){
      const res = NextResponse.json({ ok:true });
      res.cookies.set('auth','1',{
        httpOnly:true,
        sameSite:'lax',
        path:'/',
        maxAge:60*60*12,
        secure: process.env.NODE_ENV === 'production'
      });
      return res;
    }
  if(debug){ console.log('[AUTH DEBUG] Password mismatch', { hasHash: !!PASS_HASH, hasPlain: !!PASS_PLAIN }); }
  return NextResponse.json({ error:'Invalid credentials', reason:'password_mismatch' }, { status:401 });
  }catch(e){
    return NextResponse.json({ error:'Bad request' }, { status:400 });
  }
}

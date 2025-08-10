import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

// Expect env vars: AUTH_USER, AUTH_PASS_HASH (bcrypt hash) OR AUTH_PASS_PLAIN (fallback dev)
const USER = process.env.AUTH_USER || 'admin';
const PASS_HASH = process.env.AUTH_PASS_HASH || null;
const PASS_PLAIN = process.env.AUTH_PASS_PLAIN || null; // only for initial setup (not recommended prod)

async function verifyPassword(input){
  if(PASS_HASH){
    try { return await bcrypt.compare(input, PASS_HASH); } catch { return false; }
  }
  if(PASS_PLAIN){
    return input === PASS_PLAIN;
  }
  return false;
}

export async function POST(req){
  try{
    const { u, p } = await req.json();
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
    const ok = await verifyPassword(p);
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

import { NextResponse } from 'next/server';

// Expose username so client can derive deterministic session id
const USER = process.env.AUTH_USER || 'admin';

export async function GET(req){
  const auth = req.headers.get('cookie')?.split(';').some(c=>c.trim().startsWith('auth=1'));
  if(auth) return NextResponse.json({ ok:true, user: USER });
  return NextResponse.json({ error:'unauth' }, { status:401 });
}

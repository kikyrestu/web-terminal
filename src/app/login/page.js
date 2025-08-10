'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage(){
  const [u,setU]=useState('');
  const [p,setP]=useState('');
  const [err,setErr]=useState('');
  const [caps,setCaps]=useState(false);
  const [showPass,setShowPass]=useState(false);
  const passRef=useRef(null);
  const router=useRouter();

  useEffect(()=>{
    const el = passRef.current;
    if(!el) return;
    const handler = (e)=>{
      // Some browsers rely on getModifierState; fall back to heuristic if absent
      if(typeof e.getModifierState === 'function'){
        setCaps(e.getModifierState('CapsLock'));
      }
    };
    el.addEventListener('keydown',handler);
    el.addEventListener('keyup',handler);
    el.addEventListener('focus',handler);
    el.addEventListener('blur',()=>setCaps(false));
    return ()=>{
      el.removeEventListener('keydown',handler);
      el.removeEventListener('keyup',handler);
      el.removeEventListener('focus',handler);
      el.removeEventListener('blur',()=>setCaps(false));
    };
  },[]);

  async function submit(e){
    e.preventDefault();
    setErr('');
    const res = await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({u,p})});
    if(res.ok){ router.push('/'); } else { const j=await res.json().catch(()=>({})); setErr(j.error||'Login failed'); }
  }
  return (<div className='min-h-screen flex items-center justify-center bg-black text-white'>
    <form onSubmit={submit} className='w-full max-w-xs space-y-4 bg-gray-900 p-6 rounded border border-gray-700'>
      <h1 className='text-lg font-semibold text-center'>Login</h1>
      <div>
        <label className='block text-xs mb-1'>Username</label>
        <input autoFocus value={u} onChange={e=>setU(e.target.value)} className='w-full px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm outline-none focus:border-green-500' />
      </div>
      <div>
        <label className='block text-xs mb-1 flex items-center justify-between'>
          <span>Password</span>
          {caps && <span className='text-[10px] text-yellow-400 animate-pulse'>CapsLock aktif</span>}
        </label>
        <div className='relative'>
          <input ref={passRef} type={showPass?'text':'password'} value={p} onChange={e=>setP(e.target.value)} className='w-full pr-14 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm outline-none focus:border-green-500' />
          <button type='button' onClick={()=>setShowPass(s=>!s)} className='absolute inset-y-0 right-0 px-2 text-[10px] text-gray-400 hover:text-gray-200'>{showPass?'Hide':'Show'}</button>
        </div>
      </div>
      {err && <div className='text-red-400 text-xs'>⚠ {err} {err.toLowerCase().includes('invalid') && 'Periksa username / password & status CapsLock.'}</div>}
      <button type='submit' className='w-full py-1.5 bg-green-600 hover:bg-green-500 rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed' disabled={!u||!p}>Masuk</button>
      <p className='text-[10px] text-gray-500 text-center'>Gunakan kredensial yang sudah ditentukan. Password sensitif terhadap huruf besar / kecil.</p>
    </form>
  </div>);
}

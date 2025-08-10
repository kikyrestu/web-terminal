import { NextResponse } from 'next/server';

export function middleware(request) {
  // Only apply this middleware to WebSocket upgrade requests
  if (request.headers.get('connection')?.includes('upgrade') &&
      request.headers.get('upgrade') === 'websocket') {
    return NextResponse.next();
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: '/api/socketio',
};

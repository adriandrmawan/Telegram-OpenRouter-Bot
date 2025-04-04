import { authenticate, initAuth } from '../../src/auth.js';

export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    initAuth(env);
    
    const authResult = await authenticate(request);
    if (!authResult.authenticated) {
      return new Response(JSON.stringify({ 
        authenticated: false,
        error: authResult.error 
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ 
      authenticated: true,
      userId: authResult.userId
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Check-auth function error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

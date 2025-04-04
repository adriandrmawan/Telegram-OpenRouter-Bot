import { parse } from 'cookie';
import { addToBlacklist, initAuth } from '../../src/auth.js';

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    initAuth(env);
    
    const cookieHeader = request.headers.get('Cookie') || '';
    const cookies = parse(cookieHeader);
    const accessToken = cookies.access_token;
    const refreshToken = cookies.refresh_token;

    if (accessToken) {
      await addToBlacklist(accessToken, 3600); // Blacklist for 1 hour (matches access token expiry)
    }
    if (refreshToken) {
      await addToBlacklist(refreshToken, 604800); // Blacklist for 7 days (matches refresh token expiry)
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': [
          'access_token=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0',
          'refresh_token=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'
        ]
      },
    });
  } catch (error) {
    console.error('Logout function error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

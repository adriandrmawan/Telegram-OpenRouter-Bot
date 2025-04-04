import { hashPassword, verifyPassword, generateAccessToken, generateRefreshToken, initAuth } from '../../src/auth.js';

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    initAuth(env); // Initialize auth with environment
    
    const { username, password } = await request.json();
    const validUsername = env.DASHBOARD_USERNAME;
    const validPasswordHash = env.DASHBOARD_PASSWORD_HASH;

    if (!validUsername || !validPasswordHash) {
      return new Response(JSON.stringify({ error: 'Server not configured properly' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (username !== validUsername || !(await verifyPassword(password, validPasswordHash))) {
      return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const accessToken = generateAccessToken(username);
    const refreshToken = generateRefreshToken(username);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': [
          `access_token=${accessToken}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=3600`,
          `refresh_token=${refreshToken}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`
        ]
      },
    });
  } catch (error) {
    console.error('Login function error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { parse } from 'cookie';

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-me';
const ACCESS_TOKEN_EXPIRY = '1h';
const REFRESH_TOKEN_EXPIRY = '7d';

// KV namespace for token blacklist
let TOKEN_BLACKLIST;

export function initAuth(env) {
    TOKEN_BLACKLIST = env.TOKEN_BLACKLIST;
}

// Password hashing
export async function hashPassword(password) {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
}

export async function verifyPassword(password, hash) {
    return bcrypt.compare(password, hash);
}

// JWT Token functions
export function generateAccessToken(userId) {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

export function generateRefreshToken(userId) {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
}

export function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (err) {
        return null;
    }
}

// Middleware to check JWT
export async function authenticate(request) {
    const cookieHeader = request.headers.get('Cookie') || '';
    const cookies = parse(cookieHeader);
    const token = cookies.access_token;

    if (!token) return { authenticated: false, error: 'No token provided' };

    // Check blacklist
    const isBlacklisted = await TOKEN_BLACKLIST.get(`blacklist_${token}`);
    if (isBlacklisted) return { authenticated: false, error: 'Token revoked' };

    const decoded = verifyToken(token);
    if (!decoded) return { authenticated: false, error: 'Invalid token' };

    return { authenticated: true, userId: decoded.userId };
}

// Token blacklist management
export async function addToBlacklist(token, expiry) {
    await TOKEN_BLACKLIST.put(`blacklist_${token}`, 'revoked', {
        expirationTtl: expiry
    });
}

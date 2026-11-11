import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import './db.js';

const SECRET = process.env.JWT_SECRET || '';
if (!SECRET) {
  console.error('Set JWT_SECRET in backend/.env');
  process.exit(1);
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function checkPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const next = scryptSync(password, salt, 64);
  const prev = Buffer.from(hash, 'hex');
  return next.length === prev.length && timingSafeEqual(next, prev);
}

export function signToken(user) {
  return jwt.sign({ userId: user.id, farmId: user.farm_id, username: user.username }, SECRET, {
    expiresIn: '30d',
  });
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Sign in again' });
  }
}

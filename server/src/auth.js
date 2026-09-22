import { db } from './db.js';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ ok: false, error: '请先登录' });

  const row = db.prepare(`
    SELECT s.token, s.expires_at, u.id AS user_id, u.username, u.name, u.role, u.active
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ?
  `).get(token);

  if (!row || !row.active) return res.status(401).json({ ok: false, error: '登录已失效' });
  if (new Date(row.expires_at) < new Date()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return res.status(401).json({ ok: false, error: '登录已过期' });
  }

  req.user = row;
  req.token = token;
  next();
}

export function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ ok: false, error: '需要管理员权限' });
  }
  next();
}

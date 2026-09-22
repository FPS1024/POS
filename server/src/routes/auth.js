import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { db, hashPassword } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ ok: false, error: '请输入账号和密码' });

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username).trim());
  if (!user || !user.active) return res.status(401).json({ ok: false, error: '账号或密码错误' });

  const { hash } = hashPassword(String(password), user.salt);
  if (hash !== user.password_hash) return res.status(401).json({ ok: false, error: '账号或密码错误' });

  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, user.id, expires);

  res.json({
    ok: true,
    data: {
      token,
      user: { id: user.id, username: user.username, name: user.name, role: user.role }
    }
  });
});

router.post('/logout', requireAuth, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(req.token);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ ok: true, data: req.user });
});

export default router;

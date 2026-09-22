import { Router } from 'express';
import { db, hashPassword, now } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  res.json({ ok: true, data: Object.fromEntries(rows.map((r) => [r.key, r.value])) });
});

router.put('/', requireAdmin, (req, res) => {
  const allowed = new Set(['store_name', 'store_address', 'store_phone', 'tax_rate', 'tax_enabled', 'currency', 'receipt_footer', 'points_rate', 'points_enabled']);
  const update = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const [key, value] of Object.entries(req.body || {})) {
    if (allowed.has(key)) update.run(key, String(value));
  }
  const rows = db.prepare('SELECT key, value FROM settings').all();
  res.json({ ok: true, data: Object.fromEntries(rows.map((r) => [r.key, r.value])) });
});

router.get('/users', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT id, username, name, role, active, created_at FROM users ORDER BY id').all();
  res.json({ ok: true, data: rows });
});

router.post('/users', requireAdmin, (req, res) => {
  const { username, password, name = '', role = 'cashier' } = req.body || {};
  if (!username || !password) return res.status(400).json({ ok: false, error: '账号和密码必填' });
  if (String(password).length < 6) return res.status(400).json({ ok: false, error: '密码至少 6 位' });
  try {
    const { salt, hash } = hashPassword(String(password));
    const result = db.prepare('INSERT INTO users (username, password_hash, salt, name, role) VALUES (?, ?, ?, ?, ?)')
      .run(String(username).trim(), hash, salt, String(name), role === 'admin' ? 'admin' : 'cashier');
    const row = db.prepare('SELECT id, username, name, role, active, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.json({ ok: true, data: row });
  } catch {
    res.status(400).json({ ok: false, error: '账号已存在' });
  }
});

router.put('/users/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ ok: false, error: '用户不存在' });
  const { username, name, role, active, password } = req.body || {};
  try {
    db.prepare('UPDATE users SET username = ?, name = ?, role = ?, active = ? WHERE id = ?').run(
      username !== undefined ? String(username).trim() : existing.username,
      name !== undefined ? String(name) : existing.name,
      role !== undefined ? (role === 'admin' ? 'admin' : 'cashier') : existing.role,
      active !== undefined ? (active ? 1 : 0) : existing.active,
      id
    );
    if (password) {
      if (String(password).length < 6) return res.status(400).json({ ok: false, error: '密码至少 6 位' });
      const { salt, hash } = hashPassword(String(password));
      db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?').run(hash, salt, id);
    }
    res.json({ ok: true, data: db.prepare('SELECT id, username, name, role, active, created_at FROM users WHERE id = ?').get(id) });
  } catch {
    res.status(400).json({ ok: false, error: '账号已存在' });
  }
});

router.delete('/users/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.user_id) return res.status(400).json({ ok: false, error: '不能删除当前登录账号' });
  const admins = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND active = 1").get().c;
  const target = db.prepare('SELECT role, active FROM users WHERE id = ?').get(id);
  if (target?.role === 'admin' && target.active && admins <= 1) {
    return res.status(400).json({ ok: false, error: '系统至少需要保留一个管理员' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  res.json({ ok: true });
});

export default router;

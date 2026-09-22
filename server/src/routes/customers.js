import { Router } from 'express';
import { db, round2 } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const { search = '', page = '1', pageSize = '100' } = req.query;
  const params = [];
  let where = '1 = 1';
  if (search) {
    where = '(name LIKE ? OR phone LIKE ?)';
    const like = `%${String(search).trim()}%`;
    params.push(like, like);
  }
  const total = db.prepare(`SELECT COUNT(*) AS c FROM customers WHERE ${where}`).get(...params).c;
  const offset = (Math.max(1, Number(page)) - 1) * Math.max(1, Number(pageSize));
  const rows = db.prepare(`
    SELECT * FROM customers WHERE ${where}
    ORDER BY points DESC, id DESC LIMIT ? OFFSET ?
  `).all(...params, Number(pageSize), offset);
  res.json({ ok: true, data: { items: rows, total } });
});

router.post('/lookup', (req, res) => {
  const { phone } = req.body || {};
  if (!phone) return res.json({ ok: true, data: null });
  const row = db.prepare('SELECT * FROM customers WHERE phone = ?').get(String(phone).trim());
  res.json({ ok: true, data: row || null });
});

router.post('/', (req, res) => {
  const { name, phone, points = 0, level = '普通会员', note = '' } = req.body || {};
  if (!name) return res.status(400).json({ ok: false, error: '请输入会员姓名' });
  try {
    const result = db.prepare('INSERT INTO customers (name, phone, points, level, note) VALUES (?, ?, ?, ?, ?)')
      .run(String(name).trim(), String(phone || '').trim(), Number(points) || 0, String(level), String(note || ''));
    const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(result.lastInsertRowid);
    res.json({ ok: true, data: row });
  } catch {
    res.status(400).json({ ok: false, error: '手机号已存在' });
  }
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ ok: false, error: '会员不存在' });
  const { name, phone, points, level, note } = req.body || {};
  try {
    db.prepare('UPDATE customers SET name = ?, phone = ?, points = ?, level = ?, note = ? WHERE id = ?').run(
      name !== undefined ? String(name).trim() : existing.name,
      phone !== undefined ? String(phone).trim() : existing.phone,
      points !== undefined ? Number(points) : existing.points,
      level !== undefined ? String(level) : existing.level,
      note !== undefined ? String(note) : existing.note,
      id
    );
    res.json({ ok: true, data: db.prepare('SELECT * FROM customers WHERE id = ?').get(id) });
  } catch {
    res.status(400).json({ ok: false, error: '手机号已存在' });
  }
});

router.post('/:id/points', (req, res) => {
  const id = Number(req.params.id);
  const { delta, reason = '手动调整' } = req.body || {};
  const value = Number(delta) || 0;
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  if (!customer) return res.status(404).json({ ok: false, error: '会员不存在' });
  const nextPoints = Math.max(0, round2(Number(customer.points) + value));
  db.prepare('UPDATE customers SET points = ? WHERE id = ?').run(nextPoints, id);
  res.json({ ok: true, data: { id, points: nextPoints, delta: value, reason } });
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM customers WHERE id = ?').run(id);
  res.json({ ok: true });
});

export default router;

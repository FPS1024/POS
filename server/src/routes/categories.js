import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS product_count
    FROM categories c
    ORDER BY c.sort, c.id
  `).all();
  res.json({ ok: true, data: rows });
});

router.post('/', (req, res) => {
  const { name, color = '#2f6fed', sort = 0 } = req.body || {};
  if (!name) return res.status(400).json({ ok: false, error: '请输入分类名称' });
  try {
    const result = db.prepare('INSERT INTO categories (name, color, sort) VALUES (?, ?, ?)').run(String(name).trim(), color, Number(sort) || 0);
    const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid);
    res.json({ ok: true, data: row });
  } catch {
    res.status(400).json({ ok: false, error: '分类名称已存在' });
  }
});

router.put('/:id', (req, res) => {
  const { name, color, sort } = req.body || {};
  const id = Number(req.params.id);
  if (!name) return res.status(400).json({ ok: false, error: '请输入分类名称' });
  try {
    db.prepare('UPDATE categories SET name = ?, color = ?, sort = ? WHERE id = ?').run(String(name).trim(), color, Number(sort) || 0, id);
    const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ ok: false, error: '分类不存在' });
    res.json({ ok: true, data: row });
  } catch {
    res.status(400).json({ ok: false, error: '分类名称已存在' });
  }
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const used = db.prepare('SELECT COUNT(*) AS c FROM products WHERE category_id = ?').get(id).c;
  if (used > 0) return res.status(400).json({ ok: false, error: `该分类下还有 ${used} 个商品，无法删除` });
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  res.json({ ok: true });
});

export default router;

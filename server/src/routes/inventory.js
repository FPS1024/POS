import { Router } from 'express';
import { db, round2, now } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();
router.use(requireAuth);

router.get('/summary', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) AS c FROM products WHERE active = 1').get().c;
  const stockValue = db.prepare('SELECT COALESCE(SUM(stock * cost_price), 0) AS v FROM products WHERE active = 1').get().v;
  const lowStock = db.prepare('SELECT COUNT(*) AS c FROM products WHERE active = 1 AND stock <= low_stock').get().c;
  const sellableValue = db.prepare('SELECT COALESCE(SUM(stock * sale_price), 0) AS v FROM products WHERE active = 1').get().v;
  res.json({ ok: true, data: { total, stockValue: round2(stockValue), sellableValue: round2(sellableValue), lowStock } });
});

router.get('/movements', (req, res) => {
  const { productId = '', type = '', page = '1', pageSize = '50' } = req.query;
  const where = ['1 = 1'];
  const params = [];
  if (productId) {
    where.push('m.product_id = ?');
    params.push(Number(productId));
  }
  if (type) {
    where.push('m.type = ?');
    params.push(type);
  }
  const offset = (Math.max(1, Number(page)) - 1) * Math.max(1, Number(pageSize));
  const total = db.prepare(`SELECT COUNT(*) AS c FROM stock_movements m WHERE ${where.join(' AND ')}`).get(...params).c;
  const rows = db.prepare(`
    SELECT m.*, u.name AS operator_name
    FROM stock_movements m LEFT JOIN users u ON u.id = m.operator_id
    WHERE ${where.join(' AND ')}
    ORDER BY m.id DESC LIMIT ? OFFSET ?
  `).all(...params, Number(pageSize), offset);
  res.json({ ok: true, data: { items: rows, total } });
});

router.get('/low-stock', (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, c.name AS category_name, c.color AS category_color
    FROM products p LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.active = 1 AND p.stock <= p.low_stock
    ORDER BY (p.stock - p.low_stock), p.id
  `).all();
  res.json({ ok: true, data: rows });
});

router.post('/adjust', (req, res) => {
  const { product_id, type = 'adjust_in', quantity = 0, reason = '' } = req.body || {};
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(Number(product_id));
  if (!product) return res.status(404).json({ ok: false, error: '商品不存在' });
  const qty = Number(quantity);
  if (!qty || qty <= 0) return res.status(400).json({ ok: false, error: '调整数量必须大于 0' });

  const addTypes = new Set(['purchase', 'adjust_in', 'gift']);
  const subtractTypes = new Set(['adjust_out', 'damage', 'loss']);
  const sign = addTypes.has(type) ? 1 : subtractTypes.has(type) ? -1 : null;
  if (sign === null) return res.status(400).json({ ok: false, error: '无效的调整类型' });
  if (sign < 0 && Number(product.stock) < qty) return res.status(400).json({ ok: false, error: `${product.name} 当前库存不足` });

  const before = Number(product.stock);
  const after = round2(before + sign * qty);
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE products SET stock = ?, updated_at = ? WHERE id = ?').run(after, now(), product.id);
    db.prepare(`
      INSERT INTO stock_movements (product_id, product_name, type, quantity, before_stock, after_stock, reason, operator_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(product.id, product.name, type, sign * qty, before, after, String(reason || ''), req.user.user_id);
    db.exec('COMMIT');
    res.json({ ok: true, data: { product_id: product.id, before, after, quantity: sign * qty, type } });
  } catch (err) {
    db.exec('ROLLBACK');
    console.error(err);
    res.status(500).json({ ok: false, error: '库存调整失败' });
  }
});

export default router;

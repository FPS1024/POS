import { Router } from 'express';
import { db, round2 } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();
router.use(requireAuth);

function dateRange(from, to, days) {
  const end = to || new Date().toISOString().slice(0, 10);
  const start = from || new Date(Date.now() - (Number(days) - 1) * 86400000).toISOString().slice(0, 10);
  return { start, end };
}

router.get('/summary', (req, res) => {
  const { from = '', to = '' } = req.query;
  const { start, end } = dateRange(from, to, 1);
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN status = 'completed' THEN total ELSE 0 END), 0) AS revenue,
      COUNT(CASE WHEN status = 'completed' THEN 1 END) AS orders,
      COALESCE(AVG(CASE WHEN status = 'completed' THEN total END), 0) AS avg_order,
      COALESCE(SUM(CASE WHEN status = 'completed' THEN subtotal END), 0) AS gross,
      COALESCE(SUM(CASE WHEN status = 'refunded' THEN total END), 0) AS refunds,
      COUNT(CASE WHEN status = 'refunded' THEN 1 END) AS refund_orders
    FROM orders WHERE date(created_at) BETWEEN ? AND ?
  `).get(start, end);
  const items = db.prepare(`
    SELECT COALESCE(SUM(oi.quantity), 0) AS c
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.status = 'completed' AND date(o.created_at) BETWEEN ? AND ?
  `).get(start, end).c;
  res.json({
    ok: true,
    data: {
      revenue: round2(row.revenue),
      orders: row.orders,
      avgOrder: round2(row.avg_order || 0),
      gross: round2(row.gross),
      refunds: round2(row.refunds),
      refundOrders: row.refund_orders,
      itemsSold: items
    }
  });
});

router.get('/trend', (req, res) => {
  const { from = '', to = '', days = '7' } = req.query;
  const { start, end } = dateRange(from, to, days);
  const rows = db.prepare(`
    SELECT date(created_at) AS d, COALESCE(SUM(total), 0) AS total, COUNT(*) AS cnt
    FROM orders WHERE status = 'completed' AND date(created_at) BETWEEN ? AND ?
    GROUP BY d
  `).all(start, end);
  const map = new Map(rows.map((r) => [r.d, r]));
  const daysList = [];
  const cursor = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  while (cursor <= endDate) {
    const key = cursor.toISOString().slice(0, 10);
    const row = map.get(key);
    daysList.push({ date: key, total: round2(row?.total || 0), count: row?.cnt || 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  res.json({ ok: true, data: daysList });
});

router.get('/top-products', (req, res) => {
  const { from = '', to = '', days = '7', limit = '8' } = req.query;
  const { start, end } = dateRange(from, to, days);
  const rows = db.prepare(`
    SELECT oi.product_id, oi.product_name, SUM(oi.quantity) AS qty, SUM(oi.line_total) AS amount
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.status = 'completed' AND date(o.created_at) BETWEEN ? AND ?
    GROUP BY oi.product_id, oi.product_name
    ORDER BY qty DESC LIMIT ?
  `).all(start, end, Number(limit) || 8);
  res.json({ ok: true, data: rows.map((r) => ({ ...r, qty: Number(r.qty), amount: round2(r.amount) })) });
});

router.get('/category-sales', (req, res) => {
  const { from = '', to = '', days = '7' } = req.query;
  const { start, end } = dateRange(from, to, days);
  const rows = db.prepare(`
    SELECT c.id, c.name, c.color, COALESCE(SUM(oi.quantity), 0) AS qty, COALESCE(SUM(oi.line_total), 0) AS amount
    FROM categories c
    LEFT JOIN products p ON p.category_id = c.id
    LEFT JOIN order_items oi ON oi.product_id = p.id
    LEFT JOIN orders o ON o.id = oi.order_id AND o.status = 'completed' AND date(o.created_at) BETWEEN ? AND ?
    GROUP BY c.id
    HAVING SUM(oi.line_total) > 0
    ORDER BY amount DESC
  `).all(start, end);
  res.json({ ok: true, data: rows.map((r) => ({ ...r, qty: Number(r.qty), amount: round2(r.amount) })) });
});

export default router;

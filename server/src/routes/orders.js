import { Router } from 'express';
import { db, round2, now, makeOrderNo, jsonParse } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();
router.use(requireAuth);

function getOrderDetail(id) {
  const order = db.prepare(`
    SELECT o.*, c.name AS customer_name, c.phone AS customer_phone, u.name AS operator_name
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    LEFT JOIN users u ON u.id = o.operator_id
    WHERE o.id = ?
  `).get(id);
  if (!order) return null;
  order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(id);
  return order;
}

router.get('/', (req, res) => {
  const { search = '', status = '', payment = '', from = '', to = '', page = '1', pageSize = '50' } = req.query;
  const where = ['1 = 1'];
  const params = [];
  if (status) {
    where.push('o.status = ?');
    params.push(status);
  }
  if (payment) {
    where.push('o.payment_method = ?');
    params.push(payment);
  }
  if (from) {
    where.push('date(o.created_at) >= ?');
    params.push(from);
  }
  if (to) {
    where.push('date(o.created_at) <= ?');
    params.push(to);
  }
  if (search) {
    where.push('(o.order_no LIKE ? OR c.name LIKE ? OR c.phone LIKE ? OR o.note LIKE ?)');
    const like = `%${String(search).trim()}%`;
    params.push(like, like, like, like);
  }
  const offset = (Math.max(1, Number(page)) - 1) * Math.max(1, Number(pageSize));
  const total = db.prepare(`SELECT COUNT(*) AS c FROM orders o LEFT JOIN customers c ON c.id = o.customer_id WHERE ${where.join(' AND ')}`).get(...params).c;
  const rows = db.prepare(`
    SELECT o.*, c.name AS customer_name, c.phone AS customer_phone, u.name AS operator_name,
      (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    LEFT JOIN users u ON u.id = o.operator_id
    WHERE ${where.join(' AND ')}
    ORDER BY o.id DESC LIMIT ? OFFSET ?
  `).all(...params, Number(pageSize), offset);
  res.json({ ok: true, data: { items: rows, total } });
});

router.get('/holds', (req, res) => {
  const rows = db.prepare(`
    SELECT h.*, c.name AS customer_name FROM hold_orders h
    LEFT JOIN customers c ON c.id = h.customer_id
    ORDER BY h.id DESC
  `).all();
  res.json({ ok: true, data: rows });
});

router.post('/holds', (req, res) => {
  const { customer_id, note = '', items = [] } = req.body || {};
  if (!items.length) return res.status(400).json({ ok: false, error: '挂单内容为空' });
  const result = db.prepare('INSERT INTO hold_orders (order_no, customer_id, note, items) VALUES (?, ?, ?, ?)')
    .run(makeOrderNo(), customer_id || null, String(note || ''), JSON.stringify(items));
  const row = db.prepare('SELECT * FROM hold_orders WHERE id = ?').get(result.lastInsertRowid);
  res.json({ ok: true, data: row });
});

router.post('/holds/:id/retrieve', (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM hold_orders WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ ok: false, error: '挂单不存在' });
  db.prepare('DELETE FROM hold_orders WHERE id = ?').run(id);
  res.json({ ok: true, data: { ...row, items: jsonParse(row.items, []) } });
});

router.delete('/holds/:id', (req, res) => {
  db.prepare('DELETE FROM hold_orders WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

router.post('/', (req, res) => {
  const { items = [], customer_id = null, discount_amount = 0, payment_method = 'cash', tendered = null, note = '' } = req.body || {};
  if (!items.length) return res.status(400).json({ ok: false, error: '购物车为空' });

  const settings = Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map((r) => [r.key, r.value]));
  const taxRate = Number(settings.tax_rate) || 0;
  const taxEnabled = settings.tax_enabled === '1';
  const pointsRate = Number(settings.points_rate) || 10;
  const pointsEnabled = settings.points_enabled === '1';
  const currency = settings.currency || '¥';

  const getProduct = db.prepare('SELECT * FROM products WHERE id = ?');
  const lineItems = [];
  let subtotal = 0;

  for (const line of items) {
    const product = getProduct.get(Number(line.product_id));
    if (!product || !product.active) return res.status(400).json({ ok: false, error: '存在无效商品，请刷新后重试' });
    const quantity = Number(line.quantity);
    if (!quantity || quantity <= 0) return res.status(400).json({ ok: false, error: `${product.name} 数量无效` });
    if (Number(product.stock) < quantity) {
      return res.status(400).json({ ok: false, error: `${product.name} 库存不足（剩余 ${product.stock} ${product.unit}）` });
    }
    const lineTotal = round2(product.sale_price * quantity);
    subtotal = round2(subtotal + lineTotal);
    lineItems.push({
      product_id: product.id,
      product_name: product.name,
      unit_price: round2(product.sale_price),
      quantity,
      line_total: lineTotal
    });
  }

  const discount = Math.min(Math.max(0, Number(discount_amount) || 0), subtotal);
  const taxable = round2(subtotal - discount);
  const taxAmount = taxEnabled ? round2(taxable * taxRate) : 0;
  const total = round2(taxable + taxAmount);
  const tenderedAmount = tendered === null || tendered === undefined ? total : Math.max(0, Number(tendered));
  const change = round2(Math.max(0, tenderedAmount - total));
  const pointsEarned = pointsEnabled && customer_id ? Math.floor(total / pointsRate) : 0;
  const orderNo = makeOrderNo();

  db.exec('BEGIN');
  try {
    const orderResult = db.prepare(`
      INSERT INTO orders (order_no, customer_id, subtotal, discount_amount, tax_amount, total, tendered, change_amount,
        points_earned, payment_method, status, operator_id, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?)
    `).run(orderNo, customer_id || null, subtotal, discount, taxAmount, total, tenderedAmount, change,
      pointsEarned, payment_method, req.user.user_id, String(note || ''));
    const orderId = orderResult.lastInsertRowid;

    const insertItem = db.prepare('INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity, line_total) VALUES (?, ?, ?, ?, ?, ?)');
    const updateStock = db.prepare('UPDATE products SET stock = stock - ?, updated_at = ? WHERE id = ?');
    const insertMovement = db.prepare(`
      INSERT INTO stock_movements (product_id, product_name, type, quantity, before_stock, after_stock, reason, order_id, operator_id)
      VALUES (?, ?, 'sale', ?, ?, ?, ?, ?, ?)
    `);
    for (const line of lineItems) {
      insertItem.run(orderId, line.product_id, line.product_name, line.unit_price, line.quantity, line.line_total);
      const before = getProduct.get(line.product_id).stock;
      updateStock.run(line.quantity, now(), line.product_id);
      const after = getProduct.get(line.product_id).stock;
      insertMovement.run(line.product_id, line.product_name, -line.quantity, before, after, `销售 ${orderNo}`, orderId, req.user.user_id);
    }

    if (customer_id && pointsEarned > 0) {
      db.prepare('UPDATE customers SET points = points + ? WHERE id = ?').run(pointsEarned, customer_id);
    }
    db.exec('COMMIT');
    res.json({ ok: true, data: { order: getOrderDetail(orderId), currency } });
  } catch (err) {
    db.exec('ROLLBACK');
    console.error(err);
    res.status(500).json({ ok: false, error: '保存订单失败，请重试' });
  }
});

router.get('/:id', (req, res) => {
  const order = getOrderDetail(Number(req.params.id));
  if (!order) return res.status(404).json({ ok: false, error: '订单不存在' });
  res.json({ ok: true, data: order });
});

router.post('/:id/refund', (req, res) => {
  const id = Number(req.params.id);
  const { method = 'cash', reason = '' } = req.body || {};
  const order = getOrderDetail(id);
  if (!order) return res.status(404).json({ ok: false, error: '订单不存在' });
  if (order.status === 'refunded') return res.status(400).json({ ok: false, error: '订单已退款' });

  db.exec('BEGIN');
  try {
    db.prepare(`
      UPDATE orders SET status = 'refunded', refund_method = ?, refunded_at = ?, note = ?
      WHERE id = ?
    `).run(method, now(), reason || order.note, id);

    const updateStock = db.prepare('UPDATE products SET stock = stock + ?, updated_at = ? WHERE id = ?');
    const insertMovement = db.prepare(`
      INSERT INTO stock_movements (product_id, product_name, type, quantity, before_stock, after_stock, reason, order_id, operator_id)
      VALUES (?, ?, 'refund', ?, ?, ?, ?, ?, ?)
    `);
    const getProduct = db.prepare('SELECT stock FROM products WHERE id = ?');
    for (const item of order.items) {
      const before = item.product_id ? getProduct.get(item.product_id)?.stock ?? 0 : 0;
      if (item.product_id) updateStock.run(item.quantity, now(), item.product_id);
      const after = item.product_id ? getProduct.get(item.product_id)?.stock ?? before : before;
      insertMovement.run(item.product_id || 0, item.product_name, item.quantity, before, after, `退款 ${order.order_no}`, id, req.user.user_id);
    }

    if (order.customer_id && order.points_earned > 0) {
      db.prepare('UPDATE customers SET points = MAX(0, points - ?) WHERE id = ?').run(order.points_earned, order.customer_id);
    }
    db.exec('COMMIT');
    res.json({ ok: true, data: getOrderDetail(id) });
  } catch (err) {
    db.exec('ROLLBACK');
    console.error(err);
    res.status(500).json({ ok: false, error: '退款失败，请重试' });
  }
});

export default router;

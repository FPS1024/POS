import { Router } from 'express';
import { db, round2, now } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();
router.use(requireAuth);

function serialize(row) {
  if (!row) return null;
  return {
    ...row,
    cost_price: round2(row.cost_price),
    sale_price: round2(row.sale_price),
    stock: Number(row.stock),
    low_stock: Number(row.low_stock)
  };
}

router.get('/', (req, res) => {
  const { search = '', categoryId = '', lowStock = '', active = '', page = '1', pageSize = '100' } = req.query;
  const where = ['1 = 1'];
  const params = [];

  if (search) {
    where.push('(p.name LIKE ? OR p.barcode LIKE ? OR p.sku LIKE ?)');
    const like = `%${String(search).trim()}%`;
    params.push(like, like, like);
  }
  if (categoryId) {
    where.push('p.category_id = ?');
    params.push(Number(categoryId));
  }
  if (lowStock === '1') {
    where.push('p.stock <= p.low_stock');
  }
  if (active === '1') where.push('p.active = 1');
  if (active === '0') where.push('p.active = 0');

  const offset = (Math.max(1, Number(page)) - 1) * Math.max(1, Number(pageSize));
  const total = db.prepare(`SELECT COUNT(*) AS c FROM products p WHERE ${where.join(' AND ')}`).get(...params).c;
  const rows = db.prepare(`
    SELECT p.*, c.name AS category_name, c.color AS category_color
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE ${where.join(' AND ')}
    ORDER BY p.active DESC, p.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, Number(pageSize), offset);

  res.json({ ok: true, data: { items: rows.map(serialize), total } });
});

router.get('/export', (req, res) => {
  const rows = db.prepare(`
    SELECT p.barcode, p.sku, p.name, c.name AS category_name, p.unit, p.cost_price, p.sale_price, p.stock, p.low_stock, p.active
    FROM products p LEFT JOIN categories c ON c.id = p.category_id
    ORDER BY p.id
  `).all();
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="products.csv"');
  const head = ['条码', 'SKU', '名称', '分类', '单位', '进价', '售价', '库存', '低库存阈值', '启用'];
  const lines = rows.map((r) => [
    r.barcode, r.sku, `"${String(r.name).replaceAll('"', '""')}"`, r.category_name || '',
    r.unit, r.cost_price, r.sale_price, r.stock, r.low_stock, r.active ? '是' : '否'
  ].join(','));
  res.send('\uFEFF' + [head.join(','), ...lines].join('\n'));
});

router.post('/import', (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) return res.status(400).json({ ok: false, error: '没有可导入的数据' });

  const findCat = db.prepare('SELECT id FROM categories WHERE name = ?');
  const createCat = db.prepare('INSERT INTO categories (name) VALUES (?)');
  const findProduct = db.prepare('SELECT id FROM products WHERE barcode = ?');
  const insert = db.prepare(`
    INSERT INTO products (barcode, sku, name, category_id, unit, cost_price, sale_price, stock, low_stock)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const update = db.prepare(`
    UPDATE products SET sku = ?, name = ?, category_id = ?, unit = ?, cost_price = ?, sale_price = ?, stock = ?, low_stock = ?, updated_at = ?
    WHERE id = ?
  `);

  let created = 0;
  let updatedCount = 0;
  let errors = 0;
  for (const item of items) {
    const barcode = String(item.barcode ?? '').trim();
    const name = String(item.name ?? '').trim();
    if (!barcode || !name) {
      errors += 1;
      continue;
    }
    let categoryId = null;
    if (item.category_name || item.category) {
      const catName = String(item.category_name || item.category).trim();
      let cat = findCat.get(catName);
      if (!cat) {
        const result = createCat.run(catName);
        cat = { id: result.lastInsertRowid };
      }
      categoryId = cat.id;
    }
    const existing = findProduct.get(barcode);
    const values = [
      String(item.sku ?? '').trim(),
      name,
      categoryId,
      String(item.unit || '件'),
      Number(item.cost_price) || 0,
      Number(item.sale_price) || 0,
      Number(item.stock) || 0,
      Number(item.low_stock) || 5
    ];
    if (existing) {
      update.run(...values, now(), existing.id);
      updatedCount += 1;
    } else {
      insert.run(barcode, ...values);
      created += 1;
    }
  }
  res.json({ ok: true, data: { created, updated: updatedCount, errors } });
});

router.post('/', (req, res) => {
  const { barcode, sku, name, category_id, unit, cost_price, sale_price, stock, low_stock } = req.body || {};
  if (!barcode || !name) return res.status(400).json({ ok: false, error: '条码和商品名称必填' });
  if (Number(sale_price) < 0 || Number(cost_price) < 0) return res.status(400).json({ ok: false, error: '价格不能为负数' });
  try {
    const result = db.prepare(`
      INSERT INTO products (barcode, sku, name, category_id, unit, cost_price, sale_price, stock, low_stock)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      String(barcode).trim(), String(sku || '').trim(), String(name).trim(),
      category_id ? Number(category_id) : null,
      String(unit || '件'), Number(cost_price) || 0, Number(sale_price) || 0,
      Number(stock) || 0, Number(low_stock) || 5
    );
    const row = db.prepare(`
      SELECT p.*, c.name AS category_name, c.color AS category_color
      FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = ?
    `).get(result.lastInsertRowid);
    res.json({ ok: true, data: serialize(row) });
  } catch {
    res.status(400).json({ ok: false, error: '条码已存在，请检查后重试' });
  }
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ ok: false, error: '商品不存在' });

  const { barcode, sku, name, category_id, unit, cost_price, sale_price, stock, low_stock, active } = req.body || {};
  const next = {
    barcode: barcode !== undefined ? String(barcode).trim() : existing.barcode,
    sku: sku !== undefined ? String(sku).trim() : existing.sku,
    name: name !== undefined ? String(name).trim() : existing.name,
    category_id: category_id !== undefined ? (category_id ? Number(category_id) : null) : existing.category_id,
    unit: unit !== undefined ? String(unit) : existing.unit,
    cost_price: cost_price !== undefined ? Number(cost_price) : existing.cost_price,
    sale_price: sale_price !== undefined ? Number(sale_price) : existing.sale_price,
    stock: stock !== undefined ? Number(stock) : existing.stock,
    low_stock: low_stock !== undefined ? Number(low_stock) : existing.low_stock,
    active: active !== undefined ? (active ? 1 : 0) : existing.active
  };
  if (!next.barcode || !next.name) return res.status(400).json({ ok: false, error: '条码和商品名称必填' });
  if (next.sale_price < 0 || next.cost_price < 0) return res.status(400).json({ ok: false, error: '价格不能为负数' });
  try {
    db.prepare(`
      UPDATE products SET barcode = ?, sku = ?, name = ?, category_id = ?, unit = ?, cost_price = ?,
      sale_price = ?, stock = ?, low_stock = ?, active = ?, updated_at = ?
      WHERE id = ?
    `).run(next.barcode, next.sku, next.name, next.category_id, next.unit, next.cost_price,
      next.sale_price, next.stock, next.low_stock, next.active, now(), id);
    const row = db.prepare(`
      SELECT p.*, c.name AS category_name, c.color AS category_color
      FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = ?
    `).get(id);
    res.json({ ok: true, data: serialize(row) });
  } catch {
    res.status(400).json({ ok: false, error: '条码已存在，请检查后重试' });
  }
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const used = db.prepare('SELECT COUNT(*) AS c FROM order_items WHERE product_id = ?').get(id).c;
  if (used > 0) {
    db.prepare('UPDATE products SET active = 0, updated_at = ? WHERE id = ?').run(now(), id);
    return res.json({ ok: true, data: { disabled: true, message: '商品已有历史交易，已改为停用' } });
  }
  db.prepare('DELETE FROM products WHERE id = ?').run(id);
  res.json({ ok: true, data: { deleted: true } });
});

export default router;

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, 'pos.db'));

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'cashier',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#2f6fed',
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  barcode TEXT NOT NULL UNIQUE,
  sku TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  category_id INTEGER REFERENCES categories(id),
  unit TEXT NOT NULL DEFAULT '件',
  cost_price REAL NOT NULL DEFAULT 0,
  sale_price REAL NOT NULL DEFAULT 0,
  stock REAL NOT NULL DEFAULT 0,
  low_stock REAL NOT NULL DEFAULT 5,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  points REAL NOT NULL DEFAULT 0,
  level TEXT NOT NULL DEFAULT '普通会员',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT NOT NULL UNIQUE,
  customer_id INTEGER REFERENCES customers(id),
  subtotal REAL NOT NULL DEFAULT 0,
  discount_amount REAL NOT NULL DEFAULT 0,
  tax_amount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  tendered REAL NOT NULL DEFAULT 0,
  change_amount REAL NOT NULL DEFAULT 0,
  points_earned REAL NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  status TEXT NOT NULL DEFAULT 'completed',
  operator_id INTEGER,
  note TEXT NOT NULL DEFAULT '',
  refund_method TEXT,
  refunded_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  product_id INTEGER REFERENCES products(id),
  product_name TEXT NOT NULL,
  unit_price REAL NOT NULL DEFAULT 0,
  quantity REAL NOT NULL DEFAULT 1,
  line_total REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL,
  quantity REAL NOT NULL,
  before_stock REAL NOT NULL DEFAULT 0,
  after_stock REAL NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  order_id INTEGER,
  operator_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS hold_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT NOT NULL UNIQUE,
  customer_id INTEGER,
  note TEXT NOT NULL DEFAULT '',
  items TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL
);
`);

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

export function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function now() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

export function jsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function makeOrderNo() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const rand = String(Math.floor(Math.random() * 900) + 100);
  return `POS${stamp}${rand}`;
}

function seed() {
  const categoryCount = db.prepare('SELECT COUNT(*) AS c FROM categories').get().c;
  if (categoryCount === 0) {
    const insertCategory = db.prepare('INSERT INTO categories (name, color, sort) VALUES (?, ?, ?)');
    const categories = [
      ['粮油调味', '#e8590c', 1],
      ['新鲜果蔬', '#2f9e44', 2],
      ['肉禽蛋品', '#e03131', 3],
      ['乳品烘焙', '#1971c2', 4],
      ['饮料酒水', '#0ca678', 5],
      ['休闲零食', '#f08c00', 6],
      ['日用百货', '#7048e8', 7],
      ['清洁纸品', '#099268', 8]
    ];
    for (const [name, color, sort] of categories) insertCategory.run(name, color, sort);
  }

  const productCount = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
  if (productCount === 0) {
    const getCategory = db.prepare('SELECT id FROM categories WHERE name = ?');
    const insertProduct = db.prepare(`
      INSERT INTO products (barcode, sku, name, category_id, unit, cost_price, sale_price, stock, low_stock)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const products = [
      ['6901234100011', 'SP-0001', '金龙鱼 大豆油 5L', '粮油调味', '桶', 52, 69.9, 86, 10],
      ['6901234100028', 'SP-0002', '海天 金标生抽 1.9L', '粮油调味', '瓶', 18.5, 26.9, 120, 20],
      ['6901234100035', 'SP-0003', '中盐 加碘精制盐 400g', '粮油调味', '袋', 1.8, 3.5, 240, 40],
      ['6901234100042', 'SP-0004', '恒顺 香醋 500ml', '粮油调味', '瓶', 5.2, 9.9, 68, 12],
      ['6901234100059', 'SP-0005', '福临门 大米 10kg', '粮油调味', '袋', 55, 69.9, 45, 8],
      ['6901234100066', 'SP-0006', '鲁花 花生油 5L', '粮油调味', '桶', 88, 119.9, 30, 6],
      ['6901234100073', 'SP-0007', '太太乐 鸡精 200g', '粮油调味', '袋', 7.8, 12.8, 95, 15],
      ['6901234100080', 'SP-0008', '挂面 鸡蛋面 900g', '粮油调味', '袋', 4.6, 7.9, 150, 25],
      ['6901234100097', 'SP-0009', '红富士 苹果 500g', '新鲜果蔬', '份', 3.8, 6.9, 64, 15],
      ['6901234100103', 'SP-0010', '海南香蕉 500g', '新鲜果蔬', '份', 2.4, 4.9, 70, 15],
      ['6901234100110', 'SP-0011', '云南蜜桔 500g', '新鲜果蔬', '份', 3.2, 5.8, 52, 12],
      ['6901234100127', 'SP-0012', '西红柿 500g', '新鲜果蔬', '份', 2.6, 5.2, 38, 10],
      ['6901234100134', 'SP-0013', '黄瓜 500g', '新鲜果蔬', '份', 2.1, 4.2, 44, 10],
      ['6901234100141', 'SP-0014', '土豆 500g', '新鲜果蔬', '份', 1.5, 3.2, 58, 12],
      ['6901234100158', 'SP-0015', '西兰花 400g', '新鲜果蔬', '份', 3.5, 6.5, 26, 8],
      ['6901234100165', 'SP-0016', '猪五花肉 500g', '肉禽蛋品', '份', 16, 24.8, 42, 10],
      ['6901234100172', 'SP-0017', '鸡胸肉 500g', '肉禽蛋品', '份', 9.8, 15.8, 48, 10],
      ['6901234100189', 'SP-0018', '土鸡蛋 10枚', '肉禽蛋品', '盒', 9.2, 15.9, 96, 20],
      ['6901234100196', 'SP-0019', '冷冻虾仁 400g', '肉禽蛋品', '袋', 25, 36.9, 24, 6],
      ['6901234100202', 'SP-0020', '纯牛奶 250ml*12', '乳品烘焙', '箱', 38, 49.9, 76, 15],
      ['6901234100219', 'SP-0021', '酸奶 原味 1kg', '乳品烘焙', '桶', 8.5, 13.9, 88, 18],
      ['6901234100226', 'SP-0022', '全麦切片面包 400g', '乳品烘焙', '袋', 5.5, 9.9, 32, 8],
      ['6901234100233', 'SP-0023', '黄油 200g', '乳品烘焙', '块', 12.5, 19.9, 40, 8],
      ['6901234100240', 'SP-0024', '农夫山泉 550ml*24', '饮料酒水', '箱', 32, 45.9, 110, 20],
      ['6901234100257', 'SP-0025', '可乐 330ml*12', '饮料酒水', '箱', 26, 38.9, 92, 15],
      ['6901234100264', 'SP-0026', '青岛啤酒 500ml*12', '饮料酒水', '箱', 38, 55.9, 34, 8],
      ['6901234100271', 'SP-0027', '鲜榨橙汁 1L', '饮料酒水', '瓶', 7.2, 12.9, 60, 12],
      ['6901234100288', 'SP-0028', '乐事 薯片 原味 70g', '休闲零食', '袋', 4.2, 8.5, 130, 20],
      ['6901234100295', 'SP-0029', '奥利奥 夹心饼干 97g', '休闲零食', '盒', 5.8, 11.9, 104, 18],
      ['6901234100301', 'SP-0030', '每日坚果 25g*7', '休闲零食', '盒', 15, 29.9, 66, 12],
      ['6901234100318', 'SP-0031', '辣条 大面筋 106g', '休闲零食', '袋', 1.8, 4.2, 180, 30],
      ['6901234100325', 'SP-0032', '趣多多 巧克力曲奇 95g', '休闲零食', '袋', 4.8, 9.9, 88, 15],
      ['6901234100332', 'SP-0033', '维达 抽纸 3层100抽*6', '清洁纸品', '提', 13.8, 23.9, 72, 12],
      ['6901234100349', 'SP-0034', '蓝月亮 洗衣液 2kg', '清洁纸品', '瓶', 22, 32.9, 48, 8],
      ['6901234100356', 'SP-0035', '洗洁精 柠檬 1.5kg', '清洁纸品', '瓶', 6.8, 11.8, 96, 15],
      ['6901234100363', 'SP-0036', '立白 肥皂 3块装', '清洁纸品', '组', 7.5, 12.9, 120, 20],
      ['6901234100370', 'SP-0037', '牙膏 薄荷味 180g', '日用百货', '支', 8.8, 15.9, 108, 18],
      ['6901234100387', 'SP-0038', '洗发水 去屑 750ml', '日用百货', '瓶', 26, 39.9, 40, 8],
      ['6901234100394', 'SP-0039', '沐浴露 清润 1L', '日用百货', '瓶', 18, 29.9, 45, 8],
      ['6901234100400', 'SP-0040', '保温杯 500ml', '日用百货', '个', 28, 49.9, 22, 5]
    ];
    for (const [barcode, sku, name, category, unit, cost, price, stock, lowStock] of products) {
      const cat = getCategory.get(category);
      insertProduct.run(barcode, sku, name, cat?.id ?? null, unit, cost, price, stock, lowStock);
    }
  }

  const customerCount = db.prepare('SELECT COUNT(*) AS c FROM customers').get().c;
  if (customerCount === 0) {
    const insertCustomer = db.prepare('INSERT INTO customers (name, phone, points, level, note) VALUES (?, ?, ?, ?, ?)');
    const customers = [
      ['王女士', '13800000001', 860, '银卡会员', '常购粮油'],
      ['李先生', '13800000002', 2360, '金卡会员', ''],
      ['张先生', '13800000003', 120, '普通会员', ''],
      ['刘阿姨', '13800000004', 5210, '钻石会员', '社区老客户'],
      ['陈先生', '13800000005', 430, '银卡会员', '']
    ];
    for (const row of customers) insertCustomer.run(...row);
  }

  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount === 0) {
    const insertUser = db.prepare('INSERT INTO users (username, password_hash, salt, name, role) VALUES (?, ?, ?, ?, ?)');
    const admin = hashPassword('admin123');
    const cashier = hashPassword('123456');
    insertUser.run('admin', admin.hash, admin.salt, '店长', 'admin');
    insertUser.run('cashier', cashier.hash, cashier.salt, '收银员', 'cashier');
  }

  const settingCount = db.prepare('SELECT COUNT(*) AS c FROM settings').get().c;
  if (settingCount === 0) {
    const insertSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
    const settings = {
      store_name: '阳光生活超市',
      store_address: '幸福路 88 号 1F',
      store_phone: '0571-88886666',
      tax_rate: '0.06',
      tax_enabled: '1',
      currency: '¥',
      receipt_footer: '感谢惠顾，欢迎再次光临！',
      points_rate: '10',
      points_enabled: '1'
    };
    for (const [key, value] of Object.entries(settings)) insertSetting.run(key, value);
  }
}

seed();

import cors from 'cors';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { checkPassword, hashPassword, requireAuth, signToken } from './auth.js';
import { sql } from './db.js';

const TABLES = new Set([
  'farms',
  'ponds',
  'parties',
  'entries',
  'sales',
  'payments',
  'cycles',
  'feed_logs',
  'categories',
  'team',
  'vehicles',
]);

const DEFAULT_CATEGORIES = [
  ['feed', 'Feed', 'wheat', 'bg-leaf-200 text-forest-800', 'pond', true],
  ['medicine', 'Medicine', 'pill', 'bg-lime-100 text-forest-700', 'pond', true],
  ['labour', 'Labour', 'users', 'bg-leaf-300/40 text-forest-800', 'pond', true],
  ['transport', 'Transport', 'truck', 'bg-tile text-forest-700', 'pond', true],
  ['seed', 'Seed', 'sprout', 'bg-leaf-200 text-forest-800', 'pond', true],
  ['pond_prep', 'Pond prep', 'shovel', 'bg-lime-100 text-forest-800', 'pond', true],
  ['fuel', 'Fuel / Aeration', 'fuel', 'bg-leaf-300/35 text-forest-800', 'pond', true],
  ['lab', 'Lab', 'flask', 'bg-tile text-forest-700', 'pond', true],
  ['harvest', 'Harvest cost', 'package', 'bg-leaf-200 text-forest-800', 'pond', true],
  ['misc', 'Misc', 'wrench', 'bg-tile text-muted', 'pond', true],
  ['electricity', 'Electricity', 'zap', 'bg-lime-100 text-forest-800', 'common', true],
  ['lease', 'Lease', 'package', 'bg-leaf-200 text-forest-700', 'common', true],
  ['vehicle', 'Vehicle', 'car', 'bg-tile text-forest-800', 'common', true],
  ['salary', 'Salary', 'users', 'bg-lime-100 text-forest-800', 'common', true],
];

function camelKey(key) {
  if (key === 'grp') return 'group';
  return key.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
}

function snakeKey(key) {
  if (key === 'group') return 'grp';
  return key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
}

function jsonValue(value) {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  return value;
}

function fromRow(row) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === 'farm_id' || key === 'password_hash') continue;
    out[camelKey(key)] = jsonValue(value);
  }
  return out;
}

function toRow(input, farmId) {
  const out = { farm_id: farmId };
  for (const [key, value] of Object.entries(input)) {
    if (key === 'farmId' || key === 'farm_id') continue;
    out[snakeKey(key)] = value === undefined ? null : value;
  }
  return out;
}

function splitFarm(row) {
  const full = fromRow(row);
  return {
    farm: {
      id: full.id,
      name: full.name,
      ownerName: full.ownerName,
      village: full.village ?? '',
      phone: full.phone ?? undefined,
      areaUnit: full.areaUnit === 'cents' ? 'cents' : 'acres',
      weightUnit: full.weightUnit === 'quintal' ? 'quintal' : 'kg',
      language: full.language === 'te' ? 'te' : 'en',
    },
    notifications: {
      daily: Boolean(full.daily),
      dailyTime: full.dailyTime ?? '19:00',
      dues: Boolean(full.dues),
      lease: Boolean(full.lease),
    },
  };
}

function ident(value) {
  return /^[a-z_][a-z0-9_]*$/.test(value);
}

function quoteIdent(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

const TABLE_COLUMNS = {
  farms: new Set([
    'id',
    'name',
    'owner_name',
    'village',
    'phone',
    'area_unit',
    'weight_unit',
    'language',
    'daily',
    'daily_time',
    'dues',
    'lease',
  ]),
  ponds: new Set([
    'farm_id',
    'id',
    'name',
    'code',
    'species',
    'species_ids',
    'other_species',
    'area_acres',
    'depth_ft',
    'water_type',
    'water_source',
    'aerators',
    'hdpe_lined',
    'leased',
    'lease_amount_year',
    'lease_end_date',
    'notes',
    'status',
    'cycle_day',
    'cycle_length',
    'cycle_number',
    'last_cycle_number',
    'last_cycle_profit',
  ]),
  parties: new Set(['farm_id', 'id', 'name', 'kind', 'phone', 'place']),
  entries: new Set([
    'farm_id',
    'id',
    'title',
    'subtitle',
    'amount',
    'kind',
    'category',
    'date',
    'pond_id',
    'cycle_id',
    'party_id',
    'payment',
    'note',
    'cycle_label',
    'time',
    'item',
    'qty',
    'unit',
    'rate',
    'mode',
    'added_by',
    'photo_url',
    'due_date',
    'paid_date',
    'settled_amount',
  ]),
  sales: new Set([
    'farm_id',
    'id',
    'pond_id',
    'cycle_id',
    'date',
    'buyer',
    'qty_kg',
    'count_size',
    'rate_per_kg',
    'net_amount',
    'received_amount',
    'opening_received',
    'due_date',
  ]),
  payments: new Set(['farm_id', 'id', 'party_id', 'date', 'amount', 'mode', 'note', 'entry_ids']),
  cycles: new Set([
    'farm_id',
    'id',
    'pond_id',
    'number',
    'species',
    'status',
    'start_date',
    'end_date',
    'expected_days',
    'recorded_profit',
    'feed_vendor_id',
    'feed_brand',
    'feed_size',
    'feed_bag_weight',
    'feed_price_per_bag',
    'feed_payment',
  ]),
  feed_logs: new Set(['farm_id', 'id', 'pond_id', 'cycle_id', 'date', 'meals', 'kg', 'cost']),
  categories: new Set(['farm_id', 'id', 'name', 'icon', 'tint', 'grp', 'locked', 'enabled', 'sort']),
  team: new Set(['farm_id', 'id', 'name', 'phone', 'role']),
  vehicles: new Set(['farm_id', 'id', 'name', 'number']),
};

async function loadTable(farmId, table, order) {
  if (order) {
    const rows = await sql`select * from ${sql(table)} where farm_id = ${farmId} order by ${sql(order)}`;
    return rows.map(fromRow);
  }
  const rows = await sql`select * from ${sql(table)} where farm_id = ${farmId}`;
  return rows.map(fromRow);
}

async function loadBundle(farmId) {
  const [farmRows, ponds, parties, entries, sales, payments, cycles, feedLogs, categories, team, vehicles] =
    await Promise.all([
      sql`select * from farms where id = ${farmId} limit 1`,
      loadTable(farmId, 'ponds'),
      loadTable(farmId, 'parties'),
      loadTable(farmId, 'entries', 'date'),
      loadTable(farmId, 'sales'),
      loadTable(farmId, 'payments'),
      loadTable(farmId, 'cycles'),
      loadTable(farmId, 'feed_logs'),
      loadTable(farmId, 'categories', 'sort'),
      loadTable(farmId, 'team'),
      loadTable(farmId, 'vehicles'),
    ]);
  const farmRow = farmRows[0];
  if (!farmRow) throw new Error('Farm not found');
  const parsed = splitFarm(farmRow);
  entries.reverse();
  return {
    ...parsed,
    ponds,
    parties,
    entries,
    sales,
    payments,
    cycles,
    feedLogs,
    categories,
    team,
    vehicles,
  };
}

function cleanUsername(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '1mb' }));

app.post('/api/auth/register', async (req, res) => {
  try {
    const username = cleanUsername(req.body?.username);
    const password = String(req.body?.password ?? '');
    const farmName = String(req.body?.farmName ?? '').trim();
    const language = req.body?.language === 'te' ? 'te' : 'en';
    if (username.length < 3 || username.length > 64) {
      res.status(400).json({ error: 'Enter a username of at least 3 characters' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }
    if (!farmName) {
      res.status(400).json({ error: 'Farm name is required' });
      return;
    }
    const existing = await sql`select id from users where username = ${username} limit 1`;
    if (existing.length) {
      res.status(409).json({ error: 'That username is taken' });
      return;
    }
    const farmId = randomUUID();
    const userId = randomUUID();
    await sql.begin(async (tx) => {
      await tx`insert into farms ${tx({
        id: farmId,
        name: farmName,
        owner_name: username,
        village: '',
        language,
      })}`;
      await tx`insert into users ${tx({
        id: userId,
        username,
        password_hash: hashPassword(password),
        farm_id: farmId,
      })}`;
      await tx`insert into team ${tx({
        farm_id: farmId,
        id: userId,
        name: username,
        phone: '',
        role: 'owner',
      })}`;
      const cats = DEFAULT_CATEGORIES.map((row, sort) => ({
        farm_id: farmId,
        id: row[0],
        name: row[1],
        icon: row[2],
        tint: row[3],
        grp: row[4],
        locked: row[5],
        enabled: true,
        sort,
      }));
      await tx`insert into categories ${tx(cats)}`;
    });
    const token = signToken({ id: userId, farm_id: farmId, username });
    res.json({ token, username, farmId });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Register failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const username = cleanUsername(req.body?.username);
    const password = String(req.body?.password ?? '');
    const rows = await sql`select * from users where username = ${username} limit 1`;
    const user = rows[0];
    if (!user || !checkPassword(password, user.password_hash)) {
      res.status(401).json({ error: 'Wrong username or password' });
      return;
    }
    res.json({ token: signToken(user), username: user.username, farmId: user.farm_id });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Login failed' });
  }
});

app.get('/api/me', requireAuth, async (req, res) => {
  try {
    const rows = await sql`select * from farms where id = ${req.user.farmId} limit 1`;
    if (!rows[0]) {
      res.status(404).json({ error: 'Farm not found' });
      return;
    }
    res.json({ username: req.user.username, ...splitFarm(rows[0]) });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed' });
  }
});

app.get('/api/data', requireAuth, async (req, res) => {
  try {
    res.json(await loadBundle(req.user.farmId));
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Load failed' });
  }
});

app.post('/api/data/:table', requireAuth, async (req, res) => {
  try {
    const table = req.params.table;
    if (!TABLES.has(table) || !ident(table)) {
      res.status(400).json({ error: 'Unknown table' });
      return;
    }
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : req.body ? [req.body] : [];
    if (rows.length === 0) {
      res.json({ ok: true });
      return;
    }
    const farmId = req.user.farmId;
    const allowed = TABLE_COLUMNS[table];
    const payload = rows.map((row) => {
      const next = toRow(row, farmId);
      if (table === 'farms') {
        next.id = farmId;
        delete next.farm_id;
      }
      if (table === 'ponds' && next.species_ids != null && !Array.isArray(next.species_ids)) {
        next.species_ids = String(next.species_ids)
          .replace(/[{}]/g, '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);
      }
      if (!next.id) throw new Error('Each row needs id');
      return next;
    });
    const keys = Object.keys(payload[0]).filter((key) => ident(key) && allowed.has(key));
    const conflict = table === 'farms' ? '"id"' : '"farm_id", "id"';
    const updates = keys
      .filter((key) => key !== 'id' && key !== 'farm_id')
      .map((key) => `${quoteIdent(key)} = excluded.${quoteIdent(key)}`)
      .join(', ');
    await sql`insert into ${sql(table)} ${sql(payload, ...keys)} on conflict (${sql.unsafe(conflict)}) do update set ${sql.unsafe(updates)}`;
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Save failed' });
  }
});

app.delete('/api/data/:table/:id', requireAuth, async (req, res) => {
  try {
    const table = req.params.table;
    const id = req.params.id;
    if (!TABLES.has(table) || !ident(table) || table === 'farms') {
      res.status(400).json({ error: 'Unknown table' });
      return;
    }
    await sql`delete from ${sql(table)} where farm_id = ${req.user.farmId} and id = ${id}`;
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Delete failed' });
  }
});

const port = Number(process.env.PORT) || 3001;
sql`alter table entries add column if not exists cycle_id text`
  .then(() => {
    app.listen(port, () => {
      console.log(`Aqua Ledger API on ${port}`);
    });
  })
  .catch((error) => {
    console.error('Could not start API', error);
    process.exit(1);
  });

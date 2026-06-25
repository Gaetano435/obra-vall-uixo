const express = require('express');
const Database = require('better-sqlite3');
const multer = require('multer');
const sharp = require('sharp');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'obra.db'));
db.pragma('journal_mode = WAL');

// ---------- SCHEMA ----------
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    cat TEXT NOT NULL,
    cover_photo TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS schedule (
    task_id TEXT NOT NULL,
    day TEXT NOT NULL,
    PRIMARY KEY (task_id, day),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS task_meta (
    task_id TEXT PRIMARY KEY,
    done INTEGER DEFAULT 0,
    progress INTEGER DEFAULT 0,
    note TEXT,
    due_date TEXT,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS photos (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
  );
`);

// ---------- MIGRATIONS (for databases created before cover_photo existed) ----------
const taskCols = db.prepare("PRAGMA table_info(tasks)").all().map(c => c.name);
if (!taskCols.includes('cover_photo')) {
  db.exec('ALTER TABLE tasks ADD COLUMN cover_photo TEXT');
  console.log('Migración aplicada: columna cover_photo añadida.');
}

// ---------- SEED: default tasks if empty ----------
const WEEK_RANGES = {
  w1: ['2026-06-15','2026-06-21'],
  w2: ['2026-06-22','2026-06-28'],
  w3: ['2026-06-29','2026-07-05'],
  w4: ['2026-07-06','2026-07-12'],
  w5: ['2026-07-13','2026-07-19'],
  w6: ['2026-07-20','2026-07-26'],
  w7: ['2026-07-27','2026-07-31'],
};
function weekToDays(weekId) {
  const [s, e] = WEEK_RANGES[weekId];
  const days = [];
  let d = new Date(s + 'T00:00:00');
  const end = new Date(e + 'T00:00:00');
  while (d <= end) {
    days.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

const DEFAULT_TASKS = [
  { id: 't01', name: 'Alicatado piscina pequeña', cat: 'piscina', weeks: ['w1','w2','w3'] },
  { id: 't02', name: 'Soleras rampa, escalera y escalera', cat: 'piscina', weeks: ['w1','w2'] },
  { id: 't03', name: 'Soleras edificio instalaciones', cat: 'edif', weeks: ['w1','w2'] },
  { id: 't04', name: 'Soleras piscina pequeña', cat: 'piscina', weeks: ['w1','w2'] },
  { id: 't05', name: 'Soleras edificio acceso', cat: 'edif', weeks: ['w1','w3'] },
  { id: 't06', name: 'Recrecido y aislamiento de solera — tabiquería edif. acceso', cat: 'edif', weeks: ['w2'] },
  { id: 't07', name: 'Pintura edificio instalaciones', cat: 'edif', weeks: ['w1','w2'] },
  { id: 't08', name: 'Tramex vallado cubierta edif. vestuarios', cat: 'edif', weeks: ['w1'] },
  { id: 't09', name: 'Cerramiento perimetral parque — vallado Hércules', cat: 'exterior', weeks: ['w1','w2','w3','w4'] },
  { id: 't10', name: 'Alicatado edificio acceso', cat: 'edif', weeks: ['w1','w2'] },
  { id: 't11', name: 'Pavimentación playas piscina pequeña', cat: 'piscina', weeks: ['w1'] },
  { id: 't12', name: 'Plantado de césped y moreras — piscina grande', cat: 'exterior', weeks: ['w1','w2'] },
  { id: 't13', name: 'Climatización edificio vestuarios', cat: 'edif', weeks: ['w1','w2'] },
  { id: 't14', name: 'Pavimento edificio acceso', cat: 'edif', weeks: ['w2','w3'] },
  { id: 't15', name: 'Recrecido de mortero — edificio acceso', cat: 'edif', weeks: ['w2'] },
  { id: 't16', name: 'Pintura edificio vestuarios', cat: 'edif', weeks: ['w1','w2'] },
  { id: 't17', name: 'Pintura pilares metálicos y pérgolas', cat: 'exterior', weeks: ['w1','w2'] },
  { id: 't18', name: 'Enlucido de blanco — edificio vestuarios', cat: 'edif', weeks: ['w1','w2'] },
  { id: 't19', name: 'Reposición pavimento escalera — edificio vestuarios', cat: 'edif', weeks: ['w1','w2'] },
  { id: 't20', name: 'Instalaciones edificio acceso', cat: 'edif', weeks: ['w1','w2'] },
  { id: 't21', name: 'Chapa Keops edificio vestuarios', cat: 'edif', weeks: ['w1'] },
  { id: 't22', name: 'Chapa Keops edificio acceso', cat: 'edif', weeks: ['w1','w2'] },
  { id: 't23', name: 'Carpintería madera — edificio vestuarios', cat: 'edif', weeks: ['w1'] },
  { id: 't24', name: 'Carpintería edificio instalaciones', cat: 'edif', weeks: ['w1'] },
  { id: 't25', name: 'Carpintería madera — edificio acceso', cat: 'edif', weeks: ['w2','w3'] },
  { id: 't26', name: 'Splash park', cat: 'piscina', weeks: ['w3','w4','w5','w6','w7'] },
  { id: 't27', name: 'Carpintería de aluminio — edificio acceso', cat: 'edif', weeks: ['w2','w3'] },
  { id: 't28', name: 'Solera zona piscina pequeña', cat: 'piscina', weeks: ['w1'] },
  { id: 't29', name: 'Jardinería zona piscina pequeña', cat: 'piscina', weeks: ['w3','w4','w5','w6','w7'] },
  { id: 't30', name: 'Rasanteo, hormigonado y pavimento de adoquín', cat: 'exterior', weeks: ['w3','w4','w5','w6','w7'] },
  { id: 't31', name: 'Pintura edificio acceso', cat: 'edif', weeks: ['w3','w4'] },
  { id: 't32', name: 'Techos y tabiquería pladur — edificio acceso', cat: 'edif', weeks: ['w2','w3'] },
  { id: 't33', name: 'Barandillas pérgola — balsa compensación', cat: 'exterior', weeks: ['w2'] },
  { id: 't34', name: 'Barandillas edificio vestuarios', cat: 'edif', weeks: ['w2'] },
  { id: 't35', name: 'Barandillas escalera y rampa interior', cat: 'piscina', weeks: ['w2'] },
  { id: 't36', name: 'Barandillas piscina grande', cat: 'piscina', weeks: ['w3','w4','w5','w6','w7'] },
  { id: 't37', name: 'Barandillas piscina pequeña', cat: 'piscina', weeks: ['w3','w4','w5','w6','w7'] },
  { id: 't38', name: 'Barandillas pérgola — edificio acceso', cat: 'edif', weeks: ['w2','w3'] },
  { id: 't39', name: 'Barandillas entrada y rampa principal', cat: 'exterior', weeks: ['w3','w4','w5','w6','w7'] },
  { id: 't40', name: 'Limpieza piscina previo llenado y pruebas', cat: 'final', weeks: ['w3'] },
  { id: 't41', name: 'Llenado y pruebas — piscinas y equipos', cat: 'final', weeks: ['w3'] },
];

const countTasks = db.prepare('SELECT COUNT(*) as n FROM tasks').get().n;
if (countTasks === 0) {
  const insertTask = db.prepare('INSERT INTO tasks (id, name, cat) VALUES (?, ?, ?)');
  const insertSchedule = db.prepare('INSERT OR IGNORE INTO schedule (task_id, day) VALUES (?, ?)');
  const insertMeta = db.prepare('INSERT INTO task_meta (task_id, done, progress) VALUES (?, 0, 0)');
  const seedTx = db.transaction(() => {
    DEFAULT_TASKS.forEach(t => {
      insertTask.run(t.id, t.name, t.cat);
      insertMeta.run(t.id);
      let days = [];
      t.weeks.forEach(w => { days = days.concat(weekToDays(w)); });
      days.forEach(d => insertSchedule.run(t.id, d));
    });
  });
  seedTx();
  console.log(`Seed inicial: ${DEFAULT_TASKS.length} partidas creadas.`);
}

// ---------- APP ----------
const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---- GET full state ----
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });

app.get('/api/state', (req, res) => {
  try {
    const tasks = db.prepare('SELECT id, name, cat, cover_photo FROM tasks').all();
    const scheduleRows = db.prepare('SELECT task_id, day FROM schedule').all();
    const metaRows = db.prepare('SELECT * FROM task_meta').all();
    const photoRows = db.prepare('SELECT id, task_id, filename, created_at FROM photos ORDER BY created_at ASC').all();

    const scheduleById = {};
    scheduleRows.forEach(r => {
      if (!scheduleById[r.task_id]) scheduleById[r.task_id] = [];
      scheduleById[r.task_id].push(r.day);
    });

    const metaById = {};
    metaRows.forEach(r => { metaById[r.task_id] = r; });

    const photosById = {};
    photoRows.forEach(r => {
      if (!photosById[r.task_id]) photosById[r.task_id] = [];
      photosById[r.task_id].push({ id: r.id, url: `/uploads/${r.filename}`, ts: r.created_at });
    });

    const tasksOut = tasks.map(t => ({
      id: t.id,
      name: t.name,
      cat: t.cat,
      cover_photo: t.cover_photo ? `/uploads/${t.cover_photo}` : null
    }));

    res.json({ tasks: tasksOut, scheduleById, metaById, photosById });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error leyendo el estado' });
  }
});

// ---- CREATE task ----
app.post('/api/tasks', (req, res) => {
  const { name, cat, day } = req.body;
  if (!name || !cat || !day) return res.status(400).json({ error: 'Faltan campos' });
  const id = 'custom_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
  const tx = db.transaction(() => {
    db.prepare('INSERT INTO tasks (id, name, cat) VALUES (?, ?, ?)').run(id, name, cat);
    db.prepare('INSERT INTO task_meta (task_id, done, progress) VALUES (?, 0, 0)').run(id);
    db.prepare('INSERT INTO schedule (task_id, day) VALUES (?, ?)').run(id, day);
  });
  tx();
  res.json({ id });
});

// ---- DELETE task ----
app.delete('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  const photos = db.prepare('SELECT filename FROM photos WHERE task_id = ?').all(id);
  const taskRow = db.prepare('SELECT cover_photo FROM tasks WHERE id = ?').get(id);
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM schedule WHERE task_id = ?').run(id);
    db.prepare('DELETE FROM task_meta WHERE task_id = ?').run(id);
    db.prepare('DELETE FROM photos WHERE task_id = ?').run(id);
    db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  });
  tx();
  photos.forEach(p => {
    const fp = path.join(UPLOADS_DIR, p.filename);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  });
  if (taskRow && taskRow.cover_photo) {
    const fp = path.join(UPLOADS_DIR, taskRow.cover_photo);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }
  res.json({ ok: true });
});

// ---- EDIT task (name / category) ----
app.put('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  const { name, cat } = req.body;
  const exists = db.prepare('SELECT 1 FROM tasks WHERE id = ?').get(id);
  if (!exists) return res.status(404).json({ error: 'Partida no encontrada' });
  if (!name || !cat) return res.status(400).json({ error: 'Faltan campos' });
  db.prepare('UPDATE tasks SET name = ?, cat = ? WHERE id = ?').run(name, cat, id);
  res.json({ ok: true });
});

// ---- UPLOAD / REPLACE cover photo ----
app.post('/api/tasks/:id/cover', upload.single('photo'), async (req, res) => {
  try {
    const { id } = req.params;
    const exists = db.prepare('SELECT cover_photo FROM tasks WHERE id = ?').get(id);
    if (!exists) return res.status(404).json({ error: 'Partida no encontrada' });
    if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna foto' });

    const filename = `cover_${id}_${crypto.randomBytes(4).toString('hex')}.jpg`;
    const outPath = path.join(UPLOADS_DIR, filename);

    await sharp(req.file.buffer)
      .rotate()
      .resize({ width: 900, height: 900, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 75 })
      .toFile(outPath);

    const oldCover = exists.cover_photo;
    db.prepare('UPDATE tasks SET cover_photo = ? WHERE id = ?').run(filename, id);

    if (oldCover) {
      const oldPath = path.join(UPLOADS_DIR, oldCover);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    res.json({ cover_photo: `/uploads/${filename}` });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error procesando la foto de portada' });
  }
});

// ---- DELETE cover photo ----
app.delete('/api/tasks/:id/cover', (req, res) => {
  const { id } = req.params;
  const row = db.prepare('SELECT cover_photo FROM tasks WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Partida no encontrada' });
  if (row.cover_photo) {
    const fp = path.join(UPLOADS_DIR, row.cover_photo);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }
  db.prepare('UPDATE tasks SET cover_photo = NULL WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ---- UPDATE task meta (done, progress, note, due_date) ----
app.put('/api/tasks/:id/meta', (req, res) => {
  const { id } = req.params;
  const { done, progress, note, due_date } = req.body;
  const exists = db.prepare('SELECT 1 FROM task_meta WHERE task_id = ?').get(id);
  if (!exists) {
    db.prepare('INSERT INTO task_meta (task_id, done, progress, note, due_date) VALUES (?, ?, ?, ?, ?)')
      .run(id, done ? 1 : 0, progress || 0, note || null, due_date || null);
  } else {
    db.prepare('UPDATE task_meta SET done = ?, progress = ?, note = ?, due_date = ? WHERE task_id = ?')
      .run(done ? 1 : 0, progress || 0, note || null, due_date || null, id);
  }
  res.json({ ok: true });
});

// ---- MOVE task day (add/remove a day from schedule) ----
app.post('/api/tasks/:id/schedule', (req, res) => {
  const { id } = req.params;
  const { add, remove } = req.body; // ISO day strings
  const tx = db.transaction(() => {
    if (remove) db.prepare('DELETE FROM schedule WHERE task_id = ? AND day = ?').run(id, remove);
    if (add) db.prepare('INSERT OR IGNORE INTO schedule (task_id, day) VALUES (?, ?)').run(id, add);
  });
  tx();
  res.json({ ok: true });
});

// ---- SET full schedule for a task (used by day-chip grid in detail drawer) ----
app.put('/api/tasks/:id/schedule', (req, res) => {
  const { id } = req.params;
  const { days } = req.body; // full array of ISO days
  if (!Array.isArray(days)) return res.status(400).json({ error: 'days debe ser un array' });
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM schedule WHERE task_id = ?').run(id);
    const insert = db.prepare('INSERT OR IGNORE INTO schedule (task_id, day) VALUES (?, ?)');
    days.forEach(d => insert.run(id, d));
  });
  tx();
  res.json({ ok: true });
});

// ---- PHOTO UPLOAD ----
app.post('/api/tasks/:id/photos', upload.single('photo'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna foto' });

    const photoId = crypto.randomBytes(8).toString('hex');
    const filename = `${id}_${photoId}.jpg`;
    const outPath = path.join(UPLOADS_DIR, filename);

    await sharp(req.file.buffer)
      .rotate() // auto-orient based on EXIF
      .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 72 })
      .toFile(outPath);

    db.prepare('INSERT INTO photos (id, task_id, filename) VALUES (?, ?, ?)').run(photoId, id, filename);
    const row = db.prepare('SELECT created_at FROM photos WHERE id = ?').get(photoId);

    res.json({ id: photoId, url: `/uploads/${filename}`, ts: row.created_at });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error procesando la foto' });
  }
});

// ---- DELETE photo ----
app.delete('/api/photos/:photoId', (req, res) => {
  const { photoId } = req.params;
  const row = db.prepare('SELECT filename FROM photos WHERE id = ?').get(photoId);
  if (!row) return res.status(404).json({ error: 'No encontrada' });
  db.prepare('DELETE FROM photos WHERE id = ?').run(photoId);
  const fp = path.join(UPLOADS_DIR, row.filename);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
  res.json({ ok: true });
});

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.listen(PORT, () => {
  console.log(`Servidor de planning de obra escuchando en puerto ${PORT}`);
});

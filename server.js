const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { getLists, getList, createList, updateList, deleteList } = require('./db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Image uploads ─────────────────────────────────────────────────────────

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

app.use('/uploads', express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, Date.now() + '-' + Math.random().toString(36).slice(2) + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/'))
});

app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image provided' });
  res.json({ url: '/uploads/' + req.file.filename });
});

// ── Lists ─────────────────────────────────────────────────────────────────

app.get('/api/lists', (req, res) => {
  res.json(getLists());
});

app.get('/api/lists/:id', (req, res) => {
  const lst = getList(req.params.id);
  if (!lst) return res.status(404).json({ error: 'Not found' });
  res.json(lst);
});

app.post('/api/lists', (req, res) => {
  const { name, tags, itemData } = req.body;
  if (!name || !itemData) return res.status(400).json({ error: 'name and itemData required' });
  res.status(201).json(createList({ name, tags, itemData }));
});

app.put('/api/lists/:id', (req, res) => {
  const { name, tags, itemData } = req.body;
  if (!name || !itemData) return res.status(400).json({ error: 'name and itemData required' });
  if (!getList(req.params.id)) return res.status(404).json({ error: 'Not found' });
  res.json(updateList(req.params.id, { name, tags, itemData }));
});

app.delete('/api/lists/:id', (req, res) => {
  deleteList(req.params.id);
  res.status(204).end();
});

// ── Start ─────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Tournament app running at http://localhost:${PORT}`);
});

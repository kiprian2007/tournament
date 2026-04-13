const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const db = new Database(path.join(dataDir, 'tournament.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS lists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS list_tags (
    list_id TEXT REFERENCES lists(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    PRIMARY KEY (list_id, tag)
  );

  CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    list_id TEXT REFERENCES lists(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    image_url TEXT,
    position INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS item_tags (
    item_id TEXT REFERENCES items(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    PRIMARY KEY (item_id, tag)
  );
`);

const stmts = {
  getList:      db.prepare('SELECT * FROM lists WHERE id = ?'),
  getAllLists:   db.prepare('SELECT * FROM lists ORDER BY rowid'),
  getListTags:  db.prepare('SELECT tag FROM list_tags WHERE list_id = ? ORDER BY tag'),
  getItems:     db.prepare('SELECT * FROM items WHERE list_id = ? ORDER BY position'),
  getItemTags:  db.prepare('SELECT tag FROM item_tags WHERE item_id = ? ORDER BY tag'),
  insertList:   db.prepare('INSERT INTO lists (id, name) VALUES (?, ?)'),
  updateList:   db.prepare('UPDATE lists SET name = ? WHERE id = ?'),
  deleteList:   db.prepare('DELETE FROM lists WHERE id = ?'),
  insertListTag:db.prepare('INSERT OR IGNORE INTO list_tags (list_id, tag) VALUES (?, ?)'),
  deleteListTags:db.prepare('DELETE FROM list_tags WHERE list_id = ?'),
  insertItem:   db.prepare('INSERT INTO items (id, list_id, name, image_url, position) VALUES (?, ?, ?, ?, ?)'),
  deleteItems:  db.prepare('DELETE FROM items WHERE list_id = ?'),
  insertItemTag:db.prepare('INSERT OR IGNORE INTO item_tags (item_id, tag) VALUES (?, ?)'),
};

function uid() {
  return crypto.randomUUID();
}

function assembleList(listRow) {
  const tags = stmts.getListTags.all(listRow.id).map(r => r.tag);
  const itemRows = stmts.getItems.all(listRow.id);
  const itemData = itemRows.map(item => {
    const itemTags = stmts.getItemTags.all(item.id).map(r => r.tag);
    return { name: item.name, tags: itemTags, imageUrl: item.image_url || null };
  });
  return { id: listRow.id, name: listRow.name, tags, itemData };
}

function getLists() {
  return stmts.getAllLists.all().map(assembleList);
}

function getList(id) {
  const row = stmts.getList.get(id);
  return row ? assembleList(row) : null;
}

const createList = db.transaction(({ name, tags = [], itemData = [] }) => {
  const id = uid();
  stmts.insertList.run(id, name);
  for (const tag of tags) stmts.insertListTag.run(id, tag);
  itemData.forEach((item, pos) => {
    const itemId = uid();
    stmts.insertItem.run(itemId, id, item.name, item.imageUrl || null, pos);
    for (const tag of (item.tags || [])) stmts.insertItemTag.run(itemId, tag);
  });
  return assembleList(stmts.getList.get(id));
});

const updateList = db.transaction((id, { name, tags = [], itemData = [] }) => {
  stmts.updateList.run(name, id);
  stmts.deleteListTags.run(id);
  stmts.deleteItems.run(id); // cascades item_tags
  for (const tag of tags) stmts.insertListTag.run(id, tag);
  itemData.forEach((item, pos) => {
    const itemId = uid();
    stmts.insertItem.run(itemId, id, item.name, item.imageUrl || null, pos);
    for (const tag of (item.tags || [])) stmts.insertItemTag.run(itemId, tag);
  });
  return assembleList(stmts.getList.get(id));
});

function deleteList(id) {
  stmts.deleteList.run(id);
}

module.exports = { getLists, getList, createList, updateList, deleteList };

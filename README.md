# Турнир вариантов

Веб-приложение для ранжирования списков через попарное сравнение.  
Фронтенд — `public/tournament.html`, бэкенд — Node.js + Express + SQLite.

---

## Стек

| Слой | Технология |
|---|---|
| Фронтенд | Vanilla JS + HTML/CSS, один файл `public/tournament.html` |
| Бэкенд | Node.js, Express 4 |
| База данных | SQLite (`better-sqlite3`, синхронный API) |
| Загрузка файлов | Multer (изображения, макс. 5 МБ) |
| Процесс-менеджер | PM2 (автозапуск через systemd) |
| Автодеплой | `deploy.sh` + cron (каждые 2 мин, проверяет `origin/master`) |

---

## Структура проекта

```
tournament/
├── server.js          # Express: API + статика
├── db.js              # SQLite: инициализация + все запросы
├── deploy.sh          # Скрипт автодеплоя (git pull + pm2 restart)
├── package.json
├── .gitignore
├── data/
│   └── tournament.db  # SQLite-файл (создаётся автоматически, в git не входит)
├── uploads/           # Загруженные изображения (в git не входит)
└── public/
    └── tournament.html  # Весь фронтенд
```

---

## API

| Метод | Путь | Описание |
|---|---|---|
| `GET` | `/api/lists` | Все списки |
| `GET` | `/api/lists/:id` | Один список |
| `POST` | `/api/lists` | Создать список |
| `PUT` | `/api/lists/:id` | Обновить список |
| `DELETE` | `/api/lists/:id` | Удалить список |
| `POST` | `/api/upload` | Загрузить изображение → `{ url }` |

Тело запросов: `Content-Type: application/json`.

Формат объекта списка:

```json
{
  "id": "uuid",
  "name": "Название",
  "tags": ["тег1", "тег2"],
  "itemData": [
    { "name": "Вариант", "tags": ["тег"], "imageUrl": "/uploads/..." }
  ]
}
```

---

## База данных — `db.js`

**Таблицы:**

```sql
lists (id, name)
list_tags (list_id, tag)
items (id, list_id, name, image_url, position)
item_tags (item_id, tag)
```

Все внешние ключи — `ON DELETE CASCADE`. ID генерируются через `crypto.randomUUID()`.

`db.js` экспортирует: `getLists`, `getList`, `createList`, `updateList`, `deleteList`.  
`createList` и `updateList` работают в транзакциях.

---

## Сервер — `server.js`

- `express.static('public')` — раздаёт фронтенд
- `express.static('uploads')` — раздаёт загруженные изображения
- Порт: `process.env.PORT || 3000`

---

## Алгоритм турнира

**Round-robin** — все уникальные пары `[i, j]` где `i < j`.  
Количество сравнений: `n × (n − 1) / 2`.  
Пары перемешиваются алгоритмом Fisher-Yates перед стартом.

Итог: сортировка по числу побед (по убыванию).  
Теги вариантов агрегируются в таблицу тегов на экране результатов.

---

## Дизайн-система (токены)

| Назначение | Значение |
|---|---|
| Фон страницы | `#0f0f13` |
| Фон компонентов | `#1a1a24` |
| Граница | `#2a2a40` / hover `#3a3a60` |
| Текст основной | `#e8e8f0` |
| Текст вторичный | `#a0a0c0` |
| Акцент | `#5a5aff` |
| Опасность | `#ff6060` |
| Золото / Серебро / Бронза | `#ffd700` / `#c0c0c0` / `#cd7f32` |

---

## Локальная разработка (Windows)

```bash
cd F:/Test
npm install
node server.js
# → http://localhost:3000
```

База данных `data/tournament.db` создаётся автоматически при первом запуске.

---

## Деплой на сервер

### Первичная настройка (один раз)

```bash
# Запустить с локальной машины
python setup_server.py
```

Скрипт по SSH:
1. Устанавливает Node.js 22 LTS и PM2
2. Клонирует репозиторий в `~/tournament`
3. Запускает `npm install`
4. Создаёт папки `data/` и `uploads/`
5. Запускает приложение через PM2
6. Настраивает systemd-автозапуск (`pm2 startup`)
7. Добавляет cron-задачу для `deploy.sh`

### Автодеплой при коммите

```bash
# Локально: запушить изменения
git add .
git commit -m "описание"
git push origin master
```

Через ≤2 минуты `deploy.sh` на сервере обнаружит новый коммит и автоматически:
- сделает `git pull`
- запустит `npm install --omit=dev`
- перезапустит PM2-процесс

Лог деплоев:
```bash
tail -f /var/log/tournament-deploy.log
```

---

## Управление приложением (на сервере)

```bash
ssh andy@192.168.0.101
```

```bash
# Статус
pm2 list
pm2 status

# Запустить (если не запущено)
cd ~/tournament && pm2 start server.js --name tournament

# Перезапустить
pm2 restart tournament

# Остановить
pm2 stop tournament

# Логи в реальном времени
pm2 logs tournament

# Последние 50 строк
pm2 logs tournament --lines 50 --nostream

# Деплой вручную прямо сейчас
~/tournament/deploy.sh

# Задание cron
crontab -l
```

### Автозапуск при перезагрузке сервера

Уже настроен. При загрузке ОС:
1. systemd запускает `pm2-andy.service`
2. PM2 читает `~/.pm2/dump.pm2`
3. Поднимает `tournament` → `node server.js`
4. Приложение доступно на порту 3000

Если нужно перенастроить:
```bash
pm2 startup          # выдаст команду — скопируй и выполни
pm2 save             # сохрани текущий список процессов
```

---

## Адреса

| Среда | URL |
|---|---|
| Локально | `http://localhost:3000` |
| Сервер (LAN) | `http://192.168.0.101:3000` |

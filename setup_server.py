import sys, os
os.environ['PYTHONIOENCODING'] = 'utf-8'
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')
import paramiko

HOST = '192.168.0.101'
USER = 'andy'
PASS = '4467eb02'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASS, timeout=10)

def run(cmd, timeout=300, show=True):
    """Run command, feeding PASS to sudo -S prompts."""
    transport = client.get_transport()
    chan = transport.open_session()
    chan.get_pty()
    chan.settimeout(timeout)
    # Wrap: feed password to any sudo -S, source profile for PATH
    full_cmd = f'export SUDO_ASKPASS=/bin/true; echo {PASS!r} | sudo -S true 2>/dev/null; . /etc/profile 2>/dev/null; {cmd}'
    chan.exec_command(full_cmd)
    out = b''
    while True:
        try:
            chunk = chan.recv(8192)
            if not chunk:
                break
            out += chunk
        except Exception:
            break
    chan.close()
    text = out.decode(errors='ignore').strip()
    # strip sudo password echo lines
    lines = [l for l in text.splitlines() if '[sudo]' not in l and l.strip()]
    text = '\n'.join(lines)
    if show and text:
        print(text)
    return text

def sudo(cmd, timeout=300, show=True):
    return run(f'echo {PASS!r} | sudo -S bash -c {cmd!r} 2>&1', timeout=timeout, show=show)

def step(title):
    print(f'\n{"─"*55}\n  {title}\n{"─"*55}')

# ── 1. Node.js ────────────────────────────────────────────────────────────────
step('Проверяем Node.js')
node = run('node -v 2>/dev/null || echo MISSING', show=False)
if 'MISSING' in node or not node.startswith('v'):
    step('Устанавливаем Node.js 22 LTS')
    sudo('curl -fsSL https://deb.nodesource.com/setup_22.x | bash -', timeout=120)
    sudo('apt-get install -y nodejs', timeout=180)
    v = run('. /etc/profile && node -v 2>/dev/null || /usr/bin/node -v', show=False)
    print('Node.js установлен:', v)
else:
    print('Node.js уже установлен:', node)

# ── 2. PM2 ────────────────────────────────────────────────────────────────────
step('Проверяем PM2')
pm2 = run('pm2 -v 2>/dev/null || /usr/lib/node_modules/pm2/bin/pm2 -v 2>/dev/null || echo MISSING', show=False)
if 'MISSING' in pm2 or not pm2.strip():
    step('Устанавливаем PM2')
    sudo('npm install -g pm2', timeout=120)
    print('PM2 установлен:', run('pm2 -v 2>/dev/null || /usr/lib/node_modules/.bin/pm2 -v 2>/dev/null', show=False))
else:
    print('PM2 уже установлен:', pm2)

# ── 3. Git clone / pull ───────────────────────────────────────────────────────
step('Клонируем / обновляем репозиторий')
exists = run('[ -d ~/tournament/.git ] && echo YES || echo NO', show=False)
if 'NO' in exists:
    run('git clone https://github.com/kiprian2007/tournament.git ~/tournament 2>&1')
    print('Клонировано.')
else:
    run('cd ~/tournament && git pull origin master 2>&1')
    print('Обновлено.')

# ── 4. npm install ────────────────────────────────────────────────────────────
step('npm install')
out = run('cd ~/tournament && npm install --omit=dev 2>&1', timeout=180)
if not out:
    print('(нет вывода — возможно уже установлено)')

# ── 5. data / uploads dirs ───────────────────────────────────────────────────
step('Создаём папки data/ и uploads/')
run('mkdir -p ~/tournament/data ~/tournament/uploads && chmod +x ~/tournament/deploy.sh')
print('Готово.')

# ── 6. PM2 start / restart ───────────────────────────────────────────────────
step('Запускаем приложение через PM2')
status = run('pm2 describe tournament 2>/dev/null | grep -i status || echo NONE', show=False)
if 'online' in status.lower():
    run('pm2 restart tournament 2>&1')
    print('Перезапущено.')
else:
    run('cd ~/tournament && pm2 start server.js --name tournament 2>&1')
    print('Запущено.')
run('pm2 save 2>&1', show=False)

# ── 7. PM2 startup ───────────────────────────────────────────────────────────
step('Настраиваем автозапуск при перезагрузке')
startup_out = run('pm2 startup systemd -u andy --hp /home/andy 2>&1', show=False)
# extract the sudo line
for line in startup_out.splitlines():
    if 'sudo env' in line or 'sudo systemctl' in line:
        sudo(line.strip().replace('sudo ', ''), timeout=30)
        break
run('pm2 save 2>&1', show=False)
print('Автозапуск настроен.')

# ── 8. Cron для автодеплоя ───────────────────────────────────────────────────
step('Cron для автодеплоя (каждые 2 минуты)')
cron_line = '*/2 * * * * /home/andy/tournament/deploy.sh >> /var/log/tournament-deploy.log 2>&1'
existing = run('crontab -l 2>/dev/null || echo ""', show=False)
if 'deploy.sh' not in existing:
    new_cron = (existing.strip() + '\n' + cron_line).strip()
    run(f'(crontab -l 2>/dev/null; echo "{cron_line}") | crontab -')
    print('Cron добавлен.')
else:
    print('Cron уже настроен.')

# ── 9. Итог ──────────────────────────────────────────────────────────────────
step('Готово')
print(run('pm2 list 2>&1'))
ip = run("hostname -I | awk '{print $1}'", show=False)
print(f'\n  Приложение: http://{ip.strip()}:3000')
print(f'  Автодеплой: каждые 2 мин при новых коммитах в master')
print(f'  Логи:       pm2 logs tournament')
print(f'  Деплой-лог: /var/log/tournament-deploy.log')

client.close()

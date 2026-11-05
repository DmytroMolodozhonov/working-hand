"""tools/mkindex.py — rebuilds part 2 of docs/INDEX.md (every file with the first line of its own header); part 1 (the guide) is kept."""
import os, re
import sys
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def desc(path):
    try: t=open(path,encoding='utf-8',errors='ignore').read(4000)
    except Exception: return ''
    m=re.search(r'/\*\*?\s*\n?\s*\*?\s*(.+?)(?:\n\s*\*\s*\n|\*/)', t, re.S)
    if path.endswith('.py'):
        m=re.search(r'^\s*(?:#![^\n]*\n)?\s*(?:"""|\'\'\')(.+?)(?:"""|\'\'\'|\n\n)', t, re.S)
    if not m:
        m=re.search(r'^\s*(?://|#)\s*(.+)$', t, re.M)
    if not m: return ''
    d=re.sub(r'\s*\n\s*\*?\s*', ' ', m.group(1)).strip()
    d=re.sub(r'^[\w./-]+\.(js|mjs|py)\s*[—–-]+\s*', '', d)
    d=d.replace('|','/')
    if len(d)>230: d=d[:230].rsplit(' ',1)[0]+'…'
    return d
out=[]
def section(folder, title, exts=('.js','.mjs','.py')):
    p=os.path.join(ROOT,folder)
    if not os.path.isdir(p): return
    files=sorted(f for f in os.listdir(p) if f.endswith(exts))
    out.append(f'\n### `{folder}/` — {title} ({len(files)})\n')
    for f in files:
        out.append(f'- `{f}` — {desc(os.path.join(p,f))}')
section('src/core','ядро: математика, кеш, общие формы, журналы')
section('src/world','мир: генерация в воркерах (без THREE), места (замки, башни, деревни, данжи, ад, планеты), прочность, вода, коллизии')
section('src/game','игра: системы, заклинания, существа, правила и таблицы «кто/что»')
section('src/entities','модели: герой, жители, зомби, оружие, кисти, позы')
section('src/fx','эффекты: частицы, свет, заклинания, пентаграммы')
section('src/audio','звук: синтез, музыка заклинаний, звуки существ')
section('src/input','камера и позы: фильтры, жесты, руки')
section('src/net','сеть: PeerJS, синхронизация, голосовой чат, аватары друзей')
section('src/ui','интерфейс: меню, HUD, справочник, настройки')
section('src/ai','разговор с жителями: команды, нейросеть, отклики')
section('tools','стенды и замеры (`node tools/<имя>.mjs --check`)')
idx=os.path.join(ROOT,'docs','INDEX.md')
head=open(idx,encoding='utf-8').read().split('## 2. Все файлы по папкам')[0] if os.path.exists(idx) else ''
open(idx,'w',encoding='utf-8').write(head+'## 2. Все файлы по папкам\n'+'\n'.join(out)+'\n')
print('docs/INDEX.md:', len((head+'\n'.join(out)).encode()), 'bytes')

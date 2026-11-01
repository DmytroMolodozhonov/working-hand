// Полный прогон unit-тестов с короткой сводкой: сколько прошло, какие файлы упали и почему (одной строкой).
// Запуск: npm run test:all   (цель — 0 падений; перед пушем достаточно затронутых файлов: node --test tests/unit/<файл>)
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';

const files = readdirSync('tests/unit').filter((f) => f.endsWith('.test.js')).map((f) => 'tests/unit/' + f);
const p = spawn(process.execPath, ['--test', ...files], { stdio: ['ignore', 'pipe', 'inherit'] });
let out = '';
p.stdout.on('data', (d) => { out += d; });
p.on('close', (code) => {
    const n = (k) => Number((out.match(new RegExp(`^# ${k} (\\d+)`, 'm')) || [])[1] || 0);
    const lines = out.split('\n');
    const failed = [];
    for (let i = 0; i < lines.length; i++) {
        if (!/^not ok \d+ - /.test(lines[i])) continue;
        let why = '';
        for (let j = i + 1; j < Math.min(i + 40, lines.length); j++) { if (/^\s*error:/.test(lines[j])) { why = lines.slice(j, j + 2).join(' ').replace(/\s+/g, ' ').slice(0, 160); break; } }
        failed.push(`${lines[i].replace(/^not ok \d+ - /, '')}  ${why}`);
    }
    console.log(`\nвсего ${n('tests')}, прошло ${n('pass')}, упало ${n('fail')}`);
    for (const f of failed) console.log('  ✗ ' + f);
    if (code !== 0 && !failed.length) console.log('  (процесс упал без разбора — смотрите вывод node --test)');
    process.exit(code ? 1 : 0);
});

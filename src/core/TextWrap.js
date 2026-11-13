/** Canvas text wrapping without clipping or ellipses, including a single overlong word. */
export function wrapText(text, width, measure) {
    const lines = []; let line = '';
    for (const word of String(text || '').trim().split(/\s+/).filter(Boolean)) {
        const next = line ? line + ' ' + word : word;
        if (measure(next) <= width) { line = next; continue; }
        if (line) { lines.push(line); line = ''; }
        for (const ch of word) {
            if (line && measure(line + ch) > width) { lines.push(line); line = ''; }
            line += ch;
        }
    }
    if (line) lines.push(line);
    return lines;
}

import ts from 'typescript';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const entries = new Map();
function scan(directory) {
  for (const file of readdirSync(directory, { withFileTypes: true })) {
    const path = `${directory}/${file.name}`;
    if (file.isDirectory()) scan(path);
    else if (/\.tsx?$/.test(path) && !/uiMessages|mockData/.test(path)) {
      const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
      function visit(node) {
        let text;
        if (ts.isStringLiteralLike(node)) text = node.text;
        if (ts.isJsxText(node)) text = node.text.replace(/\s+/g, ' ').trim();
        if (ts.isTemplateExpression(node)) text = node.head.text + node.templateSpans.map((span, i) => `{p${i}}${span.literal.text}`).join('');
        if (text && /[А-Яа-яЁё]/.test(text)) {
          const locations = entries.get(text) ?? [];
          locations.push(`${path}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`);
          entries.set(text, locations);
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
}
scan('src');
const list = [...entries].map(([ru, locations], index) => ({ index, ru, locations }));
writeFileSync('releases/qa/i18n-inventory.json', JSON.stringify(list, null, 2));
console.log(JSON.stringify({ unique: list.length, occurrences: list.reduce((sum, entry) => sum + entry.locations.length, 0) }));
console.log(list.map(entry => `${entry.index}\t${entry.ru}\t${entry.locations[0]}`).join('\n'));

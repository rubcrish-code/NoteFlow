export function typingFixture(name: string) {
  if (name === "complex") return Array.from({ length: 60 }, (_, i) => `## Раздел ${i}\n\nОбычный **жирный** и *курсив*, [ссылка](https://example.com).\n\n- Пункт\n  - Вложенный пункт\n- [ ] Задача\n\n> Цитата\n\n| A | B |\n| --- | --- |\n| Ячейка | Текст |\n\n\`\`\`javascript\nconst value = ${i};\n\`\`\``).join("\n\n");
  const length = Number(name);
  if (![1000, 10000, 50000, 100000].includes(length)) throw new Error("Unknown synthetic typing fixture");
  const line = "Синтетический текст для проверки отзывчивости редактора без пользовательских данных. ";
  const blocks = Array.from({ length: Math.ceil(length / 100) }, (_, i) => `${i} ${line}`.padEnd(100, ".").slice(0, 100));
  return blocks.join("\n\n").slice(0, length);
}

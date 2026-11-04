import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import ts from "typescript";
import ru from "../../src/shared/i18n/ru.json";

// Older structural contracts inspect JSX. Resolve *referenced* catalog entries in a
// Russian source view so those contracts continue checking the actual UI copy.
// This does not execute code, alter assertions or supply text for unreferenced keys.
export function readLocalizedSource(path: string | URL, encoding: "utf8"): string {
  const input = readFileSync(path, encoding);
  if (!/\.(?:tsx?|jsx?)$/.test(String(path))) return input;
  const source = ts.createSourceFile(String(path), input, ts.ScriptTarget.Latest, true);
  function message(node: ts.Node): string | undefined {
    if (!ts.isCallExpression(node) || node.expression.getText(source) !== "translate") return;
    const key = node.arguments[0];
    assert.ok(key && ts.isStringLiteral(key), "Translation keys must be static");
    assert.ok(Object.hasOwn(ru, key.text), `Missing Russian translation: ${key.text}`);
    let result: string = ru[key.text as keyof typeof ru];
    const parameters = node.arguments[1];
    if (!parameters) return JSON.stringify(result);
    assert.ok(ts.isObjectLiteralExpression(parameters));
    for (const parameter of parameters.properties) {
      assert.ok(ts.isPropertyAssignment(parameter));
      result = result.replace(`{${parameter.name.getText(source)}}`, `\${${parameter.initializer.getText(source)}}`);
    }
    return '`' + result + '`';
  }
  const edits: [number, number, string][] = [];
  function visit(node: ts.Node) {
    if (ts.isGetAccessorDeclaration(node) && node.body?.statements.length === 1 && ts.isReturnStatement(node.body.statements[0])) {
      const expression = node.body.statements[0].expression;
      const value = expression && message(expression);
      if (value) { edits.push([node.getStart(source), node.end, `${node.name.getText(source)}: ${value}`]); return; }
    }
    if (ts.isJsxExpression(node) && node.expression) {
      const value = message(node.expression);
      if (value) {
        const replacement = value.startsWith('`') ? `{${value}}` : ts.isJsxAttribute(node.parent) ? value : JSON.parse(value);
        edits.push([node.getStart(source), node.end, replacement]); return;
      }
    }
    const value = message(node);
    if (value) { edits.push([node.getStart(source), node.end, value]); return; }
    ts.forEachChild(node, visit);
  }
  visit(source);
  let output = input;
  for (const [start, end, value] of edits.sort((a, b) => b[0] - a[0])) output = output.slice(0, start) + value + output.slice(end);
  return output;
}

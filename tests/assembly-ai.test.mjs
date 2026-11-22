import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogResult, calloutResult } from '../assembly-ai.mjs';

test('catalog totals come from source cells and count each source row once', () => {
  const input = { rows: [['Base', '2 un.'], ['Base', '3'], ['Tampa', ''], ['Pé', '?']] };
  const group = (name, entries) => ({ name, specification: '', code: '', kind: 'peca', entries });
  const entry = (row, quantityColumn = 1) => ({ row, quantityColumn });
  const result = {
    parts: [group('Base', [entry(0), entry(1)]), group('Tampa', [entry(2, -1)]), group('Pé', [entry(3)])],
    warnings: []
  };
  const catalog = catalogResult(input, result);
  assert.deepEqual(catalog.parts.map(({ name, quantity }) => [name, quantity]), [['Base', 5], ['Tampa', 1]]);
  assert.equal(catalog.warnings.length, 2);
  result.parts[0].entries.push(entry(0));
  assert.throws(() => catalogResult(input, result), /referências inconsistentes/);
});

test('marker results preserve unresolved parts and reject unrequested IDs and off-image coordinates', () => {
  const input = { pages: [{ id: 'image1', requested: ['a', 'b'] }] };
  const marker = { partId: 'a', x: 12, y: 20, tipX: 30, tipY: 40 };
  const result = { pages: [{ pageId: 'image1', markers: [marker], unresolved: [] }] };
  assert.equal(calloutResult(input, result).pages[0].unresolved[0].partId, 'b');
  marker.x = -1;
  assert.throws(() => calloutResult(input, result), /chamadas inválidas/);
  marker.x = 12;
  marker.partId = 'c';
  assert.throws(() => calloutResult(input, result), /chamadas inválidas/);
});

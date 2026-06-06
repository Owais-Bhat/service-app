import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const employeeSource = readFileSync(new URL('../src/pages/employee.js', import.meta.url), 'utf8');
const serverSource = readFileSync(new URL('../server/index.cjs', import.meta.url), 'utf8');

test('bill PDF capture sandbox is not clipped by a tiny hidden wrapper', () => {
  const functionStart = employeeSource.indexOf('async function renderBillToPdfBlob');
  assert.notEqual(functionStart, -1, 'renderBillToPdfBlob must exist');

  const functionEnd = employeeSource.indexOf('function blobToBase64', functionStart);
  assert.notEqual(functionEnd, -1, 'renderBillToPdfBlob block must end before blobToBase64');

  const source = employeeSource.slice(functionStart, functionEnd);

  assert.match(source, /classList\.add\(['"]pdf-rendering['"]\)/, 'should apply pdf-rendering class for capture overrides');
  assert.match(source, /style\.width = ['"]794px['"]/, 'should force node width to 794px');
  assert.match(source, /windowWidth: 794/, 'html2canvas should use 794px virtual window');
  assert.match(source, /width: 794/, 'html2canvas should be told to capture 794px width');
  assert.match(source, /hotfixes: \['px_scaling'\]/, 'jsPDF should use px_scaling hotfix for accurate sizing');
});

test('bill modal also offers a native print/save-as-pdf path', () => {
  assert.match(employeeSource, /function openBillPrintWindow/, 'native print fallback should exist');
  assert.match(employeeSource, /id="pb-print"/, 'modal should expose a print/save PDF button');
  assert.match(employeeSource, /@page \{ size: A4; margin: 0; \}/, 'print output should use A4 page setup');
  assert.match(employeeSource, /window\.print\(\)/, 'print path should invoke the browser print dialog');
});

test('amount breakdown reserves a visible fixed-width price column in both PDF renderers', () => {
  assert.match(employeeSource, /flex:0 0 112px/, 'browser PDF rows should reserve width for amounts');
  assert.match(employeeSource, /white-space:nowrap/, 'browser PDF amounts should not wrap or collapse');
  assert.match(serverSource, /const rightText = \(text, rightX, yy\)/, 'server PDF should position amounts from a fixed right edge');
  assert.match(serverSource, /rightText\(row\[1\], amountRight, ty\)/, 'server breakdown rows should use fixed right positioning');
  assert.match(serverSource, /rightText\(inr\(d\.total\), amountRight, ty\)/, 'server total should use fixed right positioning');
});

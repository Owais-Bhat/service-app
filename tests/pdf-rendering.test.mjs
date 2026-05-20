import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const employeeSource = readFileSync(new URL('../src/pages/employee.js', import.meta.url), 'utf8');

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

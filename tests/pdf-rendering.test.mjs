import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const employeeSource = readFileSync(new URL('../src/pages/employee.js', import.meta.url), 'utf8');

test('bill PDF capture sandbox is not clipped by a tiny hidden wrapper', () => {
  const functionStart = employeeSource.indexOf('async function renderBillToPdfBlob');
  assert.notEqual(functionStart, -1, 'renderBillToPdfBlob must exist');

  const functionEnd = employeeSource.indexOf('// Convert a Blob to a base64 string', functionStart);
  assert.notEqual(functionEnd, -1, 'renderBillToPdfBlob block must end before blobToBase64');

  const source = employeeSource.slice(functionStart, functionEnd);

  assert.match(source, /width:794px/, 'sandbox should render the invoice at A4 pixel width');
  assert.doesNotMatch(source, /width:1px/, 'capture wrapper must not constrain width to 1px');
  assert.doesNotMatch(source, /height:1px/, 'capture wrapper must not constrain height to 1px');
  assert.doesNotMatch(source, /overflow:hidden/, 'capture wrapper must not clip the invoice');
  assert.doesNotMatch(source, /z-index:-\d+/, 'capture wrapper must not sit behind the app while rendering');
  assert.match(source, /z-index:2147483647/, 'capture wrapper should render above app layers while html2canvas captures it');
});

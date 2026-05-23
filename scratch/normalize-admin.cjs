const fs = require('fs');

const file = 'src/pages/admin.js';
let source = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
const commentEndTokens = [
  'export',
  'async function',
  'function',
  'const',
  'let',
  'var',
  'if',
  'for',
  'return',
  'container',
  'overlay',
  'row',
  'btn',
  'window',
  'document',
  'try',
  'catch',
  'await',
  'bind',
  'filterAndRender',
  'bindRowActions',
  'updates',
  'billServices',
  'technicianName',
  'channel',
  'checkRemoval',
  'phoneToCompany',
  'companyPhones',
  'allPhones',
  'render',
];

let output = '';
let mode = null;
let escaped = false;
let templateExpressionDepth = 0;

for (let i = 0; i < source.length;) {
  const char = source[i];
  const next = source[i + 1];

  if (!mode && char === '/' && next === '/') {
    let end = -1;
    for (let j = i + 2; j < source.length; j++) {
      if (commentEndTokens.some(token => source.startsWith(token, j))) {
        end = j;
        break;
      }
    }
    if (end < 0) break;
    output += ' ';
    i = end;
    continue;
  }

  output += char;

  if (mode) {
    if (escaped) {
      escaped = false;
    } else if (char === '\\') {
      escaped = true;
    } else if (mode === '`' && char === '$' && next === '{') {
      output += next;
      i++;
      templateExpressionDepth++;
      mode = null;
    } else if (char === mode) {
      mode = null;
    }
  } else if (char === '\'' || char === '"' || char === '`') {
    mode = char;
  } else if (templateExpressionDepth && char === '}') {
    templateExpressionDepth--;
    mode = '`';
  }

  i++;
}

fs.writeFileSync(file, output, 'utf8');

const fs = require('fs');

const source = fs.readFileSync('src/pages/admin.js', 'utf8');
let mode = null;
let escaped = false;
let templateExpressionDepth = 0;
const comments = [];

for (let index = 0; index < source.length; index++) {
  const char = source[index];
  const next = source[index + 1];

  if (!mode && char === '/' && next === '/') {
    comments.push({
      index,
      context: source.slice(index - 120, index + 180),
    });
    index++;
    continue;
  }

  if (mode) {
    if (escaped) {
      escaped = false;
    } else if (char === '\\') {
      escaped = true;
    } else if (mode === '`' && char === '$' && next === '{') {
      index++;
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
}

console.log(`outside line comments: ${comments.length}`);
for (const item of comments) {
  console.log('\n---', item.index);
  console.log(item.context);
}

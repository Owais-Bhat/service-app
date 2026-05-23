const fs = require('fs');

const source = fs.readFileSync('src/pages/admin.js', 'utf8');
const points = [
  'renderCashCollectionsTab',
  'renderPricingTab',
  'renderFeedbackTab',
  'renderComplaintsTab',
  'renderAdsTab',
  'renderSettingsTab',
].map(name => [name, source.indexOf(`export async function ${name}`)]);

let mode = null;
let escaped = false;
let templateExpressionDepth = 0;
const states = {};

for (let index = 0; index < source.length; index++) {
  for (const [name, point] of points) {
    if (index === point) {
      states[name] = {
        index,
        mode,
        templateExpressionDepth,
        context: source.slice(index - 120, index + 120),
      };
    }
  }

  const char = source[index];
  const next = source[index + 1];

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

console.dir(states, { depth: null });

const fs = require('fs');

const file = 'src/pages/admin.js';
let source = fs.readFileSync(file, 'utf8');
const functionStart = source.indexOf('export async function renderSettingsTab');
const sectionStart = source.indexOf('  container.innerHTML = \\`', functionStart);
const sectionEnd = source.indexOf("  container.querySelector('#save-clockout-time')", sectionStart);

if (functionStart < 0 || sectionStart < 0 || sectionEnd < 0) {
  throw new Error(`Could not locate escaped settings section: ${JSON.stringify({ functionStart, sectionStart, sectionEnd })}`);
}

let section = source.slice(sectionStart, sectionEnd);
section = section.replaceAll('\\`', '`').replaceAll('\\${', '${');
source = source.slice(0, sectionStart) + section + source.slice(sectionEnd);
fs.writeFileSync(file, source, 'utf8');

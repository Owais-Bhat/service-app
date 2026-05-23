const fs = require('fs');

const file = 'src/pages/employee.js';
let source = fs.readFileSync(file, 'utf8');

source = source.replace(
  /function money\(value\) \{\r?\n  return `[^`]*\$\{Math\.round\(Number\(value\) \|\| 0\)\.toLocaleString\('en-IN'\)\}`;\r?\n\}/,
  "function money(value) {\n  return `\\u20B9${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;\n}"
);

fs.writeFileSync(file, source, 'utf8');

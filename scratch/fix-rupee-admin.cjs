const fs = require('fs');

const file = 'src/pages/admin.js';
let source = fs.readFileSync(file, 'utf8');

source = source.replace(
  "return '?' + val.toString().replace(/\\B(?=(\\d{3})+(?!\\d))/g, \",\");",
  "return '\\u20B9' + val.toString().replace(/\\B(?=(\\d{3})+(?!\\d))/g, \",\");",
);

source = source.replaceAll('?${', '\\u20B9${');
source = source.replaceAll('paid ?\\u20B9${row.bill_amount || \'\'}', 'paid \\u20B9${row.bill_amount || \'\'}');
source = source.replaceAll('Recorded ?\\u20B9${Math.round(total).toLocaleString(\'en-IN\')}', 'Recorded \\u20B9${Math.round(total).toLocaleString(\'en-IN\')}');

fs.writeFileSync(file, source, 'utf8');

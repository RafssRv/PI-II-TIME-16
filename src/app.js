// Compatibilidade com os testes Node legados; a implementação principal está em app.ts.
require('tsx/cjs');
module.exports = require('./app.ts');

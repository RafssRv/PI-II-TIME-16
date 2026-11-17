/*
Autor: Vinícius Panutti Salgado - RA: 25007329
Tela: Uso geral do sistema (compatibilidade com testes)

Descrição: 
Permite que os testes em JavaScript carreguem a aplicação definida em app.ts. Ativa o suporte ao TypeScript
pelo tsx e disponibiliza as funções exportadas pelo arquivo principal
*/
require('tsx/cjs');
module.exports = require('./app.ts');

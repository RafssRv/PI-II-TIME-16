/*
Autor: Vinícius Panutti Salgado - RA: 25007329
Tela: Uso geral do sistema (acesso ao banco nos testes)

Descrição: 
Disponibiliza a implementação de database.ts para os testes que utilizam JavaScript e require. Carrega o suporte
do tsx e encaminha a importação para o módulo de conexão com o MySQL
*/
require('tsx/cjs');
module.exports = require('./database.ts');

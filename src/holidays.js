/*
Autora: Priscila Amorim dos Santos - RA: 24787350
Tela: Cadastro e edição de demandas (compatibilidade com testes)

Descrição: Faz a ligação dos testes em JavaScript com o módulo holidays.ts. Utiliza o tsx para carregar o arquivo TypeScript
e disponibilizar a função de verificação de feriados nacionais
*/
require('tsx/cjs');
module.exports = require('./holidays.ts');

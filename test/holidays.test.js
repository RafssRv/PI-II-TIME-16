/*
Autor: Vinícius Panutti Salgado - RA: 25007329
Tela: Cadastro e edição de demandas (testes de feriados)

Descrição: 
Simula respostas da BrasilAPI para testar a identificação de feriados e a reutilização das consultas por ano. Confere também
o tratamento de respostas inválidas e verifica se uma consulta que falhou pode ser tentada novamente
*/
// node:test é o executor de testes que vem com o próprio Node.js e assert/strict traz as verificações em modo estrito.
const test = require('node:test');
const assert = require('node:assert/strict');
// Carrega o holidays.ts pelo atalho src/holidays.js.
const { isNationalHoliday } = require('../src/holidays');

// Os três testes trocam o fetch global (a função que faz a chamada HTTP) por uma versão falsa, para simular a
// BrasilAPI sem usar a internet. Cada teste guarda o fetch original e o restaura no final com t.after, para a troca
// não afetar os outros testes. Cada teste usa um ano diferente (2035, 2036 e 2037) porque o cache de feriados do
// holidays.ts fica na memória durante toda a execução: assim, o que um teste guardou no cache não interfere no outro.

// Primeira consulta de um ano chama a API; as seguintes do mesmo ano reaproveitam o resultado guardado.
test('consulta BrasilAPI e reutiliza o cache por ano', async (t) => {
  const original = global.fetch;
  t.after(() => { global.fetch = original; });
  let calls = 0;
  // O fetch falso conta as chamadas, confere o endereço pedido e devolve um objeto parecido com uma resposta
  // da API: ok verdadeiro e uma lista com um feriado (25/12/2035).
  global.fetch = async (url) => {
    calls++;
    assert.equal(url, 'https://brasilapi.com.br/api/feriados/v1/2035');
    return { ok: true, json: async () => [{ date: '2035-12-25' }] };
  };
  // 25/12 é feriado (true) e 24/12 não é (false). As duas perguntas são do mesmo ano, então a API é chamada uma
  // única vez (calls igual a 1): a segunda pergunta usou o cache.
  assert.equal(await isNationalHoliday('2035-12-25'), true);
  assert.equal(await isNationalHoliday('2035-12-24'), false);
  assert.equal(calls, 1);
});

// Uma consulta que falhou não deve ficar guardada no cache; a tentativa seguinte precisa chamar a API de novo.
test('falha da API não é armazenada em cache e retorna 503', async (t) => {
  const original = global.fetch;
  t.after(() => { global.fetch = original; });
  // Simula a API fora do ar: o fetch lança um erro. A consulta deve ser rejeitada com status 503
  // (serviço indisponível), que é o erro tratado pelo holidays.ts.
  global.fetch = async () => { throw new Error('offline'); };
  await assert.rejects(isNationalHoliday('2036-01-01'), { status: 503 });
  // A API "volta": o novo fetch responde com sucesso e a mesma data agora é reconhecida como feriado. Isso prova que
  // o erro anterior não ficou no cache e que o sistema tentou a API outra vez.
  global.fetch = async () => ({ ok: true, json: async () => [{ date: '2036-01-01' }] });
  assert.equal(await isNationalHoliday('2036-01-01'), true);
});

// Se a API responde, mas com um formato inesperado, o prazo não pode ser validado com esses dados.
test('resposta inválida da BrasilAPI impede validação do prazo', async (t) => {
  const original = global.fetch;
  t.after(() => { global.fetch = original; });
  // Em vez de uma lista de feriados, a resposta falsa traz um objeto { error: 'invalid' }. O holidays.ts recusa
  // esse formato e rejeita a consulta com 503, em vez de concluir que a data "não é feriado".
  global.fetch = async () => ({ ok: true, json: async () => ({ error: 'invalid' }) });
  await assert.rejects(isNationalHoliday('2037-01-01'), { status: 503 });
});
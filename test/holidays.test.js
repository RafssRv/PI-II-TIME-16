// Autor majoritário: Vinicius Panutti Salgado — R.A. 25007329.
// Carrega o executor de testes nativo do Node.
const test = require('node:test');
// Carrega asserções estritas para conferir respostas e rejeições das Promises.
const assert = require('node:assert/strict');
// Importa a função real de feriados pelo ponto de compatibilidade usado pelos testes.
const { isNationalHoliday } = require('../src/holidays');

// Verifica que duas datas do mesmo ano compartilham uma única consulta externa.
test('consulta BrasilAPI e reutiliza o cache por ano', async (t) => {
  // Guarda o fetch original para restaurar o ambiente ao terminar o cenário.
  const original = global.fetch;
  // Registra uma limpeza que restaura o fetch mesmo se uma asserção falhar.
  t.after(() => { global.fetch = original; });
  // Inicia o contador de chamadas feitas ao substituto da BrasilAPI.
  let calls = 0;
  // Substitui a rede por uma resposta controlada, mantendo a função de feriados real.
  global.fetch = async (url) => {
    // Conta a chamada para identificar consultas repetidas desnecessárias.
    calls++;
    // Confirma que a URL pede o ano da data examinada.
    assert.equal(url, 'https://brasilapi.com.br/api/feriados/v1/2035');
    // Simula uma resposta HTTP bem-sucedida com apenas o Natal no conjunto de feriados.
    return { ok: true, json: async () => [{ date: '2035-12-25' }] };
  };
  // Confirma que a data presente no conjunto é reconhecida como feriado.
  assert.equal(await isNationalHoliday('2035-12-25'), true);
  // Confirma que outra data do mesmo ano não é reconhecida como feriado.
  assert.equal(await isNationalHoliday('2035-12-24'), false);
  // Exige uma única chamada, demonstrando o reaproveitamento do cache anual.
  assert.equal(calls, 1);
});

// Verifica que uma consulta malsucedida é removida do cache para permitir nova tentativa.
test('falha da API não é armazenada em cache e retorna 503', async (t) => {
  // Preserva a implementação original de fetch antes de simular a falha.
  const original = global.fetch;
  // Garante a restauração do fetch após este teste.
  t.after(() => { global.fetch = original; });
  // Simula uma indisponibilidade de rede por rejeição da Promise de fetch.
  global.fetch = async () => { throw new Error('offline'); };
  // Exige que a função exponha o status 503 para a falha do serviço externo.
  await assert.rejects(isNationalHoliday('2036-01-01'), { status: 503 });
  // Troca a falha por uma resposta válida para o mesmo ano consultado anteriormente.
  global.fetch = async () => ({ ok: true, json: async () => [{ date: '2036-01-01' }] });
  // Confirma a recuperação: o erro anterior não pode ter ficado permanentemente no cache.
  assert.equal(await isNationalHoliday('2036-01-01'), true);
});

// Verifica a rejeição de um JSON que não respeita o formato de lista da BrasilAPI.
test('resposta inválida da BrasilAPI impede validação do prazo', async (t) => {
  // Guarda o fetch que deve ser restaurado após o cenário.
  const original = global.fetch;
  // Registra a restauração independentemente do resultado do teste.
  t.after(() => { global.fetch = original; });
  // Simula HTTP bem-sucedido com um objeto de erro onde deveria existir uma lista de datas.
  global.fetch = async () => ({ ok: true, json: async () => ({ error: 'invalid' }) });
  // Confirma que o formato inválido produz 503, impedindo validar um prazo com dados incorretos.
  await assert.rejects(isNationalHoliday('2037-01-01'), { status: 503 });
});

// Autor: Vinicius Panutti Salgado — R.A. 25007329
const test = require('node:test');
const assert = require('node:assert/strict');
const { isNationalHoliday } = require('../src/holidays');

test('consulta BrasilAPI e reutiliza o cache por ano', async (t) => {
  const original = global.fetch;
  t.after(() => { global.fetch = original; });
  let calls = 0;
  global.fetch = async (url) => {
    calls++;
    assert.equal(url, 'https://brasilapi.com.br/api/feriados/v1/2035');
    return { ok: true, json: async () => [{ date: '2035-12-25' }] };
  };
  assert.equal(await isNationalHoliday('2035-12-25'), true);
  assert.equal(await isNationalHoliday('2035-12-24'), false);
  assert.equal(calls, 1);
});

test('falha da API não é armazenada em cache e retorna 503', async (t) => {
  const original = global.fetch;
  t.after(() => { global.fetch = original; });
  global.fetch = async () => { throw new Error('offline'); };
  await assert.rejects(isNationalHoliday('2036-01-01'), { status: 503 });
  global.fetch = async () => ({ ok: true, json: async () => [{ date: '2036-01-01' }] });
  assert.equal(await isNationalHoliday('2036-01-01'), true);
});

test('resposta inválida da BrasilAPI impede validação do prazo', async (t) => {
  const original = global.fetch;
  t.after(() => { global.fetch = original; });
  global.fetch = async () => ({ ok: true, json: async () => ({ error: 'invalid' }) });
  await assert.rejects(isNationalHoliday('2037-01-01'), { status: 503 });
});

// Autor: Priscila Amorim dos Santos
// Descrição: Consulta e mantém em cache os feriados nacionais da BrasilAPI por ano.

const feriadosPorAno = new Map();

async function listarFeriados(ano) {
  if (feriadosPorAno.has(ano)) return feriadosPorAno.get(ano);

  const consulta = (async () => {
    let response;
    try {
      response = await fetch(`https://brasilapi.com.br/api/feriados/v1/${ano}`, {
        signal: AbortSignal.timeout(5000)
      });
    } catch {
      throw Object.assign(new Error('Não foi possível consultar os feriados nacionais. Tente novamente.'), {
        status: 503,
        publicMessage: 'Não foi possível validar o prazo com a API de feriados. Tente novamente.'
      });
    }

    if (!response.ok) {
      throw Object.assign(new Error(`A API de feriados respondeu com HTTP ${response.status}.`), {
        status: 503,
        publicMessage: 'Não foi possível validar o prazo com a API de feriados. Tente novamente.'
      });
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw Object.assign(new Error('A API de feriados retornou JSON inválido.'), {
        status: 503,
        publicMessage: 'A API de feriados retornou uma resposta inválida. Tente novamente.'
      });
    }
    if (!Array.isArray(payload) || payload.some((item) => typeof item.date !== 'string')) {
      throw Object.assign(new Error('Formato inesperado na resposta da API de feriados.'), {
        status: 503,
        publicMessage: 'A API de feriados retornou uma resposta inválida. Tente novamente.'
      });
    }
    return new Set(payload.map((item) => item.date));
  })();

  feriadosPorAno.set(ano, consulta);
  try {
    return await consulta;
  } catch (error) {
    feriadosPorAno.delete(ano);
    throw error;
  }
}

async function isNationalHoliday(data) {
  const feriados = await listarFeriados(Number(data.slice(0, 4)));
  return feriados.has(data);
}

module.exports = { isNationalHoliday };

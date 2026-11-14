// Autor: Priscila Amorim 
// Descrição: Consulta e mantém em cache os feriados nacionais da BrasilAPI por ano.

// Cache em memória: guarda, para cada ano, a consulta feita (e não só o resultado).
// Assim, várias requisições simultâneas para o mesmo ano compartilham uma única chamada à API.
const feriadosPorAno = new Map();

// Devolve o conjunto de datas (AAAA-MM-DD) que são feriados nacionais no ano informado.
async function listarFeriados(ano: number): Promise<Set<string>> {
  if (feriadosPorAno.has(ano)) return feriadosPorAno.get(ano);

  const consulta = (async () => {
    let response;
    try {
      // Limita a espera a 5 segundos para o sistema não travar se a API estiver fora do ar.
      response = await fetch(`https://brasilapi.com.br/api/feriados/v1/${ano}`, {
        signal: AbortSignal.timeout(5000)
      });
    } catch {
      // Falha de rede ou tempo esgotado. O status 503 indica serviço externo indisponível;
      // publicMessage é o texto que a API devolve ao usuário.
      throw Object.assign(new Error('Não foi possível consultar os feriados nacionais. Tente novamente.'), {
        status: 503,
        publicMessage: 'Não foi possível validar o prazo com a API de feriados. Tente novamente.'
      });
    }

    // A BrasilAPI respondeu, mas com erro (HTTP diferente de 2xx).
    if (!response.ok) {
      throw Object.assign(new Error(`A API de feriados respondeu com HTTP ${response.status}.`), {
        status: 503,
        publicMessage: 'Não foi possível validar o prazo com a API de feriados. Tente novamente.'
      });
    }

    // A resposta precisa ser um JSON válido...
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw Object.assign(new Error('A API de feriados retornou JSON inválido.'), {
        status: 503,
        publicMessage: 'A API de feriados retornou uma resposta inválida. Tente novamente.'
      });
    }
    // ...e uma lista em que todo item tenha o campo "date" (texto).
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
    // Consulta que falhou não fica no cache, para a próxima tentativa chamar a API de novo.
    feriadosPorAno.delete(ano);
    throw error;
  }
}

// Informa se a data (AAAA-MM-DD) é feriado nacional. Usada pela API para recusar prazos nesses dias.
async function isNationalHoliday(data: string): Promise<boolean> {
  const feriados = await listarFeriados(Number(data.slice(0, 4)));
  return feriados.has(data);
}

export { isNationalHoliday };
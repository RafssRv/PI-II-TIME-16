/*
Autora: Priscila Amorim dos Santos - RA: 24787350
Tela: Cadastro e edição de demandas (validação do prazo)

Descrição: 
Consulta os feriados nacionais na BrasilAPI e mantém as consultas em memória por ano para reutilizá-las. Informa
se uma data é feriado e trata falhas de comunicação, demora na resposta e dados inválidos recebidos do serviço
*/

// Guarda em memória os feriados já consultados
const feriadosPorAno = new Map();

// Consulta e devolve as datas de feriados nacionais de um ano
async function listarFeriados(ano: number): Promise<Set<string>> {

  // Reutiliza o resultado já armazenado quando a consulta foi feita antes
  if (feriadosPorAno.has(ano)) return feriadosPorAno.get(ano);

  // Cria uma consulta que será compartilhada e usada no cache
  const consulta = (async () => {
    let response;

    try {
      // Limita a espera da API externa a cinco segundos
      response = await fetch(`https://brasilapi.com.br/api/feriados/v1/${ano}`, {
        signal: AbortSignal.timeout(5000)
      });
    } catch {
      // Cria uma resposta de serviço indisponível para falhas de rede
      throw Object.assign(new Error('Não foi possível consultar os feriados nacionais. Tente novamente.'), {
        status: 503,
        publicMessage: 'Não foi possível validar o prazo com a API de feriados. Tente novamente.'
      });
    }

    // Trata respostas HTTP que não foram concluídas com sucesso
    if (!response.ok) {
      throw Object.assign(new Error(`A API de feriados respondeu com HTTP ${response.status}.`), {
        status: 503,
        publicMessage: 'Não foi possível validar o prazo com a API de feriados. Tente novamente.'
      });
    }

    // Tenta converter a resposta em dados JSON
    let payload;

    try {
      payload = await response.json();
    } catch {
      throw Object.assign(new Error('A API de feriados retornou JSON inválido.'), {
        status: 503,
        publicMessage: 'A API de feriados retornou uma resposta inválida. Tente novamente.'
      });
    }

    // Confere se os dados são uma lista com datas em texto
    if (!Array.isArray(payload) || payload.some((item) => typeof item.date !== 'string')) {
      throw Object.assign(new Error('Formato inesperado na resposta da API de feriados.'), {
        status: 503,
        publicMessage: 'A API de feriados retornou uma resposta inválida. Tente novamente.'
      });
    }
    return new Set(payload.map((item) => item.date));
  })();

  // Salva a consulta no cache antes de aguardar o resultado
  feriadosPorAno.set(ano, consulta);

  try {
    // Aguarda a consulta e devolve o conjunto de feriados
    return await consulta;
  } catch (error) {
    // Remove consultas com falha para permitir nova tentativa
    feriadosPorAno.delete(ano);
    throw error;
  }
}

// Verifica se uma data ano-mês-dia corresponde a um feriado nacional
async function isNationalHoliday(data: string): Promise<boolean> {

  // Obtém o ano da data e busca os feriados correspondentes
  const feriados = await listarFeriados(Number(data.slice(0, 4)));
  
  // Verifica se a data completa está dentro da lista
  return feriados.has(data);
}

// Exporta a função usada pelas rotas de cadastro e edição
export { isNationalHoliday };
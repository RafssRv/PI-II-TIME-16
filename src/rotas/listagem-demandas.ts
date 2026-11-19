/*
Autora: Heloisa L Marinho - RA: 25893868
Tela: Listagem de Demandas (backend)

Descrição: 
Busca as demandas no banco conforme o texto pesquisado, os filtros e a ordenação recebidos. Confere os parâmetros da
consulta e limita os resultados de líderes e membros aos projetos dos quais participam, retornando os dados para a listagem
*/

import { Express, Request, Response } from 'express';
import type { Database, DbConnection } from '../app';

const STATUS_VALIDOS = ['ABERTA', 'EM_ANDAMENTO', 'EM_REVISAO', 'CONCLUIDA', 'CANCELADA'];
const PRIORIDADES_VALIDAS = ['CRITICA', 'ALTA', 'MEDIA', 'BAIXA'];
const TIPOS_VALIDOS = ['TAREFA', 'DEFEITO', 'MELHORIA', 'DOCUMENTACAO'];

// Verifica se um identificador (ID) é um número inteiro e maior que zero
function converterIdPositivo(valor: string): number | null {
  
  const numero = Number(valor);
  
  if (!Number.isInteger(numero) || numero < 1) {
    return null;
  }

  return numero;
}

// Registra na aplicação a rota responsável por consultar as demandas
export function registrarListagemDemandas(app: Express, database: Database) {

  // Rota que recebe os pedidos de listagem e pega os filtros enviados pelo usuário
  app.get('/api/demandas', async (req: Request, res: Response) => {

    // Pega os filtros que chegaram na URL e guarda cada um em uma variável 
    const {
      status,
      prioridade,
      tipo,
      projeto_id,
      responsavel_id,
      busca,
      ordenacao
    } = req.query;

    const nomesParametros = ['status', 'prioridade', 'tipo', 'projeto_id', 'responsavel_id', 'busca', 'ordenacao'];
    
    // Percorre cada nome para verificar o valor correspondente no pedido
    for (const nome of nomesParametros) {
      
      const valor = req.query[nome];
      
      // Verifica se o valor é um texto
      // Undefined indica que o parâmetro não foi enviado
      if (valor !== undefined && typeof valor !== 'string') {
        return res.status(400).json({ error: `Filtro inválido: ${nome}.` });
      }
    }

    // Verifica se os filtros de status, prioridade e tipo possuem valores permitidos
    // Ignora filtros não informados ou vazios e retorna erro caso algum valor seja inválido
    if (typeof status === 'string' && status !== '' && !STATUS_VALIDOS.includes(status)) {
      return res.status(400).json({ error: 'Filtro inválido: status.' });
    }

    if (typeof prioridade === 'string' && prioridade !== '' && !PRIORIDADES_VALIDAS.includes(prioridade)) {
      return res.status(400).json({ error: 'Filtro inválido: prioridade.' });
    }

    if (typeof tipo === 'string' && tipo !== '' && !TIPOS_VALIDOS.includes(tipo)) {
      return res.status(400).json({ error: 'Filtro inválido: tipo.' });
    }

    // Variável para guardar o ID do projeto depois que ele for convertido em número 
    // Ele pode guardar um número inteiro positivo ou null caso o filtro não tenha sido informado
    let projetoIdNumero: number | null = null;

    if (typeof projeto_id === 'string' && projeto_id !== '') {

      // Converte o ID para um número positivo 
      projetoIdNumero = converterIdPositivo(projeto_id);
      
      // Interrompe a consulta se o valor não for um número inteiro positivo
      if (projetoIdNumero === null) {
        return res.status(400).json({ error: 'Identificador inválido.' });
      }
    }

    let responsavelIdNumero: number | null = null;

    if (typeof responsavel_id === 'string' && responsavel_id !== '') {
      responsavelIdNumero = converterIdPositivo(responsavel_id);
      
      if (responsavelIdNumero === null) {
        return res.status(400).json({ error: 'Identificador inválido.' });
      }
    }

    // Define a ordem em que as demandas serão apresentadas
    // ? ordenacao: se as condições forem verdadeiras, utiliza a ordenação informada.
    // : 'criacao_desc': caso contrário, utiliza a ordenação padrão, que coloca as demandas mais recentes primeiro
    const criterioOrdenacao = typeof ordenacao === 'string' && ordenacao !== '' ? ordenacao : 'criacao_desc';
    
    // Cria a variável que guardará a ordenação SQL
    let sqlOrdenacao = '';

    // Define a ordenação SQL conforme o critério escolhido pelo usuário
    if (criterioOrdenacao === 'criacao_desc') {
      // DESC coloca as datas mais recentes primeiro; quando há empate, o maior ID vem primeiro
      sqlOrdenacao = 'd.criado_em DESC, d.id DESC';
    
    } else if (criterioOrdenacao === 'prazo_asc') {
      // ASC coloca as datas de prazo mais próximas primeiro; IS NULL coloca primeiro as demandas sem prazo definido
      sqlOrdenacao = 'd.prazo IS NULL, d.prazo ASC, d.id DESC';
    
    // Ordenação pela prioridade 
    } else if (criterioOrdenacao === 'prioridade_desc') {
      // FIELD define a sequência das prioridades, da crítica até a baixa
      sqlOrdenacao = "FIELD(d.prioridade, 'CRITICA', 'ALTA', 'MEDIA', 'BAIXA'), d.id DESC";
    
    // Ordenação pelo status 
    } else if (criterioOrdenacao === 'status') {
      // Coloca primeiro as demandas abertas, depois as em andamento, em revisão, concluídas e canceladas
      sqlOrdenacao = "FIELD(d.status, 'ABERTA', 'EM_ANDAMENTO', 'EM_REVISAO', 'CONCLUIDA', 'CANCELADA'), d.id DESC";
    
    } else {
      return res.status(400).json({ error: 'Ordenação inválida.' });
    }

    // Cria a variável da conexão com o banco 
    let conexao: DbConnection | undefined;
    
    try {
      // Espera a abertura da conexão antes de consultar o banco
      conexao = await database.connection();

      // Cria uma lista vazia para guardar as condições dos filtros que serão usados na consulta ao banco
      const filtrosSql: string[] = [];

      // Cria um objeto vazio para guardar os valores dos filtros informados pelo usuário
      const binds: any = {};

      // Verifica quais filtros foram informados pelo usuário
      // Guarda as condições na lista filtrosSql e os valores no objeto binds
      if (typeof status === 'string' && status !== '') {
        filtrosSql.push('d.status = :status');
        binds.status = status;
      }

      if (typeof prioridade === 'string' && prioridade !== '') {
        filtrosSql.push('d.prioridade = :prioridade');
        binds.prioridade = prioridade;
      }

      if (typeof tipo === 'string' && tipo !== '') {
        filtrosSql.push('d.tipo = :tipo');
        binds.tipo = tipo;
      }

      if (projetoIdNumero !== null) {
        filtrosSql.push('d.projeto_id = :projeto_id');
        binds.projeto_id = projetoIdNumero;
      }

      if (responsavelIdNumero !== null) {
        filtrosSql.push('d.responsavel_id = :responsavel_id');
        binds.responsavel_id = responsavelIdNumero;
      }

      // Verifica o perfil do usuário autenticado para limitar a consulta às demandas dos projetos em que ele participa
      if (req.authUser.perfil === 'LIDER' || req.authUser.perfil === 'MEMBRO') {

        // EXISTS verifica se há um vínculo entre o usuário e o projeto de cada demanda
        filtrosSql.push(
          'EXISTS (SELECT 1 FROM projeto_membros pm WHERE pm.projeto_id = d.projeto_id AND pm.usuario_id = :scope_usuario_id)'
        );

        // Usa o ID do usuário autenticado para conferir a participação no projeto
        binds.scope_usuario_id = req.authUser.id;
      }

      // Verifica se o usuário digitou algum texto para pesquisar demandas
      if (typeof busca === 'string' && busca !== '') {
        
        // Prepara a pesquisa pelo título ou pela descrição da demanda
        filtrosSql.push('(LOWER(d.titulo) LIKE :busca OR LOWER(d.descricao) LIKE :busca)');
        
        // Guarda o texto pesquisado
        // %: permite encontrar o texto no começo, meio ou final do título ou da descrição
        binds.busca = `%${busca.toLowerCase()}%`;
      }

      // Junta as condições dos filtros para buscar somente as demandas que atendem a elas
      const clausulaWhere = filtrosSql.length > 0 ? `WHERE ${filtrosSql.join(' AND ')}` : '';
      
      // Monta o comando SQL para buscar os dados das demandas, seus projetos e responsáveis
      // Também inclui os filtros e a ordenação escolhida
      const sql = `SELECT d.*, p.nome AS projeto_nome, u.nome AS responsavel_nome
        FROM demandas d
        JOIN projetos p ON p.id = d.projeto_id
        LEFT JOIN usuarios u ON u.id = d.responsavel_id
        ${clausulaWhere}
        ORDER BY ${sqlOrdenacao}`;

      // Envia o SQL e os valores separados ao banco e espera a lista de resultados
      const demandas = await conexao.query(sql, binds);
      return res.status(200).json(demandas);
    } catch (erro) {
      console.error(erro);
      return res.status(500).json({ error: 'Erro ao listar demandas.' });
    } finally {
      // Fecha a conexão com o banco depois que a consulta termina 
      if (conexao) await conexao.close();
    }
  });
}

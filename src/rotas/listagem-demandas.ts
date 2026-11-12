import { Express, Request, Response } from 'express';
import type { Database, DbConnection } from '../app';

const STATUS_VALIDOS = ['ABERTA', 'EM_ANDAMENTO', 'EM_REVISAO', 'CONCLUIDA', 'CANCELADA'];
const PRIORIDADES_VALIDAS = ['CRITICA', 'ALTA', 'MEDIA', 'BAIXA'];
const TIPOS_VALIDOS = ['TAREFA', 'DEFEITO', 'MELHORIA', 'DOCUMENTACAO'];

// Converte e valida um identificador numérico positivo informado na query string.
function converterIdPositivo(valor: string): number | null {
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 1) {
    return null;
  }
  return numero;
}

// Registra a rota GET /api/demandas no aplicativo Express.
export function registrarListagemDemandas(app: Express, database: Database) {
  app.get('/api/demandas', async (req: Request, res: Response) => {
    const {
      status,
      prioridade,
      tipo,
      projeto_id,
      responsavel_id,
      busca,
      ordenacao
    } = req.query;

    // 1. Verifica se algum parâmetro foi enviado repetido (como array) em vez de texto simples.
    const nomesParametros = ['status', 'prioridade', 'tipo', 'projeto_id', 'responsavel_id', 'busca', 'ordenacao'];
    for (const nome of nomesParametros) {
      const valor = req.query[nome];
      if (valor !== undefined && typeof valor !== 'string') {
        return res.status(400).json({ error: `Filtro inválido: ${nome}.` });
      }
    }

    // 2. Valida os filtros de status, prioridade e tipo.
    if (typeof status === 'string' && status !== '' && !STATUS_VALIDOS.includes(status)) {
      return res.status(400).json({ error: 'Filtro inválido: status.' });
    }

    if (typeof prioridade === 'string' && prioridade !== '' && !PRIORIDADES_VALIDAS.includes(prioridade)) {
      return res.status(400).json({ error: 'Filtro inválido: prioridade.' });
    }

    if (typeof tipo === 'string' && tipo !== '' && !TIPOS_VALIDOS.includes(tipo)) {
      return res.status(400).json({ error: 'Filtro inválido: tipo.' });
    }

    // 3. Valida os filtros numéricos de projeto e responsável.
    let projetoIdNumero: number | null = null;
    if (typeof projeto_id === 'string' && projeto_id !== '') {
      projetoIdNumero = converterIdPositivo(projeto_id);
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

    // 4. Define as opções válidas de ordenação com if / else if.
    const criterioOrdenacao = typeof ordenacao === 'string' && ordenacao !== '' ? ordenacao : 'criacao_desc';
    let sqlOrdenacao = '';

    if (criterioOrdenacao === 'criacao_desc') {
      sqlOrdenacao = 'd.criado_em DESC, d.id DESC';
    } else if (criterioOrdenacao === 'prazo_asc') {
      sqlOrdenacao = 'd.prazo IS NULL, d.prazo ASC, d.id DESC';
    } else if (criterioOrdenacao === 'prioridade_desc') {
      sqlOrdenacao = "FIELD(d.prioridade, 'CRITICA', 'ALTA', 'MEDIA', 'BAIXA'), d.id DESC";
    } else if (criterioOrdenacao === 'status') {
      sqlOrdenacao = "FIELD(d.status, 'ABERTA', 'EM_ANDAMENTO', 'EM_REVISAO', 'CONCLUIDA', 'CANCELADA'), d.id DESC";
    } else {
      return res.status(400).json({ error: 'Ordenação inválida.' });
    }

    // Modo com banco de dados (Reunião 5): monta os filtros SQL com binds e fecha a conexão no finally.
    let conexao: DbConnection | undefined;
    try {
      conexao = await database.connection();

      const filtrosSql: string[] = [];
      const binds: any = {};

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

      // Líderes e membros visualizam apenas demandas dos projetos aos quais pertencem.
      if (req.authUser.perfil === 'LIDER' || req.authUser.perfil === 'MEMBRO') {
        filtrosSql.push(
          'EXISTS (SELECT 1 FROM projeto_membros pm WHERE pm.projeto_id = d.projeto_id AND pm.usuario_id = :scope_usuario_id)'
        );
        binds.scope_usuario_id = req.authUser.id;
      }

      if (typeof busca === 'string' && busca !== '') {
        filtrosSql.push('(LOWER(d.titulo) LIKE :busca OR LOWER(d.descricao) LIKE :busca)');
        binds.busca = `%${busca.toLowerCase()}%`;
      }

      const clausulaWhere = filtrosSql.length > 0 ? `WHERE ${filtrosSql.join(' AND ')}` : '';
      const sql = `SELECT d.*, p.nome AS projeto_nome, u.nome AS responsavel_nome
        FROM demandas d
        JOIN projetos p ON p.id = d.projeto_id
        LEFT JOIN usuarios u ON u.id = d.responsavel_id
        ${clausulaWhere}
        ORDER BY ${sqlOrdenacao}`;

      const demandas = await conexao.query(sql, binds);
      return res.status(200).json(demandas);
    } catch (erro) {
      console.error(erro);
      return res.status(500).json({ error: 'Erro ao listar demandas.' });
    } finally {
      if (conexao) await conexao.close();
    }
  });
}

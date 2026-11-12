/*
  Autora: Priscila Amorim dos Santos / RA: 24787350
  Descrição: Rotas da Aluna 5 — Detalhes da demanda e comentários:
  - GET /api/demandas/:id: retorna todos os campos de uma demanda específica ou 404 quando não existir;
  - GET /api/demandas/:id/comentarios: lista os comentários vinculados à demanda;
  - POST /api/demandas/:id/comentarios: registra um comentário vinculado obrigatoriamente à demanda
    e a um usuário, com data e horário definidos automaticamente pelo servidor, impedindo texto vazio
    e retornando 404 quando a demanda não existir.
  Contempla os dados de teste em memória (Reunião 4) e o banco de dados com try/catch/finally (Reunião 5).
*/
import { Express, Request, Response } from 'express';
import type { Database, DbConnection } from '../app';
import { isNationalHoliday } from '../holidays';

const STATUS_VALIDOS = ['ABERTA', 'EM_ANDAMENTO', 'EM_REVISAO', 'CONCLUIDA', 'CANCELADA'];
const PRIORIDADES_VALIDAS = ['CRITICA', 'ALTA', 'MEDIA', 'BAIXA'];
const TIPOS_VALIDOS = ['TAREFA', 'DEFEITO', 'MELHORIA', 'DOCUMENTACAO'];

function obterTransicoesPermitidas(statusAtual: string, ehMembro: boolean): string[] {
  if (ehMembro) {
    if (statusAtual === 'ABERTA') return ['EM_ANDAMENTO'];
    if (statusAtual === 'EM_ANDAMENTO') return ['EM_REVISAO'];
    return [];
  }

  if (statusAtual === 'ABERTA') return ['EM_ANDAMENTO', 'CANCELADA'];
  if (statusAtual === 'EM_ANDAMENTO') return ['EM_REVISAO', 'CANCELADA'];
  if (statusAtual === 'EM_REVISAO') return ['EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA'];
  if (statusAtual === 'CANCELADA') return ['ABERTA'];
  return [];
}

function obterHojeCivil(dataReferencia: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(dataReferencia);
}

function validarDataPrazo(valor: unknown): { valido: boolean; data: string | null } {
  if (valor === null || valor === '') {
    return { valido: true, data: null };
  }
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    return { valido: false, data: null };
  }
  const data = new Date(`${valor}T00:00:00Z`);
  if (!Number.isFinite(data.getTime()) || data.toISOString().slice(0, 10) !== valor || valor < '1000-01-01') {
    return { valido: false, data: null };
  }
  return { valido: true, data: valor };
}

export interface ComentarioDemanda {
  id: number;
  demanda_id: number;
  autor_id: number;
  autor_nome?: string;
  texto: string;
  criado_em: string;
  atualizado_em?: string;
}

export interface DetalheDemanda {
  id: number;
  projeto_id: number;
  projeto_nome: string;
  criador_id: number;
  responsavel_id: number | null;
  responsavel_nome: string | null;
  titulo: string;
  descricao: string;
  tipo: string;
  prioridade: string;
  status: string;
  prazo: string | null;
  criado_em: string;
  atualizado_em: string;
}

// Dados em memória para demonstração da Reunião 4 quando o banco de dados não é informado.
export const demandasDetalhesTeste: DetalheDemanda[] = [
  {
    id: 1,
    projeto_id: 1,
    projeto_nome: 'Portal Acadêmico',
    criador_id: 1,
    responsavel_id: 3,
    responsavel_nome: 'Carla Mendes',
    titulo: 'Corrigir falha no login',
    descricao: 'Usuários não conseguem autenticar quando digitam e-mail com letras maiúsculas.',
    tipo: 'DEFEITO',
    prioridade: 'CRITICA',
    status: 'ABERTA',
    prazo: '2026-11-12',
    criado_em: '2026-11-01T10:00:00.000Z',
    atualizado_em: '2026-11-01T10:00:00.000Z'
  },
  {
    id: 2,
    projeto_id: 1,
    projeto_nome: 'Portal Acadêmico',
    criador_id: 2,
    responsavel_id: 2,
    responsavel_nome: 'Ana Souza',
    titulo: 'Criar tela de dashboard',
    descricao: 'Exibir cards com o resumo de demandas por status, prioridade e tipo.',
    tipo: 'TAREFA',
    prioridade: 'ALTA',
    status: 'EM_ANDAMENTO',
    prazo: '2026-11-15',
    criado_em: '2026-11-02T14:30:00.000Z',
    atualizado_em: '2026-11-03T09:15:00.000Z'
  }
];

export const comentariosTeste: ComentarioDemanda[] = [
  {
    id: 1,
    demanda_id: 1,
    autor_id: 2,
    autor_nome: 'Ana Souza',
    texto: 'Consegui reproduzir o erro no ambiente de homologação.',
    criado_em: '2026-11-01T11:20:00.000Z',
    atualizado_em: '2026-11-01T11:20:00.000Z'
  }
];

// Valida e converte o identificador recebido por parâmetro de rota (req.params.id).
function converterIdPositivo(valor: unknown): number | null {
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 1) {
    return null;
  }
  return numero;
}

// Verifica se o usuário autenticado tem acesso ao projeto da demanda no banco de dados.
async function usuarioPodeAcessarDemanda(
  conexao: DbConnection,
  usuario: { id: number; perfil: 'ADMIN' | 'LIDER' | 'MEMBRO' },
  projetoId: number
): Promise<boolean> {
  if (usuario.perfil === 'ADMIN') {
    return true;
  }
  const vinculo = await conexao.query(
    'SELECT 1 FROM projeto_membros WHERE projeto_id = :projeto_id AND usuario_id = :usuario_id',
    { projeto_id: projetoId, usuario_id: usuario.id }
  );
  return vinculo.length > 0;
}

// Registra as rotas de detalhes, edição de demanda e comentários.
export function registrarDetalhesEComentarios(
  app: Express,
  database?: Database,
  obterAgora: () => Date = () => new Date(),
  verificarFeriado: (dataIso: string) => Promise<boolean> = isNationalHoliday
) {
  // Rota 1: GET /api/demandas/:id — Retorna todos os campos de uma demanda específica ou 404.
  app.get('/api/demandas/:id', async (req: Request, res: Response) => {
    const { id } = req.params;
    const demandaId = converterIdPositivo(id);

    if (demandaId === null) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }

    // Modo em memória (Reunião 4): busca a demanda pelo ID com find.
    if (!database) {
      const demandaEncontrada = demandasDetalhesTeste.find((item) => item.id === demandaId);
      if (!demandaEncontrada) {
        return res.status(404).json({ error: 'Demanda não encontrado(a).' });
      }

      const comentariosDaDemanda = comentariosTeste.filter(
        (comentario) => comentario.demanda_id === demandaId
      );

      return res.status(200).json({
        ...demandaEncontrada,
        comentarios: comentariosDaDemanda,
        historico: []
      });
    }

    // Modo com banco de dados (Reunião 5): consulta a demanda, comentários e histórico e fecha no finally.
    let conexao: DbConnection | undefined;
    try {
      conexao = await database.connection();

      const linhasDemanda = await conexao.query(
        `SELECT d.*, p.nome AS projeto_nome, u.nome AS responsavel_nome
         FROM demandas d
         JOIN projetos p ON p.id = d.projeto_id
         LEFT JOIN usuarios u ON u.id = d.responsavel_id
         WHERE d.id = :id`,
        { id: demandaId }
      );

      if (linhasDemanda.length === 0) {
        return res.status(404).json({ error: 'Demanda não encontrado(a).' });
      }

      const demanda = linhasDemanda[0];
      const possuiAcesso = await usuarioPodeAcessarDemanda(
        conexao,
        req.authUser,
        Number(demanda.projeto_id)
      );

      if (!possuiAcesso) {
        return res.status(404).json({ error: 'Demanda não encontrado(a).' });
      }

      const comentarios = await conexao.query(
        `SELECT c.*, u.nome AS autor_nome
         FROM comentarios c
         JOIN usuarios u ON u.id = c.autor_id
         WHERE c.demanda_id = :id
         ORDER BY c.criado_em`,
        { id: demandaId }
      );

      const historico = await conexao.query(
        `SELECT h.*, u.nome AS autor_nome
         FROM historico_demandas h
         JOIN usuarios u ON u.id = h.autor_id
         WHERE h.demanda_id = :id
         ORDER BY h.criado_em`,
        { id: demandaId }
      );

      return res.status(200).json({
        ...demanda,
        comentarios,
        historico
      });
    } catch (erro) {
      console.error(erro);
      return res.status(500).json({ error: 'Erro ao buscar detalhes da demanda.' });
    } finally {
      if (conexao) await conexao.close();
    }
  });

  // Rota 2: GET /api/demandas/:id/comentarios — Lista os comentários de uma demanda específica.
  app.get('/api/demandas/:id/comentarios', async (req: Request, res: Response) => {
    const { id } = req.params;
    const demandaId = converterIdPositivo(id);

    if (demandaId === null) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }

    // Modo em memória (Reunião 4).
    if (!database) {
      const demandaEncontrada = demandasDetalhesTeste.find((item) => item.id === demandaId);
      if (!demandaEncontrada) {
        return res.status(404).json({ error: 'Demanda não encontrado(a).' });
      }

      const comentariosDaDemanda = comentariosTeste.filter(
        (comentario) => comentario.demanda_id === demandaId
      );
      return res.status(200).json(comentariosDaDemanda);
    }

    // Modo com banco de dados (Reunião 5).
    let conexao: DbConnection | undefined;
    try {
      conexao = await database.connection();

      const demandas = await conexao.query('SELECT * FROM demandas WHERE id = :id', {
        id: demandaId
      });

      if (demandas.length === 0) {
        return res.status(404).json({ error: 'Demanda não encontrado(a).' });
      }

      const possuiAcesso = await usuarioPodeAcessarDemanda(
        conexao,
        req.authUser,
        Number(demandas[0].projeto_id)
      );

      if (!possuiAcesso) {
        return res.status(404).json({ error: 'Demanda não encontrado(a).' });
      }

      const comentarios = await conexao.query(
        `SELECT c.*, u.nome AS autor_nome
         FROM comentarios c
         JOIN usuarios u ON u.id = c.autor_id
         WHERE c.demanda_id = :id
         ORDER BY c.criado_em, c.id`,
        { id: demandaId }
      );

      return res.status(200).json(comentarios);
    } catch (erro) {
      console.error(erro);
      return res.status(500).json({ error: 'Erro ao listar comentários da demanda.' });
    } finally {
      if (conexao) await conexao.close();
    }
  });

  // Rota 3: POST /api/demandas/:id/comentarios — Registra um novo comentário vinculado à demanda e ao usuário.
  app.post('/api/demandas/:id/comentarios', async (req: Request, res: Response) => {
    const { id } = req.params;
    const { texto, autor_id } = req.body || {};

    // 1. Valida o identificador da demanda na URL (req.params.id).
    const demandaId = converterIdPositivo(id);
    if (demandaId === null) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }

    // 2. Impede comentários com texto vazio ou fora do tamanho permitido.
    if (texto === undefined || texto === null || texto === '') {
      return res.status(400).json({ error: 'Campo obrigatório ausente: texto.' });
    }

    if (typeof texto !== 'string') {
      return res.status(400).json({ error: 'Comentário deve ser um texto.' });
    }

    const textoLimpo = texto.trim();
    if (textoLimpo.length < 3 || textoLimpo.length > 500) {
      return res.status(400).json({ error: 'Comentário deve ter entre 3 e 500 caracteres.' });
    }

    // 3. Vincula obrigatoriamente o comentário a um usuário (prioriza o usuário autenticado na sessão).
    const usuarioId = req.authUser?.id ?? converterIdPositivo(autor_id);
    if (!usuarioId) {
      return res.status(400).json({ error: 'O comentário deve estar vinculado a um usuário válido.' });
    }

    // 4. Define a data e o horário automaticamente no servidor.
    const dataHoraServidor = new Date().toISOString();

    // Modo em memória (Reunião 4).
    if (!database) {
      const demandaEncontrada = demandasDetalhesTeste.find((item) => item.id === demandaId);
      if (!demandaEncontrada) {
        return res.status(404).json({ error: 'Demanda não encontrado(a).' });
      }

      const novoComentario: ComentarioDemanda = {
        id: comentariosTeste.length + 1,
        demanda_id: demandaId,
        autor_id: usuarioId,
        autor_nome: req.authUser?.nome || 'Usuário',
        texto: textoLimpo,
        criado_em: dataHoraServidor,
        atualizado_em: dataHoraServidor
      };

      comentariosTeste.push(novoComentario);
      return res.status(201).json(novoComentario);
    }

    // Modo com banco de dados (Reunião 5): verifica existência da demanda, insere o comentário e fecha no finally.
    let conexao: DbConnection | undefined;
    try {
      conexao = await database.connection();

      const demandas = await conexao.query('SELECT * FROM demandas WHERE id = :id', {
        id: demandaId
      });

      if (demandas.length === 0) {
        return res.status(404).json({ error: 'Demanda não encontrado(a).' });
      }

      const possuiAcesso = await usuarioPodeAcessarDemanda(
        conexao,
        req.authUser,
        Number(demandas[0].projeto_id)
      );

      if (!possuiAcesso) {
        return res.status(404).json({ error: 'Demanda não encontrado(a).' });
      }

      const resultadoInsert = await conexao.execute(
        `INSERT INTO comentarios (demanda_id, autor_id, texto)
         VALUES (:demanda_id, :autor_id, :texto)`,
        {
          demanda_id: demandaId,
          autor_id: usuarioId,
          texto: textoLimpo
        }
      );

      await conexao.commit();
      return res.status(201).json({ id: resultadoInsert.insertId });
    } catch (erro) {
      if (conexao) await conexao.rollback();
      console.error(erro);
      return res.status(500).json({ error: 'Erro ao registrar comentário.' });
    } finally {
      if (conexao) await conexao.close();
    }
  });

  // Rota 4: PATCH /api/demandas/:id — Atualiza dados ou avança o status de uma demanda registrando histórico.
  app.patch('/api/demandas/:id', async (req: Request, res: Response) => {
    const corpo = req.body || {};
    const camposPermitidos = [
      'titulo',
      'descricao',
      'tipo',
      'prioridade',
      'status',
      'prazo',
      'responsavel_id',
      'projeto_id'
    ];
    const alteracoes = Object.keys(corpo).filter((chave) => camposPermitidos.includes(chave));

    if (alteracoes.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo permitido informado.' });
    }

    const ehMembro = req.authUser?.perfil === 'MEMBRO';
    if (ehMembro && alteracoes.some((campo) => campo !== 'status')) {
      return res.status(403).json({
        error: 'Membros da equipe só podem alterar o status de demandas atribuídas a eles.'
      });
    }

    const valoresValidados: any = {};
    for (const campo of alteracoes) {
      const valor = corpo[campo];

      if (campo === 'titulo') {
        if (typeof valor !== 'string' || valor.trim().length < 3 || valor.trim().length > 100) {
          return res.status(400).json({ error: 'Título deve ter entre 3 e 100 caracteres.' });
        }
        valoresValidados[campo] = valor.trim();
      } else if (campo === 'descricao') {
        if (typeof valor !== 'string' || valor.trim().length < 10 || valor.trim().length > 1000) {
          return res.status(400).json({ error: 'Descrição deve ter entre 10 e 1000 caracteres.' });
        }
        valoresValidados[campo] = valor.trim();
      } else if (campo === 'status') {
        if (!STATUS_VALIDOS.includes(valor)) {
          return res.status(400).json({ error: 'Valor inválido: status.' });
        }
        valoresValidados[campo] = valor;
      } else if (campo === 'prioridade') {
        if (!PRIORIDADES_VALIDAS.includes(valor)) {
          return res.status(400).json({ error: 'Valor inválido: prioridade.' });
        }
        valoresValidados[campo] = valor;
      } else if (campo === 'tipo') {
        if (!TIPOS_VALIDOS.includes(valor)) {
          return res.status(400).json({ error: 'Valor inválido: tipo.' });
        }
        valoresValidados[campo] = valor;
      } else if (campo === 'projeto_id') {
        const idProjeto = converterIdPositivo(valor);
        if (idProjeto === null) {
          return res.status(400).json({ error: 'Identificador inválido.' });
        }
        valoresValidados[campo] = idProjeto;
      } else if (campo === 'responsavel_id') {
        if (valor === null || valor === '') {
          valoresValidados[campo] = null;
        } else {
          const idResponsavel = converterIdPositivo(valor);
          if (idResponsavel === null) {
            return res.status(400).json({ error: 'Identificador inválido.' });
          }
          valoresValidados[campo] = idResponsavel;
        }
      } else if (campo === 'prazo') {
        const resultadoPrazo = validarDataPrazo(valor);
        if (!resultadoPrazo.valido) {
          return res.status(400).json({ error: 'Prazo inválido: use AAAA-MM-DD.' });
        }
        valoresValidados[campo] = resultadoPrazo.data;

        if (valoresValidados[campo] && valoresValidados[campo] < obterHojeCivil(obterAgora())) {
          return res.status(400).json({ error: 'O prazo não pode estar no passado.' });
        }

        if (valoresValidados[campo] && (await verificarFeriado(valoresValidados[campo]))) {
          return res.status(400).json({ error: 'O prazo não pode cair em um feriado nacional.' });
        }
      }
    }

    const demandaId = converterIdPositivo(req.params.id);
    if (demandaId === null) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }

    if (!database) {
      return res.status(204).end();
    }

    let conexao: DbConnection | undefined;
    try {
      conexao = await database.connection();

      const linhas = await conexao.query('SELECT * FROM demandas WHERE id = :id FOR UPDATE', {
        id: demandaId
      });
      if (linhas.length === 0) {
        await conexao.rollback();
        return res.status(404).json({ error: 'Demanda não encontrado.' });
      }

      const demandaAtual = linhas[0];
      const possuiAcesso = await usuarioPodeAcessarDemanda(
        conexao,
        req.authUser,
        Number(demandaAtual.projeto_id)
      );
      if (!possuiAcesso) {
        await conexao.rollback();
        return res.status(404).json({ error: 'Demanda não encontrado.' });
      }

      if (ehMembro && Number(demandaAtual.responsavel_id) !== Number(req.authUser.id)) {
        await conexao.rollback();
        return res.status(403).json({
          error: 'Membros só podem alterar o status das demandas atribuídas a eles.'
        });
      }

      if (
        ehMembro &&
        (!valoresValidados.status ||
          !obterTransicoesPermitidas(demandaAtual.status, true).includes(valoresValidados.status))
      ) {
        await conexao.rollback();
        return res.status(403).json({
          error: 'Membros só podem avançar demandas atribuídas de Aberta para Em andamento e de Em andamento para Em revisão.'
        });
      }

      if (
        valoresValidados.status &&
        valoresValidados.status !== demandaAtual.status &&
        !obterTransicoesPermitidas(demandaAtual.status, false).includes(valoresValidados.status)
      ) {
        await conexao.rollback();
        return res.status(400).json({
          error: 'Transição de status inválida. Siga o ciclo Aberta → Em andamento → Em revisão → Concluída.'
        });
      }

      const projetoId = valoresValidados.projeto_id ?? Number(demandaAtual.projeto_id);
      const mudouProjeto = projetoId !== Number(demandaAtual.projeto_id);
      if (mudouProjeto) {
        const projetos = await conexao.query(
          'SELECT id FROM projetos WHERE id = :id AND ativo = 1',
          { id: projetoId }
        );
        if (projetos.length === 0) {
          await conexao.rollback();
          return res.status(400).json({ error: 'O projeto de destino precisa existir e estar ativo.' });
        }

        const acessoDestino = await usuarioPodeAcessarDemanda(conexao, req.authUser, projetoId);
        if (!acessoDestino) {
          await conexao.rollback();
          return res.status(403).json({
            error: 'Você precisa ter acesso aos projetos de origem e de destino para mover a demanda.'
          });
        }
      }

      const informouResponsavel = alteracoes.includes('responsavel_id');
      const responsavelId = informouResponsavel ? valoresValidados.responsavel_id : demandaAtual.responsavel_id;
      if (responsavelId && (mudouProjeto || informouResponsavel)) {
        const membros = await conexao.query(
          'SELECT u.id FROM projeto_membros pm JOIN usuarios u ON u.id = pm.usuario_id WHERE pm.projeto_id = :projeto_id AND pm.usuario_id = :usuario_id AND u.ativo = 1',
          { projeto_id: projetoId, usuario_id: responsavelId }
        );
        if (membros.length === 0) {
          if (informouResponsavel) {
            await conexao.rollback();
            return res.status(400).json({
              error: 'O responsável deve ser um usuário ativo vinculado ao projeto.'
            });
          }
          valoresValidados.responsavel_id = null;
          alteracoes.push('responsavel_id');
        }
      }

      const alteracoesReais = alteracoes.filter(
        (campo) => String(demandaAtual[campo] ?? '') !== String(valoresValidados[campo] ?? '')
      );

      if (alteracoesReais.length > 0) {
        const binds: any = {};
        for (const campo of alteracoesReais) {
          binds[campo] = valoresValidados[campo];
        }
        binds.id = demandaId;

        const camposSql = alteracoesReais.map((chave) => `${chave} = :${chave}`).join(', ');
        await conexao.execute(
          `UPDATE demandas SET ${camposSql}, atualizado_em = CURRENT_TIMESTAMP(6) WHERE id = :id`,
          binds
        );

        for (const campo of alteracoesReais) {
          await conexao.execute(
            `INSERT INTO historico_demandas (demanda_id, autor_id, acao, campo, valor_anterior, valor_novo)
             VALUES (:id, :autor_id, 'ALTERACAO', :campo, :anterior, :novo)`,
            {
              id: demandaId,
              autor_id: req.authUser.id,
              campo,
              anterior: demandaAtual[campo] == null ? null : String(demandaAtual[campo]),
              novo: valoresValidados[campo] == null ? null : String(valoresValidados[campo])
            }
          );
        }
      }

      await conexao.commit();
      return res.status(204).end();
    } catch (erro: any) {
      if (conexao) await conexao.rollback();
      const statusErro = erro?.status || 500;
      const mensagemErro = statusErro === 500 ? 'Erro ao atualizar demanda.' : erro.message;
      return res.status(statusErro).json({ error: mensagemErro });
    } finally {
      if (conexao) await conexao.close();
    }
  });

  // Rota 5: DELETE /api/demandas/:id — Bloqueia exclusão física para preservar o histórico.
  app.delete('/api/demandas/:id', (_req: Request, res: Response) => {
    return res.set('Allow', 'GET, PATCH').status(405).json({
      error: 'Demandas não podem ser excluídas. Altere o status para CANCELADA para preservar o histórico.'
    });
  });

  // Rota 6: PATCH /api/comentarios/:id — Atualiza o texto de um comentário existente.
  app.patch('/api/comentarios/:id', async (req: Request, res: Response) => {
    const corpo = req.body || {};
    if (corpo.texto === undefined || corpo.texto === null || String(corpo.texto).trim() === '') {
      return res.status(400).json({ error: 'Campo obrigatório: texto' });
    }

    if (typeof corpo.texto !== 'string' || corpo.texto.trim().length < 3 || corpo.texto.trim().length > 500) {
      return res.status(400).json({ error: 'Comentário deve ter entre 3 e 500 caracteres.' });
    }

    const comentarioId = converterIdPositivo(req.params.id);
    if (comentarioId === null) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }

    if (!database) {
      return res.status(204).end();
    }

    let conexao: DbConnection | undefined;
    try {
      conexao = await database.connection();
      const linhas = await conexao.query(
        'SELECT c.id, c.autor_id, d.* FROM comentarios c JOIN demandas d ON d.id = c.demanda_id WHERE c.id = :id',
        { id: comentarioId }
      );
      if (linhas.length === 0) {
        return res.status(404).json({ error: 'Comentário não encontrado.' });
      }

      const possuiAcesso = await usuarioPodeAcessarDemanda(
        conexao,
        req.authUser,
        Number(linhas[0].projeto_id)
      );
      if (!possuiAcesso) {
        return res.status(404).json({ error: 'Comentário não encontrado.' });
      }

      if (req.authUser.perfil !== 'ADMIN' && Number(linhas[0].autor_id) !== Number(req.authUser.id)) {
        return res.status(403).json({ error: 'Você só pode editar seus próprios comentários.' });
      }

      await conexao.execute(
        'UPDATE comentarios SET texto = :texto, atualizado_em = CURRENT_TIMESTAMP(6) WHERE id = :id',
        { texto: corpo.texto.trim(), id: comentarioId }
      );
      await conexao.commit();
      return res.status(204).end();
    } catch (erro) {
      if (conexao) await conexao.rollback();
      console.error(erro);
      return res.status(500).json({ error: 'Erro ao atualizar comentário.' });
    } finally {
      if (conexao) await conexao.close();
    }
  });

  // Rota 7: DELETE /api/comentarios/:id — Remove um comentário (autor ou ADMIN).
  app.delete('/api/comentarios/:id', async (req: Request, res: Response) => {
    const comentarioId = converterIdPositivo(req.params.id);
    if (comentarioId === null) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }

    if (!database) {
      return res.status(204).end();
    }

    let conexao: DbConnection | undefined;
    try {
      conexao = await database.connection();
      const linhas = await conexao.query(
        'SELECT c.id, c.autor_id, d.* FROM comentarios c JOIN demandas d ON d.id = c.demanda_id WHERE c.id = :id',
        { id: comentarioId }
      );
      if (linhas.length === 0) {
        return res.status(404).json({ error: 'Comentário não encontrado.' });
      }

      const possuiAcesso = await usuarioPodeAcessarDemanda(
        conexao,
        req.authUser,
        Number(linhas[0].projeto_id)
      );
      if (!possuiAcesso) {
        return res.status(404).json({ error: 'Comentário não encontrado.' });
      }

      if (req.authUser.perfil !== 'ADMIN' && Number(linhas[0].autor_id) !== Number(req.authUser.id)) {
        return res.status(403).json({ error: 'Você só pode excluir seus próprios comentários.' });
      }

      await conexao.execute('DELETE FROM comentarios WHERE id = :id', { id: comentarioId });
      await conexao.commit();
      return res.status(204).end();
    } catch (erro) {
      if (conexao) await conexao.rollback();
      console.error(erro);
      return res.status(500).json({ error: 'Erro ao excluir comentário.' });
    } finally {
      if (conexao) await conexao.close();
    }
  });
}

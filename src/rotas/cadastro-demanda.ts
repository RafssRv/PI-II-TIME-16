import { Express, Request, Response } from 'express';
import type { Database, DbConnection } from '../app';
import { isNationalHoliday } from '../holidays';

type TipoDemanda = 'TAREFA' | 'DEFEITO' | 'MELHORIA' | 'DOCUMENTACAO';
type PrioridadeDemanda = 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAIXA';
const TIPOS_VALIDOS: TipoDemanda[] = ['TAREFA', 'DEFEITO', 'MELHORIA', 'DOCUMENTACAO'];
const PRIORIDADES_VALIDAS: PrioridadeDemanda[] = ['CRITICA', 'ALTA', 'MEDIA', 'BAIXA'];

// Valida e converte um identificador numérico positivo.
function converterIdPositivo(valor: unknown): number | null {
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 1) {
    return null;
  }
  return numero;
}

// Obtém a data civil atual (YYYY-MM-DD) no fuso de São Paulo.
function obterHojeCivil(dataReferencia: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(dataReferencia);
}

// Valida se o prazo informado está no formato YYYY-MM-DD e se é uma data existente no calendário.
function validarFormatoPrazo(valor: unknown): { valido: boolean; data: string | null } {
  if (valor === undefined || valor === null || valor === '') {
    return { valido: true, data: null };
  }

  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    return { valido: false, data: null };
  }

  const dataConvertida = new Date(`${valor}T00:00:00.000Z`);
  if (Number.isNaN(dataConvertida.getTime()) || dataConvertida.toISOString().slice(0, 10) !== valor) {
    return { valido: false, data: null };
  }

  return { valido: true, data: valor };
}

// Registra as rotas GET /api/projetos e POST /api/demandas no aplicativo Express.
export function registrarCadastroDemandaEProjetos(
  app: Express,
  database: Database,
  obterAgora: () => Date = () => new Date(),
  verificarFeriado: (dataIso: string) => Promise<boolean> = isNationalHoliday
) {
  // Rota 1: GET /api/projetos — Lista os projetos pré-cadastrados.
  app.get('/api/projetos', async (req: Request, res: Response) => {
    const { incluir_inativos } = req.query;

    // Valida o parâmetro opcional incluir_inativos da query string.
    if (
      incluir_inativos !== undefined &&
      (typeof incluir_inativos !== 'string' || !['0', '1'].includes(incluir_inativos))
    ) {
      return res.status(400).json({ error: 'Filtro de projetos inválido.' });
    }

    if (incluir_inativos === '1' && req.authUser?.perfil !== 'ADMIN') {
      return res.status(403).json({
        error: 'Somente um administrador pode consultar todos os projetos inativos.'
      });
    }

    // Modo com banco de dados (Reunião 5): abre a conexão no try e fecha no finally.
    let conexao: DbConnection | undefined;
    try {
      conexao = await database.connection();

      if (req.authUser.perfil === 'ADMIN') {
        const filtroAtivo = incluir_inativos === '1' ? '' : 'WHERE ativo = 1';
        const projetos = await conexao.query(
          `SELECT id, nome, descricao, ativo, criado_em, atualizado_em FROM projetos ${filtroAtivo} ORDER BY nome`
        );
        return res.status(200).json(projetos);
      }

      const projetosDoUsuario = await conexao.query(
        `SELECT p.id, p.nome, p.descricao, p.ativo, p.criado_em, p.atualizado_em
         FROM projetos p
         JOIN projeto_membros pm ON pm.projeto_id = p.id
         WHERE pm.usuario_id = :usuario_id AND p.ativo = 1
         ORDER BY p.nome`,
        { usuario_id: req.authUser.id }
      );
      return res.status(200).json(projetosDoUsuario);
    } catch (erro) {
      console.error(erro);
      return res.status(500).json({ error: 'Erro ao listar projetos.' });
    } finally {
      if (conexao) await conexao.close();
    }
  });

  // Rota 2: POST /api/demandas — Cadastra uma nova demanda validando os dados no servidor.
  app.post('/api/demandas', async (req: Request, res: Response) => {
    // Verifica permissão (apenas ADMIN e LIDER podem cadastrar demandas).
    if (!['ADMIN', 'LIDER'].includes(req.authUser?.perfil)) {
      return res.status(403).json({ error: 'Membros da equipe não podem criar demandas.' });
    }

    const corpo = req.body || {};

    // 1. Exige projeto, título, descrição, tipo e prioridade.
    const camposObrigatorios = ['projeto_id', 'titulo', 'descricao', 'tipo', 'prioridade'];
    for (const campo of camposObrigatorios) {
      if (corpo[campo] === undefined || corpo[campo] === null || corpo[campo] === '') {
        return res.status(400).json({ error: `Campo obrigatório ausente: ${campo}.` });
      }
    }

    // 2. Valida o identificador do projeto.
    const projetoIdNumero = converterIdPositivo(corpo.projeto_id);
    if (projetoIdNumero === null) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }

    // 3. Valida o título (entre 3 e 100 caracteres) e a descrição (entre 10 e 1000 caracteres).
    if (typeof corpo.titulo !== 'string') {
      return res.status(400).json({ error: 'Título deve ser um texto.' });
    }
    const tituloLimpo = corpo.titulo.trim();
    if (tituloLimpo.length < 3 || tituloLimpo.length > 100) {
      return res.status(400).json({ error: 'Título deve ter entre 3 e 100 caracteres.' });
    }

    if (typeof corpo.descricao !== 'string') {
      return res.status(400).json({ error: 'Descrição deve ser um texto.' });
    }
    const descricaoLimpa = corpo.descricao.trim();
    if (descricaoLimpa.length < 10 || descricaoLimpa.length > 1000) {
      return res.status(400).json({ error: 'Descrição deve ter entre 10 e 1000 caracteres.' });
    }

    // 4. Aceita apenas os tipos Tarefa, Defeito, Melhoria ou Documentação
    // e apenas as prioridades Crítica, Alta, Média ou Baixa.
    if (!TIPOS_VALIDOS.includes(corpo.tipo)) {
      return res.status(400).json({ error: 'Tipo de demanda inválido.' });
    }

    if (!PRIORIDADES_VALIDAS.includes(corpo.prioridade)) {
      return res.status(400).json({ error: 'Prioridade inválida.' });
    }

    // 5. Valida o responsável quando informado (pode ficar em branco / null).
    let responsavelIdNumero: number | null = null;
    if (corpo.responsavel_id !== undefined && corpo.responsavel_id !== null && corpo.responsavel_id !== '') {
      responsavelIdNumero = converterIdPositivo(corpo.responsavel_id);
      if (responsavelIdNumero === null) {
        return res.status(400).json({ error: 'Identificador inválido.' });
      }
    }

    // 6. Valida o formato e a data do prazo de finalização, quando informado.
    const validacaoPrazo = validarFormatoPrazo(corpo.prazo);
    if (!validacaoPrazo.valido) {
      return res.status(400).json({ error: 'Prazo inválido. Use YYYY-MM-DD.' });
    }

    const prazoValidado = validacaoPrazo.data;
    if (prazoValidado) {
      const hoje = obterHojeCivil(obterAgora());
      if (prazoValidado < hoje) {
        return res.status(400).json({ error: 'O prazo não pode estar no passado.' });
      }

      if (await verificarFeriado(prazoValidado)) {
        return res.status(400).json({ error: 'O prazo não pode cair em um feriado nacional.' });
      }
    }

    // O INSERT usa o status Aberta e as datas definidos automaticamente pelo MySQL.
    // Modo com banco de dados (Reunião 5): verifica existência no banco, insere e fecha no finally.
    let conexao: DbConnection | undefined;
    try {
      conexao = await database.connection();

      // Verifica se o projeto informado existe e está ativo.
      const projetos = await conexao.query(
        'SELECT id FROM projetos WHERE id = :id AND ativo = 1',
        { id: projetoIdNumero }
      );
      if (projetos.length === 0) {
        await conexao.rollback();
        return res.status(400).json({ error: 'O projeto precisa existir e estar ativo.' });
      }

      // Se o usuário logado for LIDER, verifica se ele pertence ao projeto.
      if (req.authUser.perfil === 'LIDER') {
        const vinculoLider = await conexao.query(
          'SELECT 1 FROM projeto_membros WHERE projeto_id = :projeto_id AND usuario_id = :usuario_id',
          { projeto_id: projetoIdNumero, usuario_id: req.authUser.id }
        );
        if (vinculoLider.length === 0) {
          await conexao.rollback();
          return res.status(403).json({
            error: 'Líderes só podem criar demandas nos projetos aos quais estão vinculados.'
          });
        }
      }

      // Quando houver responsável informado, verifica se o usuário existe, está ativo e vinculado ao projeto.
      if (responsavelIdNumero !== null) {
        const membros = await conexao.query(
          'SELECT u.id FROM projeto_membros pm JOIN usuarios u ON u.id = pm.usuario_id WHERE pm.projeto_id = :projeto_id AND pm.usuario_id = :usuario_id AND u.ativo = 1',
          { projeto_id: projetoIdNumero, usuario_id: responsavelIdNumero }
        );
        if (membros.length === 0) {
          await conexao.rollback();
          return res.status(400).json({
            error: 'O responsável deve ser um usuário ativo vinculado ao projeto.'
          });
        }
      }

      // Insere a demanda no banco (status assume 'ABERTA' e criado_em/atualizado_em são gerados no servidor).
      const resultadoInsert = await conexao.execute(
        `INSERT INTO demandas (projeto_id, criador_id, responsavel_id, titulo, descricao, tipo, prioridade, prazo)
         VALUES (:projeto_id, :criador_id, :responsavel_id, :titulo, :descricao, :tipo, :prioridade, :prazo)`,
        {
          projeto_id: projetoIdNumero,
          criador_id: req.authUser.id,
          responsavel_id: responsavelIdNumero,
          titulo: tituloLimpo,
          descricao: descricaoLimpa,
          tipo: corpo.tipo,
          prioridade: corpo.prioridade,
          prazo: prazoValidado
        }
      );

      const idCriado = resultadoInsert.insertId;

      // Registra a criação no histórico da demanda na mesma transação.
      await conexao.execute(
        `INSERT INTO historico_demandas (demanda_id, autor_id, acao, valor_novo)
         VALUES (:id, :autor_id, 'CRIACAO', :titulo)`,
        {
          id: idCriado,
          autor_id: req.authUser.id,
          titulo: tituloLimpo
        }
      );

      await conexao.commit();
      return res.status(201).json({ id: idCriado });
    } catch (erro: any) {
      if (conexao) await conexao.rollback();
      const statusErro = erro?.status || 500;
      const mensagemErro = statusErro === 500 ? 'Erro interno no servidor.' : erro.message;
      return res.status(statusErro).json({ error: mensagemErro });
    } finally {
      if (conexao) await conexao.close();
    }
  });

  // Rota 3: POST /api/projetos — Cadastra um novo projeto (restrito a ADMIN).
  app.post('/api/projetos', async (req: Request, res: Response) => {
    if (req.authUser?.perfil !== 'ADMIN') {
      return res.status(403).json({ error: 'Somente um administrador pode cadastrar projetos.' });
    }

    const corpo = req.body || {};
    if (corpo.nome === undefined || corpo.nome === null || String(corpo.nome).trim() === '') {
      return res.status(400).json({ error: 'Campo obrigatório: nome' });
    }

    if (typeof corpo.nome !== 'string' || corpo.nome.trim().length < 2 || corpo.nome.trim().length > 100) {
      return res.status(400).json({ error: 'Nome do projeto deve ter entre 2 e 100 caracteres.' });
    }

    const nomeLimpo = corpo.nome.trim();
    let descricaoLimpa: string | null = null;
    if (corpo.descricao !== undefined && corpo.descricao !== null && corpo.descricao !== '') {
      if (
        typeof corpo.descricao !== 'string' ||
        corpo.descricao.trim().length < 1 ||
        corpo.descricao.trim().length > 1000
      ) {
        return res.status(400).json({ error: 'Descrição deve ter entre 1 e 1000 caracteres.' });
      }
      descricaoLimpa = corpo.descricao.trim();
    }

    let conexao: DbConnection | undefined;
    try {
      conexao = await database.connection();
      const resultado = await conexao.execute(
        'INSERT INTO projetos (nome, descricao) VALUES (:nome, :descricao)',
        { nome: nomeLimpo, descricao: descricaoLimpa }
      );
      await conexao.commit();
      return res.status(201).json({ id: resultado.insertId });
    } catch (erro) {
      if (conexao) await conexao.rollback();
      console.error(erro);
      return res.status(500).json({ error: 'Erro ao cadastrar projeto.' });
    } finally {
      if (conexao) await conexao.close();
    }
  });

  // Rota 4: PATCH /api/projetos/:id — Atualiza dados de um projeto (restrito a ADMIN).
  app.patch('/api/projetos/:id', async (req: Request, res: Response) => {
    if (req.authUser?.perfil !== 'ADMIN') {
      return res.status(403).json({ error: 'Somente um administrador pode alterar projetos.' });
    }

    const projetoId = converterIdPositivo(req.params.id);
    if (projetoId === null) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }

    const corpo = req.body || {};
    const camposPermitidos = ['nome', 'descricao', 'ativo'];
    const alteracoes = Object.keys(corpo).filter((chave) => camposPermitidos.includes(chave));

    if (alteracoes.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo permitido informado.' });
    }

    let conexao: DbConnection | undefined;
    try {
      conexao = await database.connection();
      const binds: any = {};
      for (const chave of alteracoes) {
        binds[chave] = corpo[chave];
      }
      binds.id = projetoId;

      const camposSql = alteracoes.map((chave) => `${chave} = :${chave}`).join(', ');
      const resultado = await conexao.execute(
        `UPDATE projetos SET ${camposSql}, atualizado_em = CURRENT_TIMESTAMP(6) WHERE id = :id`,
        binds
      );

      if (!resultado.affectedRows) {
        return res.status(404).json({ error: 'Projeto não encontrado.' });
      }

      await conexao.commit();
      return res.status(204).end();
    } catch (erro) {
      if (conexao) await conexao.rollback();
      console.error(erro);
      return res.status(500).json({ error: 'Erro ao atualizar projeto.' });
    } finally {
      if (conexao) await conexao.close();
    }
  });

  // Rota 5: DELETE /api/projetos/:id — Desativa um projeto sem apagar demandas ou histórico.
  app.delete('/api/projetos/:id', async (req: Request, res: Response) => {
    if (req.authUser?.perfil !== 'ADMIN') {
      return res.status(403).json({ error: 'Somente um administrador pode desativar projetos.' });
    }

    const projetoId = converterIdPositivo(req.params.id);
    if (projetoId === null) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }

    let conexao: DbConnection | undefined;
    try {
      conexao = await database.connection();
      const resultado = await conexao.execute(
        'UPDATE projetos SET ativo = 0, atualizado_em = CURRENT_TIMESTAMP(6) WHERE id = :id',
        { id: projetoId }
      );

      if (!resultado.affectedRows) {
        return res.status(404).json({ error: 'Projeto não encontrado.' });
      }

      await conexao.commit();
      return res.status(204).end();
    } catch (erro) {
      if (conexao) await conexao.rollback();
      console.error(erro);
      return res.status(500).json({ error: 'Erro ao desativar projeto.' });
    } finally {
      if (conexao) await conexao.close();
    }
  });

  // Rota 6: GET /api/projetos/:id/membros — Lista os membros vinculados ao projeto.
  app.get('/api/projetos/:id/membros', async (req: Request, res: Response) => {
    const projetoId = converterIdPositivo(req.params.id);
    if (projetoId === null) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }

    let conexao: DbConnection | undefined;
    try {
      conexao = await database.connection();

      if (req.authUser.perfil !== 'ADMIN') {
        const vinculo = await conexao.query(
          'SELECT 1 FROM projeto_membros WHERE projeto_id = :projeto_id AND usuario_id = :usuario_id',
          { projeto_id: projetoId, usuario_id: req.authUser.id }
        );
        if (vinculo.length === 0) {
          return res.status(404).json({ error: 'Projeto não encontrado.' });
        }
      }

      const membros = await conexao.query(
        `SELECT u.id, u.nome, u.email, u.perfil
         FROM projeto_membros pm
         JOIN usuarios u ON u.id = pm.usuario_id
         WHERE pm.projeto_id = :projeto_id AND u.ativo = 1
         ORDER BY u.nome`,
        { projeto_id: projetoId }
      );
      return res.status(200).json(membros);
    } catch (erro) {
      console.error(erro);
      return res.status(500).json({ error: 'Erro ao listar membros do projeto.' });
    } finally {
      if (conexao) await conexao.close();
    }
  });

  // Rota 7: POST /api/projetos/:id/membros — Vincula um usuário à equipe do projeto (restrito a ADMIN).
  app.post('/api/projetos/:id/membros', async (req: Request, res: Response) => {
    if (req.authUser?.perfil !== 'ADMIN') {
      return res.status(403).json({
        error: 'Somente um administrador pode gerenciar a equipe do projeto.'
      });
    }

    const corpo = req.body || {};
    if (corpo.usuario_id === undefined || corpo.usuario_id === null || corpo.usuario_id === '') {
      return res.status(400).json({ error: 'Campo obrigatório: usuario_id' });
    }

    const projetoId = converterIdPositivo(req.params.id);
    const usuarioId = converterIdPositivo(corpo.usuario_id);
    if (projetoId === null || usuarioId === null) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }

    let conexao: DbConnection | undefined;
    try {
      conexao = await database.connection();
      const projetos = await conexao.query(
        'SELECT id FROM projetos WHERE id = :id AND ativo = 1',
        { id: projetoId }
      );
      const usuarios = await conexao.query(
        'SELECT id FROM usuarios WHERE id = :id AND ativo = 1',
        { id: usuarioId }
      );

      if (projetos.length === 0 || usuarios.length === 0) {
        await conexao.rollback();
        return res.status(400).json({ error: 'Projeto e usuário precisam estar ativos.' });
      }

      await conexao.execute(
        'INSERT INTO projeto_membros (projeto_id, usuario_id) VALUES (:projeto_id, :usuario_id)',
        { projeto_id: projetoId, usuario_id: usuarioId }
      );
      await conexao.commit();
      return res.status(204).end();
    } catch (erro) {
      if (conexao) await conexao.rollback();
      console.error(erro);
      return res.status(500).json({ error: 'Erro ao adicionar membro ao projeto.' });
    } finally {
      if (conexao) await conexao.close();
    }
  });

  // Rota 8: DELETE /api/projetos/:projetoId/membros/:usuarioId — Remove um usuário da equipe do projeto.
  app.delete('/api/projetos/:projetoId/membros/:usuarioId', async (req: Request, res: Response) => {
    if (req.authUser?.perfil !== 'ADMIN') {
      return res.status(403).json({
        error: 'Somente um administrador pode gerenciar a equipe do projeto.'
      });
    }

    const projetoId = converterIdPositivo(req.params.projetoId);
    const usuarioId = converterIdPositivo(req.params.usuarioId);
    if (projetoId === null || usuarioId === null) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }

    let conexao: DbConnection | undefined;
    try {
      conexao = await database.connection();
      await conexao.execute(
        'DELETE FROM projeto_membros WHERE projeto_id = :projeto_id AND usuario_id = :usuario_id',
        { projeto_id: projetoId, usuario_id: usuarioId }
      );
      await conexao.commit();
      return res.status(204).end();
    } catch (erro) {
      if (conexao) await conexao.rollback();
      console.error(erro);
      return res.status(500).json({ error: 'Erro ao remover membro do projeto.' });
    } finally {
      if (conexao) await conexao.close();
    }
  });
}

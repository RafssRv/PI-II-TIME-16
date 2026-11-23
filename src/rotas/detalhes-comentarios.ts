/*
Autora: Priscila Amorim dos Santos - RA: 24787350
Tela: Detalhes da Demanda (backend)

Descrição: 
Reúne as consultas de uma demanda, de seus comentários e do histórico de alterações. Valida as edições e mudanças de
status conforme as permissões do usuário, registrando o histórico. Inclui a criação, edição e exclusão de comentários 
e bloqueia a exclusão física das demandas
*/

import { Express, Request, Response } from 'express';
import type { Database, DbConnection } from '../app';
import { isNationalHoliday } from '../holidays';

const STATUS_VALIDOS = ['ABERTA', 'EM_ANDAMENTO', 'EM_REVISAO', 'CONCLUIDA', 'CANCELADA'];

const PRIORIDADES_VALIDAS = ['CRITICA', 'ALTA', 'MEDIA', 'BAIXA'];

const TIPOS_VALIDOS = ['TAREFA', 'DEFEITO', 'MELHORIA', 'DOCUMENTACAO'];

// Determina quais mudanças de status são permitidas
function obterTransicoesPermitidas(statusAtual: string, ehMembro: boolean): string[] {
  
  // Membros só podem avançar demandas atribuídas a eles
  if (ehMembro) {
    if (statusAtual === 'ABERTA') return ['EM_ANDAMENTO'];
    if (statusAtual === 'EM_ANDAMENTO') return ['EM_REVISAO'];
    return [];
  }

  // Administradores e líderes podem cancelar e reabrir demandas conforme o fluxo
  if (statusAtual === 'ABERTA') return ['EM_ANDAMENTO', 'CANCELADA'];
  if (statusAtual === 'EM_ANDAMENTO') return ['EM_REVISAO', 'CANCELADA'];
  if (statusAtual === 'EM_REVISAO') return ['EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA'];
  if (statusAtual === 'CANCELADA') return ['ABERTA'];
  return [];
}

// Obtém a data atual no formato civil usado no Brasil
function obterHojeCivil(dataReferencia: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(dataReferencia);
}

// Confere se o prazo está escrito corretamente e corresponde a uma data real
function validarDataPrazo(valor: unknown): { valido: boolean; data: string | null } {
  
  // Permite que o prazo fique vazio
  if (valor === null || valor === '') {
    return { valido: true, data: null };
  }

  // Exige o formato ano-mês-dia
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    return { valido: false, data: null };
  }

  // Converte o texto e confere o calendário
  const data = new Date(`${valor}T00:00:00Z`);
  if (!Number.isFinite(data.getTime()) || data.toISOString().slice(0, 10) !== valor || valor < '1000-01-01') {
    return { valido: false, data: null };
  }

  // Devolve a data validada
  return { valido: true, data: valor };
}

// Valida e converte o identificador recebido por parâmetro de rota (req.params.id).
function converterIdPositivo(valor: unknown): number | null {

  // Tenta transformar o identificador em número
  const numero = Number(valor);

  // Recusa números inválidos, decimais ou menores que um
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

  // Administradores têm acesso a todas as demandas
  if (usuario.perfil === 'ADMIN') {
    return true;
  }

  // Procura um vínculo entre o usuário e o projeto da demanda
  const vinculo = await conexao.query(
    'SELECT 1 FROM projeto_membros WHERE projeto_id = :projeto_id AND usuario_id = :usuario_id',
    { projeto_id: projetoId, usuario_id: usuario.id }
  );

  // Indica se o vínculo existe
  return vinculo.length > 0;
}

// Registra as rotas de detalhes, edição de demanda e comentários.
export function registrarDetalhesEComentarios(
  app: Express,
  database: Database,
  obterAgora: () => Date = () => new Date(),
  verificarFeriado: (dataIso: string) => Promise<boolean> = isNationalHoliday
) {

  // Retorna os dados completos de uma demanda específica
  app.get('/api/demandas/:id', async (req: Request, res: Response) => {

    // Obtém e valida o identificador informado na URL
    const { id } = req.params;
    const demandaId = converterIdPositivo(id);

    if (demandaId === null) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }

    // Reserva a conexão usada pelas três consultas
    let conexao: DbConnection | undefined;
    try {

      // Abre uma conexão com o banco
      conexao = await database.connection();

      // Busca a demanda e os nomes do projeto e responsável
      const linhasDemanda = await conexao.query(
        `SELECT d.*, p.nome AS projeto_nome, u.nome AS responsavel_nome
         FROM demandas d
         JOIN projetos p ON p.id = d.projeto_id
         LEFT JOIN usuarios u ON u.id = d.responsavel_id
         WHERE d.id = :id`,
        { id: demandaId }
      );

      // Retorna 404 quando a demanda não existe
      if (linhasDemanda.length === 0) {
        return res.status(404).json({ error: 'Demanda não encontrado(a).' });
      }

      // Guarda os dados da demanda encontrada
      const demanda = linhasDemanda[0];

      // Confere se o usuário pode visualizar esse projeto
      const possuiAcesso = await usuarioPodeAcessarDemanda(
        conexao,
        req.authUser,
        Number(demanda.projeto_id)
      );

      // Esconde a demanda de usuários sem acesso
      if (!possuiAcesso) {
        return res.status(404).json({ error: 'Demanda não encontrado(a).' });
      }

      // Busca os comentários associados à demanda
      const comentarios = await conexao.query(
        `SELECT c.*, u.nome AS autor_nome
         FROM comentarios c
         JOIN usuarios u ON u.id = c.autor_id
         WHERE c.demanda_id = :id
         ORDER BY c.criado_em`,
        { id: demandaId }
      );

      // Busca o histórico completo de alterações
      const historico = await conexao.query(
        `SELECT h.*, u.nome AS autor_nome
         FROM historico_demandas h
         JOIN usuarios u ON u.id = h.autor_id
         WHERE h.demanda_id = :id
         ORDER BY h.criado_em`,
        { id: demandaId }
      );

      // Devolve demanda, comentários e histórico juntos
      return res.status(200).json({
        ...demanda,
        comentarios,
        historico
      });
    } catch (erro) {
      // Registra o erro no servidor
      console.error(erro);

      // Informa que não foi possível buscar os detalhes
      return res.status(500).json({ error: 'Erro ao buscar detalhes da demanda.' });
    } finally {
      // Fecha a conexão ao finalizar
      if (conexao) await conexao.close();
    }
  });

  // Lista os comentários de uma demanda específica
  app.get('/api/demandas/:id/comentarios', async (req: Request, res: Response) => {

    // Obtém e valida o identificador da demanda
    const { id } = req.params;
    const demandaId = converterIdPositivo(id);

    if (demandaId === null) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }

    // Reserva a conexão usada pela consulta
    let conexao: DbConnection | undefined;

    try {
      // Abre uma conexão com o banco
      conexao = await database.connection();

      // Confere se a demanda existe e identifica seu projeto
      const demandas = await conexao.query('SELECT * FROM demandas WHERE id = :id', {
        id: demandaId
      });

      // Retorna 404 quando a demanda não existe
      if (demandas.length === 0) {
        return res.status(404).json({ error: 'Demanda não encontrado(a).' });
      }

      // Confere se o usuário pode acessar o projeto da demanda
      const possuiAcesso = await usuarioPodeAcessarDemanda(
        conexao,
        req.authUser,
        Number(demandas[0].projeto_id)
      );

      // Esconde os comentários de usuários sem acesso
      if (!possuiAcesso) {
        return res.status(404).json({ error: 'Demanda não encontrado(a).' });
      }

      // Busca os comentários em ordem cronológica
      const comentarios = await conexao.query(
        `SELECT c.*, u.nome AS autor_nome
         FROM comentarios c
         JOIN usuarios u ON u.id = c.autor_id
         WHERE c.demanda_id = :id
         ORDER BY c.criado_em, c.id`,
        { id: demandaId }
      );

      // Devolve a lista encontrada
      return res.status(200).json(comentarios);
    } catch (erro) {
      // Registra o erro no servidor
      console.error(erro);

      // Informa que não foi possível listar comentários
      return res.status(500).json({ error: 'Erro ao listar comentários da demanda.' });
    } finally {
      // Fecha a conexão ao finalizar
      if (conexao) await conexao.close();
    }
  });

  // Registra um novo comentário vinculado à demanda e ao usuário
  app.post('/api/demandas/:id/comentarios', async (req: Request, res: Response) => {

    // Obtém o identificador da demanda e o texto enviado
    const { id } = req.params;
    const { texto } = req.body || {};

    // Valida o identificador da demanda na URL
    const demandaId = converterIdPositivo(id);
    if (demandaId === null) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }

    // Exige que o texto tenha sido enviado
    if (texto === undefined || texto === null || texto === '') {
      return res.status(400).json({ error: 'Campo obrigatório ausente: texto.' });
    }

    // Exige que o comentário seja um texto
    if (typeof texto !== 'string') {
      return res.status(400).json({ error: 'Comentário deve ser um texto.' });
    }

    // Remove espaços extras antes de validar o tamanho
    const textoLimpo = texto.trim();

    // Exige comentário entre três e cinco centenas de caracteres
    if (textoLimpo.length < 3 || textoLimpo.length > 500) {
      return res.status(400).json({ error: 'Comentário deve ter entre 3 e 500 caracteres.' });
    }

    // Usa o usuário autenticado como autor do comentário
    const usuarioId = req.authUser.id;
    if (!usuarioId) {
      return res.status(400).json({ error: 'O comentário deve estar vinculado a um usuário válido.' });
    }

    // Reserva a conexão usada pelo cadastro do comentário
    let conexao: DbConnection | undefined;

    try {
      // Abre uma conexão com o banco
      conexao = await database.connection();

      // Confere se a demanda existe
      const demandas = await conexao.query('SELECT * FROM demandas WHERE id = :id', {
        id: demandaId
      });

      if (demandas.length === 0) {
        return res.status(404).json({ error: 'Demanda não encontrado(a).' });
      }

      // Confere se o usuário pode comentar nessa demanda
      const possuiAcesso = await usuarioPodeAcessarDemanda(
        conexao,
        req.authUser,
        Number(demandas[0].projeto_id)
      );

      if (!possuiAcesso) {
        return res.status(404).json({ error: 'Demanda não encontrado(a).' });
      }

      // Insere o comentário associado à demanda e ao usuário
      const resultadoInsert = await conexao.execute(
        `INSERT INTO comentarios (demanda_id, autor_id, texto)
         VALUES (:demanda_id, :autor_id, :texto)`,
        {
          demanda_id: demandaId,
          autor_id: usuarioId,
          texto: textoLimpo
        }
      );

      // Confirma o cadastro no banco
      await conexao.commit();

      // Devolve o identificador criado
      return res.status(201).json({ id: resultadoInsert.insertId });
    } catch (erro) {
      if (conexao) await conexao.rollback();
      console.error(erro);
      return res.status(500).json({ error: 'Erro ao registrar comentário.' });
    } finally {
      if (conexao) await conexao.close();
    }
  });

  // Atualiza dados ou status e registra as alterações no histórico
  app.patch('/api/demandas/:id', async (req: Request, res: Response) => {

    // Obtém os dados enviados pelo cliente
    const corpo = req.body || {};

    // Lista os únicos campos permitidos nesta atualização
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

    // Mantém somente os campos permitidos recebidos
    const alteracoes = Object.keys(corpo).filter((chave) => camposPermitidos.includes(chave));

    // Exige pelo menos uma alteração válida
    if (alteracoes.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo permitido informado.' });
    }

    // Identifica restrições específicas do perfil membro
    const ehMembro = req.authUser?.perfil === 'MEMBRO';

    // Impede membros de alterar dados além do status
    if (ehMembro && alteracoes.some((campo) => campo !== 'status')) {
      return res.status(403).json({
        error: 'Membros da equipe só podem alterar o status de demandas atribuídas a eles.'
      });
    }

    // Guarda os valores após a validação
    const valoresValidados: any = {};

    for (const campo of alteracoes) {
      // Lê o valor enviado para o campo atual
      const valor = corpo[campo];

      // Valida o título informado
      if (campo === 'titulo') {
        if (typeof valor !== 'string' || valor.trim().length < 3 || valor.trim().length > 100) {
          return res.status(400).json({ error: 'Título deve ter entre 3 e 100 caracteres.' });
        }
        valoresValidados[campo] = valor.trim();

      // Valida a descrição informada
      } else if (campo === 'descricao') {
        if (typeof valor !== 'string' || valor.trim().length < 10 || valor.trim().length > 1000) {
          return res.status(400).json({ error: 'Descrição deve ter entre 10 e 1000 caracteres.' });
        }
        valoresValidados[campo] = valor.trim();

      // Valida o novo status
      } else if (campo === 'status') {
        if (!STATUS_VALIDOS.includes(valor)) {
          return res.status(400).json({ error: 'Valor inválido: status.' });
        }
        valoresValidados[campo] = valor;

      // Valida a nova prioridade
      } else if (campo === 'prioridade') {
        if (!PRIORIDADES_VALIDAS.includes(valor)) {
          return res.status(400).json({ error: 'Valor inválido: prioridade.' });
        }
        valoresValidados[campo] = valor;

      // Valida o novo tipo
      } else if (campo === 'tipo') {
        if (!TIPOS_VALIDOS.includes(valor)) {
          return res.status(400).json({ error: 'Valor inválido: tipo.' });
        }
        valoresValidados[campo] = valor;

      // Converte e valida o novo projeto
      } else if (campo === 'projeto_id') {
        const idProjeto = converterIdPositivo(valor);
        if (idProjeto === null) {
          return res.status(400).json({ error: 'Identificador inválido.' });
        }
        valoresValidados[campo] = idProjeto;

      // Permite limpar o responsável ou validar um novo responsável
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

      // Valida prazo, dia passado e feriado nacional
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

    // Converte e valida o identificador da demanda
    const demandaId = converterIdPositivo(req.params.id);

    if (demandaId === null) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }

    // Reserva a conexão usada pela atualização completa
    let conexao: DbConnection | undefined;

    try {
      // Abre uma conexão com o banco
      conexao = await database.connection();

      // Bloqueia a demanda durante a alteração para evitar conflito
      const linhas = await conexao.query('SELECT * FROM demandas WHERE id = :id FOR UPDATE', {
        id: demandaId
      });

      if (linhas.length === 0) {
        await conexao.rollback();
        return res.status(404).json({ error: 'Demanda não encontrado.' });
      }

      const demandaAtual = linhas[0];

      // Confere se o usuário tem acesso ao projeto atual
      const possuiAcesso = await usuarioPodeAcessarDemanda(
        conexao,
        req.authUser,
        Number(demandaAtual.projeto_id)
      );

      if (!possuiAcesso) {
        await conexao.rollback();
        return res.status(404).json({ error: 'Demanda não encontrado.' });
      }

      // Membros só podem alterar demandas atribuídas a eles
      if (ehMembro && Number(demandaAtual.responsavel_id) !== Number(req.authUser.id)) {
        await conexao.rollback();
        return res.status(403).json({
          error: 'Membros só podem alterar o status das demandas atribuídas a eles.'
        });
      }

      // Impede membros de usar transições fora do fluxo permitido
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

      // Confere transições gerais para outros perfis
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

      // Usa o projeto atual ou o projeto escolhido na edição
      const projetoId = valoresValidados.projeto_id ?? Number(demandaAtual.projeto_id);

      // Verifica se a demanda está sendo movida de projeto
      const mudouProjeto = projetoId !== Number(demandaAtual.projeto_id);

      if (mudouProjeto) {
        // Confere se o projeto de destino existe e está ativo
        const projetos = await conexao.query(
          'SELECT id FROM projetos WHERE id = :id AND ativo = 1',
          { id: projetoId }
        );

        if (projetos.length === 0) {
          await conexao.rollback();
          return res.status(400).json({ error: 'O projeto de destino precisa existir e estar ativo.' });
        }

        // Confere o acesso do usuário ao projeto de destino
        const acessoDestino = await usuarioPodeAcessarDemanda(conexao, req.authUser, projetoId);
       
        if (!acessoDestino) {
          await conexao.rollback();
          return res.status(403).json({
            error: 'Você precisa ter acesso aos projetos de origem e de destino para mover a demanda.'
          });
        }
      }

      // Identifica se o responsável foi informado na alteração
      const informouResponsavel = alteracoes.includes('responsavel_id');
      
      const responsavelId = informouResponsavel ? valoresValidados.responsavel_id : demandaAtual.responsavel_id;
      
      if (responsavelId && (mudouProjeto || informouResponsavel)) {
        // Confere se o responsável pertence à equipe do projeto destino
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

          // Remove o responsável antigo quando ele não pertence ao novo projeto
          valoresValidados.responsavel_id = null;
          alteracoes.push('responsavel_id');
        }
      }

      // Remove campos cujo valor novo é igual ao valor atual
      const alteracoesReais = alteracoes.filter(
        (campo) => String(demandaAtual[campo] ?? '') !== String(valoresValidados[campo] ?? '')
      );

      if (alteracoesReais.length > 0) {

        // Prepara os valores reais que serão enviados ao banco
        const binds: any = {};
        for (const campo of alteracoesReais) {
          binds[campo] = valoresValidados[campo];
        }
        binds.id = demandaId;

        // Monta os campos que serão atualizados
        const camposSql = alteracoesReais.map((chave) => `${chave} = :${chave}`).join(', ');
       
        // Atualiza os dados da demanda
        await conexao.execute(
          `UPDATE demandas SET ${camposSql}, atualizado_em = CURRENT_TIMESTAMP(6) WHERE id = :id`,
          binds
        );

        // Registra no histórico cada campo efetivamente alterado
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

      // Confirma demanda e histórico como uma única transação
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

  // Bloqueia a exclusão física de uma demanda
  app.delete('/api/demandas/:id', (_req: Request, res: Response) => {
    return res.set('Allow', 'GET, PATCH').status(405).json({
      error: 'Demandas não podem ser excluídas. Altere o status para CANCELADA para preservar o histórico.'
    });
  });

  // Atualiza o texto de um comentário existente
  app.patch('/api/comentarios/:id', async (req: Request, res: Response) => {

    // Obtém o texto enviado pelo cliente
    const corpo = req.body || {};

    // Exige que o texto tenha sido informado
    if (corpo.texto === undefined || corpo.texto === null || String(corpo.texto).trim() === '') {
      return res.status(400).json({ error: 'Campo obrigatório: texto' });
    }

    // Valida o tipo e o tamanho do comentário
    if (typeof corpo.texto !== 'string' || corpo.texto.trim().length < 3 || corpo.texto.trim().length > 500) {
      return res.status(400).json({ error: 'Comentário deve ter entre 3 e 500 caracteres.' });
    }

    // Converte e valida o identificador do comentário
    const comentarioId = converterIdPositivo(req.params.id);
    if (comentarioId === null) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }

    // Reserva a conexão usada pela edição
    let conexao: DbConnection | undefined;

    try {
      // Abre uma conexão com o banco
      conexao = await database.connection();

      // Busca o comentário e os dados da demanda associada
      const linhas = await conexao.query(
        'SELECT c.id, c.autor_id, d.* FROM comentarios c JOIN demandas d ON d.id = c.demanda_id WHERE c.id = :id',
        { id: comentarioId }
      );

      // Retorna 404 quando o comentário não existe
      if (linhas.length === 0) {
        return res.status(404).json({ error: 'Comentário não encontrado.' });
      }

      // Confere se o usuário pode acessar a demanda
      const possuiAcesso = await usuarioPodeAcessarDemanda(
        conexao,
        req.authUser,
        Number(linhas[0].projeto_id)
      );

      if (!possuiAcesso) {
        // Esconde comentários de demandas fora do acesso
        return res.status(404).json({ error: 'Comentário não encontrado.' });
      }

      // Permite editar somente ao autor ou ao administrador
      if (req.authUser.perfil !== 'ADMIN' && Number(linhas[0].autor_id) !== Number(req.authUser.id)) {
        return res.status(403).json({ error: 'Você só pode editar seus próprios comentários.' });
      }

      // Atualiza o texto e o horário da edição
      await conexao.execute(
        'UPDATE comentarios SET texto = :texto, atualizado_em = CURRENT_TIMESTAMP(6) WHERE id = :id',
        { texto: corpo.texto.trim(), id: comentarioId }
      );

      // Confirma a alteração no banco
      await conexao.commit();

      // Responde com sucesso sem conteúdo
      return res.status(204).end();
    } catch (erro) {
      // Desfaz alterações incompletas
      if (conexao) await conexao.rollback();
      console.error(erro);
      return res.status(500).json({ error: 'Erro ao atualizar comentário.' });
    } finally {
      // Fecha a conexão ao finalizar
      if (conexao) await conexao.close();
    }
  });

  // Remove um comentário quando o usuário tem autorização
  app.delete('/api/comentarios/:id', async (req: Request, res: Response) => {

    // Converte e valida o identificador do comentário
    const comentarioId = converterIdPositivo(req.params.id);

    if (comentarioId === null) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }

    // Reserva a conexão usada pela exclusão
    let conexao: DbConnection | undefined;

    try {
      // Abre uma conexão com o banco
      conexao = await database.connection();

      // Busca o comentário e os dados da demanda associada
      const linhas = await conexao.query(
        'SELECT c.id, c.autor_id, d.* FROM comentarios c JOIN demandas d ON d.id = c.demanda_id WHERE c.id = :id',
        { id: comentarioId }
      );

      // Retorna 404 quando o comentário não existe
      if (linhas.length === 0) {
        return res.status(404).json({ error: 'Comentário não encontrado.' });
      }

      // Confere se o usuário pode acessar a demanda
      const possuiAcesso = await usuarioPodeAcessarDemanda(
        conexao,
        req.authUser,
        Number(linhas[0].projeto_id)
      );

      if (!possuiAcesso) {
        // Esconde comentários de demandas fora do acesso
        return res.status(404).json({ error: 'Comentário não encontrado.' });
      }

      // Permite excluir somente ao autor ou ao administrador
      if (req.authUser.perfil !== 'ADMIN' && Number(linhas[0].autor_id) !== Number(req.authUser.id)) {
        return res.status(403).json({ error: 'Você só pode excluir seus próprios comentários.' });
      }

      // Remove o comentário autorizado
      await conexao.execute('DELETE FROM comentarios WHERE id = :id', { id: comentarioId });
      
      // Confirma a exclusão no banco
      await conexao.commit();
      
      // Confirma o sucesso sem conteúdo
      return res.status(204).end();
    } catch (erro) {
      // Desfaz alterações incompletas
      if (conexao) await conexao.rollback();
      console.error(erro);
      return res.status(500).json({ error: 'Erro ao excluir comentário.' });
    } finally {
      // Fecha a conexão ao finalizar
      if (conexao) await conexao.close();
    }
  });
}

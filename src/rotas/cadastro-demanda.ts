/*
Autor: Rafael Roveri Pires - RA: 24007131
Tela: Cadastro de Demandas, Projetos e Administração (backend)

Descrição: 
Recebe os dados de uma nova demanda, confere os campos, o prazo e as permissões do usuário antes de salvar o registro
e seu histórico. Também reúne as rotas de consulta, cadastro, edição e desativação de projetos e de gerenciamento das equipes
*/

import { Express, Request, Response } from 'express';
import type { Database, DbConnection } from '../app';
import { isNationalHoliday } from '../holidays';

type TipoDemanda = 'TAREFA' | 'DEFEITO' | 'MELHORIA' | 'DOCUMENTACAO';

type PrioridadeDemanda = 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAIXA';

const TIPOS_VALIDOS: TipoDemanda[] = ['TAREFA', 'DEFEITO', 'MELHORIA', 'DOCUMENTACAO'];

const PRIORIDADES_VALIDAS: PrioridadeDemanda[] = ['CRITICA', 'ALTA', 'MEDIA', 'BAIXA'];

// Valida e converte um identificador numérico positivo.
function converterIdPositivo(valor: unknown): number | null {

  // Tenta transformar o valor recebido em número
  const numero = Number(valor);

  // Recusa números inválidos, decimais ou menores que um
  if (!Number.isInteger(numero) || numero < 1) {
    return null;
  }
  return numero;
}

// Obtém a data civil atual (YYYY-MM-DD) no fuso de São Paulo
function obterHojeCivil(dataReferencia: Date): string {

  // Usa o fuso horário de São Paulo para obter o dia atual
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(dataReferencia);
}

// Valida se o prazo informado está no formato YYYY-MM-DD e se é uma data existente no calendário
function validarFormatoPrazo(valor: unknown): { valido: boolean; data: string | null } {

  // Permite deixar o prazo vazio
  if (valor === undefined || valor === null || valor === '') {
    return { valido: true, data: null };
  }

  // Exige uma data escrita no formato ano-mês-dia
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    return { valido: false, data: null };
  }

  // Converte o texto e confere se corresponde a uma data real
  const dataConvertida = new Date(`${valor}T00:00:00.000Z`);
  if (Number.isNaN(dataConvertida.getTime()) || dataConvertida.toISOString().slice(0, 10) !== valor) {
    return { valido: false, data: null };
  }

  // Devolve o prazo validado
  return { valido: true, data: valor };
}

// Registra as rotas GET /api/projetos e POST /api/demandas no aplicativo Express
export function registrarCadastroDemandaEProjetos(
  app: Express,
  database: Database,
  obterAgora: () => Date = () => new Date(),
  verificarFeriado: (dataIso: string) => Promise<boolean> = isNationalHoliday
) {

  // Lista os projetos disponíveis para o usuário autenticado
  app.get('/api/projetos', async (req: Request, res: Response) => {

    // Obtém a opção que pode incluir projetos desativados
    const { incluir_inativos } = req.query;

    // Valida o parâmetro opcional recebido na URL
    if (
      incluir_inativos !== undefined &&
      (typeof incluir_inativos !== 'string' || !['0', '1'].includes(incluir_inativos))
    ) {
      return res.status(400).json({ error: 'Filtro de projetos inválido.' });
    }

    // Impede perfis comuns de consultar projetos desativados
    if (incluir_inativos === '1' && req.authUser?.perfil !== 'ADMIN') {
      return res.status(403).json({
        error: 'Somente um administrador pode consultar todos os projetos inativos.'
      });
    }

    // Reserva a conexão usada pela consulta
    let conexao: DbConnection | undefined;

    try {
      // Abre uma conexão com o banco
      conexao = await database.connection();

      // Administradores podem consultar todos ou somente os ativos
      if (req.authUser.perfil === 'ADMIN') {
        const filtroAtivo = incluir_inativos === '1' ? '' : 'WHERE ativo = 1';
        const projetos = await conexao.query(
          `SELECT id, nome, descricao, ativo, criado_em, atualizado_em FROM projetos ${filtroAtivo} ORDER BY nome`
        );
        return res.status(200).json(projetos);
      }

      // Outros perfis recebem somente projetos ativos em que participam
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
      // Registra o erro no servidor
      console.error(erro);

      // Informa que não foi possível listar projetos
      return res.status(500).json({ error: 'Erro ao listar projetos.' });
    } finally {
      // Fecha a conexão ao finalizar
      if (conexao) await conexao.close();
    }
  });

  // Cadastra uma nova demanda depois de validar todos os dados
  app.post('/api/demandas', async (req: Request, res: Response) => {

    // Impede membros de criar demandas
    if (!['ADMIN', 'LIDER'].includes(req.authUser?.perfil)) {
      return res.status(403).json({ error: 'Membros da equipe não podem criar demandas.' });
    }

    // Obtém os dados enviados pelo cliente
    const corpo = req.body || {};

    // Lista os campos obrigatórios da demanda
    const camposObrigatorios = ['projeto_id', 'titulo', 'descricao', 'tipo', 'prioridade'];
    for (const campo of camposObrigatorios) {

      // Interrompe o cadastro quando algum campo obrigatório estiver vazio
      if (corpo[campo] === undefined || corpo[campo] === null || corpo[campo] === '') {
        return res.status(400).json({ error: `Campo obrigatório ausente: ${campo}.` });
      }
    }

    // Converte e valida o identificador do projeto
    const projetoIdNumero = converterIdPositivo(corpo.projeto_id);
    if (projetoIdNumero === null) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }

    // Valida o título e o tamanho permitido
    if (typeof corpo.titulo !== 'string') {
      return res.status(400).json({ error: 'Título deve ser um texto.' });
    }

    // Remove espaços extras do título
    const tituloLimpo = corpo.titulo.trim();
    if (tituloLimpo.length < 3 || tituloLimpo.length > 100) {
      return res.status(400).json({ error: 'Título deve ter entre 3 e 100 caracteres.' });
    }

    // Valida a descrição e o tamanho permitido
    if (typeof corpo.descricao !== 'string') {
      return res.status(400).json({ error: 'Descrição deve ser um texto.' });
    }

    // Remove espaços extras da descrição
    const descricaoLimpa = corpo.descricao.trim();

    if (descricaoLimpa.length < 10 || descricaoLimpa.length > 1000) {
      return res.status(400).json({ error: 'Descrição deve ter entre 10 e 1000 caracteres.' });
    }

    // Confere se o tipo informado está entre os tipos aceitos
    if (!TIPOS_VALIDOS.includes(corpo.tipo)) {
      return res.status(400).json({ error: 'Tipo de demanda inválido.' });
    }

    // Verifica se a prioridade enviada está entre os valores aceitos
    if (!PRIORIDADES_VALIDAS.includes(corpo.prioridade)) {
      return res.status(400).json({ error: 'Prioridade inválida.' });
    }

    // Valida o responsável quando ele tiver sido informado
    let responsavelIdNumero: number | null = null;

    if (corpo.responsavel_id !== undefined && corpo.responsavel_id !== null && corpo.responsavel_id !== '') {
      responsavelIdNumero = converterIdPositivo(corpo.responsavel_id);

      if (responsavelIdNumero === null) {
        return res.status(400).json({ error: 'Identificador inválido.' });
      }
    }

    // Valida o formato e a existência do prazo
    const validacaoPrazo = validarFormatoPrazo(corpo.prazo);

    if (!validacaoPrazo.valido) {
      return res.status(400).json({ error: 'Prazo inválido. Use YYYY-MM-DD.' });
    }

    const prazoValidado = validacaoPrazo.data;

    if (prazoValidado) {

      // Rejeita uma data anterior ao dia atual
      const hoje = obterHojeCivil(obterAgora());

      if (prazoValidado < hoje) {
        return res.status(400).json({ error: 'O prazo não pode estar no passado.' });
      }

      // Rejeita uma data que seja feriado nacional
      if (await verificarFeriado(prazoValidado)) {
        return res.status(400).json({ error: 'O prazo não pode cair em um feriado nacional.' });
      }
    }

    // Reserva a conexão usada pela criação da demanda
    let conexao: DbConnection | undefined;

    try {
      // Abre uma conexão com o banco
      conexao = await database.connection();

      // Confere se o projeto existe e está ativo
      const projetos = await conexao.query(
        'SELECT id FROM projetos WHERE id = :id AND ativo = 1',
        { id: projetoIdNumero }
      );

      if (projetos.length === 0) {
        await conexao.rollback();
        return res.status(400).json({ error: 'O projeto precisa existir e estar ativo.' });
      }

      // Líderes só podem criar demandas nos projetos em que participam
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

      // Quando houver responsável, confere se ele está ativo e pertence ao projeto
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

      // Insere a demanda com os dados validados
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

  // Cadastra um novo projeto quando o usuário é administrador
  app.post('/api/projetos', async (req: Request, res: Response) => {

    // Permite a operação somente para administradores
    if (req.authUser?.perfil !== 'ADMIN') {
      return res.status(403).json({ error: 'Somente um administrador pode cadastrar projetos.' });
    }

    // Obtém os dados enviados pelo cliente
    const corpo = req.body || {};

    // Exige que o nome do projeto tenha sido informado
    if (corpo.nome === undefined || corpo.nome === null || String(corpo.nome).trim() === '') {
      return res.status(400).json({ error: 'Campo obrigatório: nome' });
    }

    // Valida o tipo e o tamanho do nome
    if (typeof corpo.nome !== 'string' || corpo.nome.trim().length < 2 || corpo.nome.trim().length > 100) {
      return res.status(400).json({ error: 'Nome do projeto deve ter entre 2 e 100 caracteres.' });
    }

    // Remove espaços extras do nome
    const nomeLimpo = corpo.nome.trim();

    // Inicializa a descrição como vazia
    let descricaoLimpa: string | null = null;
    if (corpo.descricao !== undefined && corpo.descricao !== null && corpo.descricao !== '') {
      
      // Valida o formato e o tamanho da descrição
      if (
        typeof corpo.descricao !== 'string' ||
        corpo.descricao.trim().length < 1 ||
        corpo.descricao.trim().length > 1000
      ) {
        return res.status(400).json({ error: 'Descrição deve ter entre 1 e 1000 caracteres.' });
      }

      // Remove espaços extras da descrição
      descricaoLimpa = corpo.descricao.trim();
    }

    // Reserva a conexão usada pelo cadastro
    let conexao: DbConnection | undefined;
    try {

      // Abre uma conexão com o banco
      conexao = await database.connection();

      // Insere o novo projeto
      const resultado = await conexao.execute(
        'INSERT INTO projetos (nome, descricao) VALUES (:nome, :descricao)',
        { nome: nomeLimpo, descricao: descricaoLimpa }
      );

      // Confirma a criação
      await conexao.commit();

      // Devolve o identificador criado
      return res.status(201).json({ id: resultado.insertId });
    } catch (erro) {
      // Desfaz alterações incompletas
      if (conexao) await conexao.rollback();

      // Registra o erro no servidor
      console.error(erro);

      // Informa que não foi possível cadastrar o projeto
      return res.status(500).json({ error: 'Erro ao cadastrar projeto.' });
    } finally {
      // Fecha a conexão ao finalizar
      if (conexao) await conexao.close();
    }
  });

  // Atualiza os dados permitidos de um projeto
  app.patch('/api/projetos/:id', async (req: Request, res: Response) => {

    // Permite alterar projetos somente para administradores
    if (req.authUser?.perfil !== 'ADMIN') {
      return res.status(403).json({ error: 'Somente um administrador pode alterar projetos.' });
    }

    // Converte e valida o identificador do projeto
    const projetoId = converterIdPositivo(req.params.id);

    if (projetoId === null) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }

    // Obtém os dados enviados pelo cliente
    const corpo = req.body || {};

    // Lista os campos que podem ser alterados
    const camposPermitidos = ['nome', 'descricao', 'ativo'];

    // Mantém somente os campos permitidos recebidos
    const alteracoes = Object.keys(corpo).filter((chave) => camposPermitidos.includes(chave));

    // Exige pelo menos uma alteração válida
    if (alteracoes.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo permitido informado.' });
    }

    // Reserva a conexão usada pela atualização
    let conexao: DbConnection | undefined;

    try {
      // Abre uma conexão com o banco
      conexao = await database.connection();

      // Associa cada campo permitido ao valor enviado
      const binds: any = {};

      for (const chave of alteracoes) {
        binds[chave] = corpo[chave];
      }

      // Inclui o identificador do projeto
      binds.id = projetoId;

      // Monta a parte SQL que contém os campos alterados
      const camposSql = alteracoes.map((chave) => `${chave} = :${chave}`).join(', ');

      // Atualiza o projeto e o horário da alteração
      const resultado = await conexao.execute(
        `UPDATE projetos SET ${camposSql}, atualizado_em = CURRENT_TIMESTAMP(6) WHERE id = :id`,
        binds
      );

      // Informa quando o projeto não existe
      if (!resultado.affectedRows) {
        return res.status(404).json({ error: 'Projeto não encontrado.' });
      }

      // Confirma a alteração no banco
      await conexao.commit();

      // Responde com sucesso sem conteúdo
      return res.status(204).end();
    } catch (erro) {
      if (conexao) await conexao.rollback();
      console.error(erro);
      return res.status(500).json({ error: 'Erro ao atualizar projeto.' });
    } finally {
      if (conexao) await conexao.close();
    }
  });

  // Desativa um projeto sem apagar demandas ou histórico
  app.delete('/api/projetos/:id', async (req: Request, res: Response) => {

    // Permite desativar projetos somente para administradores
    if (req.authUser?.perfil !== 'ADMIN') {
      return res.status(403).json({ error: 'Somente um administrador pode desativar projetos.' });
    }

    // Converte e valida o identificador do projeto
    const projetoId = converterIdPositivo(req.params.id);

    if (projetoId === null) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }

    // Reserva a conexão usada pela desativação
    let conexao: DbConnection | undefined;

    try {
      // Abre uma conexão com o banco
      conexao = await database.connection();

      // Marca o projeto como inativo sem apagar seus dados
      const resultado = await conexao.execute(
        'UPDATE projetos SET ativo = 0, atualizado_em = CURRENT_TIMESTAMP(6) WHERE id = :id',
        { id: projetoId }
      );

      // Informa quando o projeto não existe
      if (!resultado.affectedRows) {
        return res.status(404).json({ error: 'Projeto não encontrado.' });
      }

      // Confirma a desativação no banco
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

  // Lista os membros vinculados a um projeto
  app.get('/api/projetos/:id/membros', async (req: Request, res: Response) => {

    // Converte e valida o identificador do projeto
    const projetoId = converterIdPositivo(req.params.id);

    if (projetoId === null) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }

    // Reserva a conexão usada pela consulta
    let conexao: DbConnection | undefined;

    try {
      // Abre uma conexão com o banco
      conexao = await database.connection();

      // Outros perfis precisam estar vinculados ao projeto consultado
      if (req.authUser.perfil !== 'ADMIN') {
        const vinculo = await conexao.query(
          'SELECT 1 FROM projeto_membros WHERE projeto_id = :projeto_id AND usuario_id = :usuario_id',
          { projeto_id: projetoId, usuario_id: req.authUser.id }
        );

        if (vinculo.length === 0) {
          // Não revela membros de um projeto sem acesso
          return res.status(404).json({ error: 'Projeto não encontrado.' });
        }
      }

      // Busca os membros ativos em ordem alfabética
      const membros = await conexao.query(
        `SELECT u.id, u.nome, u.email, u.perfil
         FROM projeto_membros pm
         JOIN usuarios u ON u.id = pm.usuario_id
         WHERE pm.projeto_id = :projeto_id AND u.ativo = 1
         ORDER BY u.nome`,
        { projeto_id: projetoId }
      );
      // Devolve a equipe encontrada
      return res.status(200).json(membros);
    } catch (erro) {
      console.error(erro);
      return res.status(500).json({ error: 'Erro ao listar membros do projeto.' });
    } finally {
      if (conexao) await conexao.close();
    }
  });

  // Vincula um usuário ativo à equipe de um projeto
  app.post('/api/projetos/:id/membros', async (req: Request, res: Response) => {

    // Permite gerenciar equipes somente para administradores
    if (req.authUser?.perfil !== 'ADMIN') {
      return res.status(403).json({
        error: 'Somente um administrador pode gerenciar a equipe do projeto.'
      });
    }

    // Obtém o identificador do usuário enviado no corpo
    const corpo = req.body || {};

    if (corpo.usuario_id === undefined || corpo.usuario_id === null || corpo.usuario_id === '') {
      return res.status(400).json({ error: 'Campo obrigatório: usuario_id' });
    }

    // Converte e valida os identificadores do projeto e do usuário
    const projetoId = converterIdPositivo(req.params.id);

    const usuarioId = converterIdPositivo(corpo.usuario_id);

    if (projetoId === null || usuarioId === null) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }

    // Reserva a conexão usada pelo vínculo
    let conexao: DbConnection | undefined;

    try {
      // Abre uma conexão com o banco
      conexao = await database.connection();

      // Confere se o projeto está ativo
      const projetos = await conexao.query(
        'SELECT id FROM projetos WHERE id = :id AND ativo = 1',
        { id: projetoId }
      );

      // Confere se o usuário está ativo
      const usuarios = await conexao.query(
        'SELECT id FROM usuarios WHERE id = :id AND ativo = 1',
        { id: usuarioId }
      );

      // Interrompe quando projeto ou usuário não estiverem disponíveis
      if (projetos.length === 0 || usuarios.length === 0) {
        await conexao.rollback();
        return res.status(400).json({ error: 'Projeto e usuário precisam estar ativos.' });
      }

      // Cria o vínculo entre projeto e usuário
      await conexao.execute(
        'INSERT INTO projeto_membros (projeto_id, usuario_id) VALUES (:projeto_id, :usuario_id)',
        { projeto_id: projetoId, usuario_id: usuarioId }
      );

      // Confirma o cadastro do vínculo
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

  // Remove o vínculo entre um usuário e um projeto
  app.delete('/api/projetos/:projetoId/membros/:usuarioId', async (req: Request, res: Response) => {
    
    // Permite gerenciar equipes somente para administradores
    if (req.authUser?.perfil !== 'ADMIN') {
      return res.status(403).json({
        error: 'Somente um administrador pode gerenciar a equipe do projeto.'
      });
    }

    // Converte e valida os identificadores recebidos na URL
    const projetoId = converterIdPositivo(req.params.projetoId);
    const usuarioId = converterIdPositivo(req.params.usuarioId);

    if (projetoId === null || usuarioId === null) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }

    // Reserva a conexão usada pela remoção do vínculo
    let conexao: DbConnection | undefined;

    try {
      // Abre uma conexão com o banco
      conexao = await database.connection();

      // Remove somente o vínculo entre o projeto e o usuário
      await conexao.execute(
        'DELETE FROM projeto_membros WHERE projeto_id = :projeto_id AND usuario_id = :usuario_id',
        { projeto_id: projetoId, usuario_id: usuarioId }
      );

      // Confirma a remoção
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

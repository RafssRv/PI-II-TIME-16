/*
Autora: Sophia Franco de Godoy - RA: 24000833
Tela: Projetos e Usuários e consultas compartilhadas (backend)

Descrição: 
Disponibiliza as operações de listagem, cadastro, edição e desativação de usuários. Valida os dados e as permissões,
gera o hash das senhas no cadastro e retorna apenas informações públicas das contas. Também trata a criação do primeiro
administrador do sistema
*/

import { Express, Request, Response } from 'express';
import type { Database, DbConnection } from '../app';
import { exigirAdmin } from '../autenticacao';

// Carrega a biblioteca que cria e confere senhas protegidas
const bcrypt = require('bcryptjs');

// Lista os perfis de acesso que o sistema reconhece
type PerfilUsuario = 'ADMIN' | 'LIDER' | 'MEMBRO';

// Guarda os perfis aceitos para validar dados recebidos pela API
const PERFIS_VALIDOS: PerfilUsuario[] = ['ADMIN', 'LIDER', 'MEMBRO'];

// Converte um valor em número e verifica se ele pode identificar um usuário
function converterIdPositivo(valor: unknown): number | null {

  // Tenta transformar o valor recebido em número
  const numero = Number(valor);

  // Recusa valores que não sejam números inteiros positivos
  if (!Number.isInteger(numero) || numero < 1) {
    return null;
  }

  return numero;
}

// Registra no servidor as rotas que permitem consultar e administrar usuários
export function registrarUsuarios(app: Express, database: Database) {

  // GET /api/usuarios: lista usuários permitidos para quem está conectado
  app.get('/api/usuarios', async (req: Request, res: Response) => {

    // Reserva uma variável para a conexão com o banco
    let conexao: DbConnection | undefined;

    try {
      // Abre uma conexão com o banco de dados
      conexao = await database.connection();

      // Lê os dados da pessoa autenticada e suas permissões
      const usuario = req.authUser;

      // Reserva uma variável para guardar a lista de usuários encontrada
      let usuarios;

      // Administradores podem consultar todas as contas, inclusive inativas
      if (usuario.perfil === 'ADMIN') {

        // Busca apenas informações públicas, sem incluir senhas
        usuarios = await conexao.query(
          'SELECT id, nome, email, perfil, ativo, criado_em, atualizado_em FROM usuarios ORDER BY nome'
        );
      } else {
        // Outros perfis veem a si mesmos e usuários ativos que participam de seus projetos
        usuarios = await conexao.query(
          `SELECT DISTINCT u.id, u.nome, u.email, u.perfil, u.ativo, u.criado_em, u.atualizado_em
            FROM usuarios u
            WHERE u.ativo = 1 AND (u.id = :usuario_id OR EXISTS (
              SELECT 1 FROM projeto_membros meus
              JOIN projeto_membros deles ON deles.projeto_id = meus.projeto_id
              WHERE meus.usuario_id = :usuario_id AND deles.usuario_id = u.id
            )) ORDER BY u.nome`,
          { usuario_id: usuario.id }
        );
      }

      // Envia a lista encontrada com o código HTTP 200 (consulta concluída)
      return res.status(200).json(usuarios);

    } catch (erro) {
      // Registra o erro para ajudar a equipe a investigar o problema
      console.error(erro);

      // Informa ao cliente que não foi possível carregar os usuários
      return res.status(500).json({ error: 'Erro ao listar usuários.' });
    } finally {
      // Fecha a conexão mesmo se a consulta ou a resposta apresentar um erro
      if (conexao) await conexao.close();
    }
  });

  // POST /api/usuarios: cria uma conta; só ADMIN pode fazer isso, exceto no primeiro cadastro
  app.post('/api/usuarios', async (req: Request, res: Response) => {

    // Recusa o cadastro se não for o primeiro usuário nem uma ação de administrador
    if (!req.bootstrap && req.authUser?.perfil !== 'ADMIN') {
      return res.status(403).json({ error: 'Somente um administrador pode cadastrar usuários.' });
    }

    // Obtém os dados enviados pelo cliente ou usa um objeto vazio se não houver corpo
    const corpo = req.body || {};

    // Define os dados que precisam ser fornecidos para criar uma conta
    const camposObrigatorios = ['nome', 'email', 'senha', 'perfil'];

    // Confere cada campo obrigatório antes de continuar
    for (const campo of camposObrigatorios) {

      // Recusa valores ausentes, nulos ou que contenham apenas espaços
      if (corpo[campo] === undefined || corpo[campo] === null || String(corpo[campo]).trim() === '') {
        return res.status(400).json({ error: `Campo obrigatório: ${campo}` });
      }
    }

    // No cadastro inicial, permite criar somente a primeira conta de administrador
    if (req.bootstrap && corpo.perfil !== 'ADMIN') {
      return res.status(403).json({ error: 'O primeiro usuário precisa ser ADMIN.' });
    }

    // Confere se o perfil informado é um dos três perfis reconhecidos
    if (!PERFIS_VALIDOS.includes(corpo.perfil)) {
      return res.status(400).json({ error: 'Perfil inválido. Use ADMIN, LIDER ou MEMBRO.' });
    }

    // Exige que o nome seja texto com tamanho entre 2 e 100 caracteres
    if (typeof corpo.nome !== 'string' || corpo.nome.trim().length < 2 || corpo.nome.trim().length > 100) {
      return res.status(400).json({ error: 'Nome deve ter entre 2 e 100 caracteres.' });
    }

    // Exige que o e-mail seja texto e tenha um tamanho permitido
    if (typeof corpo.email !== 'string' || corpo.email.trim().length < 5 || corpo.email.trim().length > 254) {
      return res.status(400).json({ error: 'E-mail deve ter entre 5 e 254 caracteres.' });
    }

    // Remove espaços extras do nome e do e-mail; deixa o e-mail em letras minúsculas
    const nomeLimpo = corpo.nome.trim();
    const emailLimpo = corpo.email.trim().toLowerCase();

    // Confere se o e-mail tem um formato básico válido
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpo)) {
      return res.status(400).json({ error: 'E-mail inválido.' });
    }

    // Exige uma senha de texto com tamanho entre 10 e 200 caracteres
    if (typeof corpo.senha !== 'string' || corpo.senha.length < 10 || corpo.senha.length > 200) {
      return res.status(400).json({ error: 'A senha deve ter entre 10 e 200 caracteres.' });
    }

    // Confere também o limite de tamanho aceito pela biblioteca de proteção de senhas
    if (bcrypt.truncates(corpo.senha)) {
      return res.status(400).json({ error: 'A senha deve ter até 72 bytes em UTF-8.' });
    }

    // Protege a senha antes de gravá-la; a senha original não é salva no banco
    const senhaHash = await bcrypt.hash(corpo.senha, 12);

    // Reserva uma variável para guardar a conexão com o banco
    let conexao: DbConnection | undefined;

    // Indica se foi necessário reservar o bloqueio do cadastro inicial
    let travaBootstrap = false;

    try {
      // Abre uma conexão com o banco de dados
      conexao = await database.connection();

      // O bloqueio especial evita que duas pessoas criem o primeiro ADMIN ao mesmo tempo
      if (req.bootstrap) {

        // Pede ao MySQL um bloqueio temporário exclusivo para o primeiro cadastro
        const trava = await conexao.query("SELECT GET_LOCK('pi2_demandas_first_admin', 10) AS acquired");
        
        // Se o bloqueio não for obtido, desfaz a transação e pede para tentar novamente
        if (Number(trava[0]?.acquired) !== 1) {
          await conexao.rollback();
          return res.status(503).json({
            error: 'Não foi possível iniciar o cadastro inicial; tente novamente.'
          });
        }

        // Registra que o bloqueio precisa ser liberado ao final
        travaBootstrap = true;

        // Confere se ainda não existe nenhum usuário cadastrado
        const existentes = await conexao.query('SELECT COUNT(*) AS total FROM usuarios');
        
        // Se já houver uma conta, encerra o cadastro inicial
        if (Number(existentes[0]?.total || 0) !== 0) {
          await conexao.rollback();
          return res.status(403).json({
            error: 'O cadastro inicial já foi concluído. Entre como ADMIN para cadastrar outros usuários.'
          });
        }
      }

      // Cria a conta usando os dados já validados e a senha protegida
      const resultado = await conexao.execute(
        'INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES (:nome, :email, :senha_hash, :perfil)',
        { nome: nomeLimpo, email: emailLimpo, senha_hash: senhaHash, perfil: corpo.perfil }
      );

      // Confirma a gravação no banco
      await conexao.commit();

      // Informa que a conta foi criada e devolve seu identificador
      return res.status(201).json({ id: resultado.insertId });
    } catch (erro: any) {

      // Desfaz alterações incompletas se algo falhar
      if (conexao) await conexao.rollback();

      // Avisa quando o e-mail já está sendo usado por outra conta
      if (erro?.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Este e-mail já está cadastrado.' });
      }

      // Registra outros erros para que possam ser investigados
      console.error(erro);

      // Informa que houve um erro inesperado ao criar a conta
      return res.status(500).json({ error: 'Erro ao cadastrar usuário.' });
    } finally {

      // Libera o bloqueio do primeiro cadastro, se ele foi obtido
      if (conexao && travaBootstrap) {
        await conexao.query("SELECT RELEASE_LOCK('pi2_demandas_first_admin')");
      }

      // Fecha a conexão com o banco
      if (conexao) await conexao.close();
    }
  });

  // PATCH /api/usuarios/:id: altera dados de uma conta; somente ADMIN pode usar
  app.patch('/api/usuarios/:id', exigirAdmin, async (req: Request, res: Response) => {

    // Converte e valida o identificador recebido no endereço da solicitação
    const usuarioId = converterIdPositivo(req.params.id);

    // Recusa identificadores que não sejam números positivos
    if (usuarioId === null) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }

    // Lê os novos dados enviados ou usa um objeto vazio
    const corpo = req.body || {};

    // Lista os únicos dados que esta rota permite alterar
    const camposPermitidos = ['nome', 'email', 'perfil', 'ativo'];

    // Mantém somente os campos permitidos que realmente foram enviados
    const alteracoes = Object.keys(corpo).filter((chave) => camposPermitidos.includes(chave));

    // Exige pelo menos um dado permitido para fazer uma alteração
    if (alteracoes.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo permitido informado.' });
    }

    // Valida cada campo que será alterado antes de acessar o banco
    for (const campo of alteracoes) {

      // Confere o formato e o tamanho do novo nome
      if (campo === 'nome') {
        if (typeof corpo.nome !== 'string' || corpo.nome.trim().length < 2 || corpo.nome.trim().length > 100) {
          return res.status(400).json({ error: 'Nome deve ter entre 2 e 100 caracteres.' });
        }

        // Remove espaços extras no início e no fim do nome
        corpo.nome = corpo.nome.trim();
      }

      // Confere o formato e o tamanho do novo e-mail
      if (campo === 'email') {
        if (typeof corpo.email !== 'string' || corpo.email.trim().length < 5 || corpo.email.trim().length > 254) {
          return res.status(400).json({ error: 'E-mail deve ter entre 5 e 254 caracteres.' });
        }

        // Padroniza o e-mail removendo espaços e usando letras minúsculas
        corpo.email = corpo.email.trim().toLowerCase();

        // Recusa endereços que não tenham um formato básico de e-mail
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(corpo.email)) {
          return res.status(400).json({ error: 'E-mail inválido.' });
        }
      }

      // Confere se o novo perfil está entre os perfis aceitos pelo sistema
      if (campo === 'perfil' && !PERFIS_VALIDOS.includes(corpo.perfil)) {
        return res.status(400).json({ error: 'Perfil inválido.' });
      }

      // Confere se o estado da conta é ligado ou desligado
      if (campo === 'ativo' && ![0, 1, false, true].includes(corpo.ativo)) {
        return res.status(400).json({ error: 'Estado ativo inválido.' });
      }
    }

    // Reserva uma variável para guardar a conexão com o banco
    let conexao: DbConnection | undefined;

    try {
      // Abre uma conexão com o banco
      conexao = await database.connection();

      // Prepara os valores que serão enviados com segurança para a consulta SQL
      const binds: any = {};

      // Copia para a consulta somente os campos que foram validados
      for (const chave of alteracoes) {
        binds[chave] = corpo[chave];
      }

      // Inclui o identificador para alterar somente a conta desejada
      binds.id = usuarioId;

      // Monta a lista de campos SQL a partir dos nomes permitidos
      const camposSql = alteracoes.map((chave) => `${chave} = :${chave}`).join(', ');

      // Atualiza a conta e registra o horário da alteração
      const resultado = await conexao.execute(
        `UPDATE usuarios SET ${camposSql}, atualizado_em = CURRENT_TIMESTAMP(6) WHERE id = :id`,
        binds
      );

      // Se nenhuma linha mudou, significa que o identificador não foi encontrado
      if (!resultado.affectedRows) {
        return res.status(404).json({ error: 'Usuário não encontrado.' });
      }

      // Confirma a alteração no banco
      await conexao.commit();

      // Responde que a alteração foi concluída, sem enviar um corpo de resposta
      return res.status(204).end();
    } catch (erro) {

      // Desfaz a alteração se ocorrer algum erro
      if (conexao) await conexao.rollback();

      // Registra o erro para ajudar na investigação
      console.error(erro);

      // Informa que não foi possível atualizar a conta
      return res.status(500).json({ error: 'Erro ao atualizar usuário.' });
    } finally {

      // Fecha a conexão mesmo se ocorrer algum erro
      if (conexao) await conexao.close();
    }
  });

  // DELETE /api/usuarios/:id: desativa a conta sem apagar seus dados; somente ADMIN pode usar
  app.delete('/api/usuarios/:id', exigirAdmin, async (req: Request, res: Response) => {

    // Converte e valida o identificador recebido no endereço da solicitação
    const usuarioId = converterIdPositivo(req.params.id);

    // Recusa identificadores que não sejam números positivos
    if (usuarioId === null) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }

    // Reserva uma variável para guardar a conexão com o banco
    let conexao: DbConnection | undefined;

    try {
      // Abre uma conexão com o banco
      conexao = await database.connection();

      // Desativa a conta e atualiza o horário, sem remover os dados do usuário
      const resultado = await conexao.execute(
        'UPDATE usuarios SET ativo = 0, atualizado_em = CURRENT_TIMESTAMP(6) WHERE id = :id',
        { id: usuarioId }
      );

      // Se nenhuma linha mudou, não existe usuário com esse identificador
      if (!resultado.affectedRows) {
        return res.status(404).json({ error: 'Usuário não encontrado.' });
      }

      // Confirma a desativação no banco
      await conexao.commit();

      // Responde que a desativação foi concluída, sem enviar um corpo de resposta
      return res.status(204).end();
    } catch (erro) {

      // Desfaz a alteração se ocorrer algum erro
      if (conexao) await conexao.rollback();

      // Registra o erro para ajudar na investigação
      console.error(erro);

      // Informa que não foi possível desativar a conta
      return res.status(500).json({ error: 'Erro ao desativar usuário.' });
    } finally {
      
      // Fecha a conexão mesmo se ocorrer algum erro
      if (conexao) await conexao.close();
    }
  });
}

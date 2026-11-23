/*
Autora: Sophia Franco de Godoy - RA: 24000833
Tela: controla operações da APi relacionadas aos usuários 

Descrição: 
Disponibiliza as operações de listagem, cadastro, edição e desativação de usuários. Valida os dados e as permissões,
gera o hash das senhas no cadastro e retorna apenas informações públicas das contas. Também trata a criação do primeiro
administrador do sistema
*/

import { Express, Request, Response } from 'express';
import type { Database, DbConnection } from '../app';
import { exigirAdmin } from '../autenticacao';

// Carrega a biblioteca usada para proteger senhas
const bcrypt = require('bcryptjs');

type PerfilUsuario = 'ADMIN' | 'LIDER' | 'MEMBRO';

const PERFIS_VALIDOS: PerfilUsuario[] = ['ADMIN', 'LIDER', 'MEMBRO'];

// Converte e valida um identificador positivo
function converterIdPositivo(valor: unknown): number | null {

  // Tenta transformar o valor recebido em número
  const numero = Number(valor);

  // Recusa números inválidos, decimais ou menores que um
  if (!Number.isInteger(numero) || numero < 1) {
    return null;
  }

  // Devolve o identificador validado
  return numero;
}

// Registra todas as operações relacionadas aos usuários
export function registrarUsuarios(app: Express, database: Database) {

  // Lista os usuários permitidos para a pessoa autenticada
  app.get('/api/usuarios', async (req: Request, res: Response) => {

    // Reserva a conexão que será usada pela consulta
    let conexao: DbConnection | undefined;

    try {
      // Abre uma conexão com o banco
      conexao = await database.connection();

      // Obtém o usuário autenticado e seu perfil
      const usuario = req.authUser;

      let usuarios;

      // Administradores podem consultar todos os usuários
      if (usuario.perfil === 'ADMIN') {

        usuarios = await conexao.query(
          'SELECT id, nome, email, perfil, ativo, criado_em, atualizado_em FROM usuarios ORDER BY nome'
        );
      } else {

        // Outros perfis veem a própria conta e usuários dos mesmos projetos
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

      // Devolve a lista encontrada
      return res.status(200).json(usuarios);

    } catch (erro) {
      // Registra o erro no servidor
      console.error(erro);
      // Informa que não foi possível listar os usuários
      return res.status(500).json({ error: 'Erro ao listar usuários.' });
    } finally {
      // Fecha a conexão mesmo se ocorrer um erro
      if (conexao) await conexao.close();
    }
  });

  // Cadastra uma nova conta ou cria o primeiro administrador
  app.post('/api/usuarios', async (req: Request, res: Response) => {

    // Exige administrador, exceto durante o cadastro inicial
    if (!req.bootstrap && req.authUser?.perfil !== 'ADMIN') {
      return res.status(403).json({ error: 'Somente um administrador pode cadastrar usuários.' });
    }

    // Obtém os dados enviados pelo cliente
    const corpo = req.body || {};

    // Lista os campos obrigatórios do cadastro
    const camposObrigatorios = ['nome', 'email', 'senha', 'perfil'];

    // Confere se cada campo obrigatório foi enviado
    for (const campo of camposObrigatorios) {
      if (corpo[campo] === undefined || corpo[campo] === null || String(corpo[campo]).trim() === '') {
        return res.status(400).json({ error: `Campo obrigatório: ${campo}` });
      }
    }

    // O primeiro usuário precisa obrigatoriamente ser administrador
    if (req.bootstrap && corpo.perfil !== 'ADMIN') {
      return res.status(403).json({ error: 'O primeiro usuário precisa ser ADMIN.' });
    }

    // Confere se o perfil informado existe
    if (!PERFIS_VALIDOS.includes(corpo.perfil)) {
      return res.status(400).json({ error: 'Perfil inválido. Use ADMIN, LIDER ou MEMBRO.' });
    }

    // Valida o tamanho e o formato do nome
    if (typeof corpo.nome !== 'string' || corpo.nome.trim().length < 2 || corpo.nome.trim().length > 100) {
      return res.status(400).json({ error: 'Nome deve ter entre 2 e 100 caracteres.' });
    }

    // Valida o tamanho do e-mail
    if (typeof corpo.email !== 'string' || corpo.email.trim().length < 5 || corpo.email.trim().length > 254) {
      return res.status(400).json({ error: 'E-mail deve ter entre 5 e 254 caracteres.' });
    }

    // Remove espaços e padroniza o e-mail em letras minúsculas
    const nomeLimpo = corpo.nome.trim();
    const emailLimpo = corpo.email.trim().toLowerCase();

    // Confere o formato básico do e-mail
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpo)) {
      return res.status(400).json({ error: 'E-mail inválido.' });
    }

    // Valida o tamanho da senha
    if (typeof corpo.senha !== 'string' || corpo.senha.length < 10 || corpo.senha.length > 200) {
      return res.status(400).json({ error: 'A senha deve ter entre 10 e 200 caracteres.' });
    }

    // Aplica o limite de bytes aceito pela biblioteca
    if (bcrypt.truncates(corpo.senha)) {
      return res.status(400).json({ error: 'A senha deve ter até 72 bytes em UTF-8.' });
    }

    // Cria um hash seguro da senha antes de salvar
    const senhaHash = await bcrypt.hash(corpo.senha, 12);

    // Reserva a conexão usada pelo cadastro
    let conexao: DbConnection | undefined;

    // Indica quando o bloqueio do cadastro inicial está ativo
    let travaBootstrap = false;

    try {
      // Abre uma conexão com o banco
      conexao = await database.connection();

      // Protege o cadastro inicial contra duas operações simultâneas
      if (req.bootstrap) {

        // Solicita ao MySQL um bloqueio temporário exclusivo
        const trava = await conexao.query("SELECT GET_LOCK('pi2_demandas_first_admin', 10) AS acquired");
        
        if (Number(trava[0]?.acquired) !== 1) {
          await conexao.rollback();
          return res.status(503).json({
            error: 'Não foi possível iniciar o cadastro inicial; tente novamente.'
          });
        }

        // Registra que o bloqueio precisará ser liberado
        travaBootstrap = true;

        // Conta quantos usuários já existem no banco
        const existentes = await conexao.query('SELECT COUNT(*) AS total FROM usuarios');
        
        if (Number(existentes[0]?.total || 0) !== 0) {
          await conexao.rollback();
          return res.status(403).json({
            error: 'O cadastro inicial já foi concluído. Entre como ADMIN para cadastrar outros usuários.'
          });
        }
      }

      // Insere o novo usuário usando os dados validados
      const resultado = await conexao.execute(
        'INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES (:nome, :email, :senha_hash, :perfil)',
        { nome: nomeLimpo, email: emailLimpo, senha_hash: senhaHash, perfil: corpo.perfil }
      );

      // Confirma a gravação no banco
      await conexao.commit();

      // Devolve o identificador da conta criada
      return res.status(201).json({ id: resultado.insertId });
    } catch (erro: any) {

      // Desfaz alterações incompletas
      if (conexao) await conexao.rollback();

      // Reconhece o caso de e-mail já cadastrado
      if (erro?.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Este e-mail já está cadastrado.' });
      }

      // Registra outros erros no servidor
      console.error(erro);

      // Informa que o cadastro não pôde ser concluído
      return res.status(500).json({ error: 'Erro ao cadastrar usuário.' });
    } finally {

      // Libera o bloqueio do cadastro inicial
      if (conexao && travaBootstrap) {
        await conexao.query("SELECT RELEASE_LOCK('pi2_demandas_first_admin')");
      }

      // Fecha a conexão com o banco
      if (conexao) await conexao.close();
    }
  });

  // Atualiza parcialmente os dados permitidos de uma conta
  app.patch('/api/usuarios/:id', exigirAdmin, async (req: Request, res: Response) => {

    // Converte e valida o identificador recebido na URL
    const usuarioId = converterIdPositivo(req.params.id);

    if (usuarioId === null) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }

    // Obtém os novos dados enviados
    const corpo = req.body || {};

    // Lista os campos que podem ser alterados
    const camposPermitidos = ['nome', 'email', 'perfil', 'ativo'];

    // Mantém somente os campos permitidos enviados pelo cliente
    const alteracoes = Object.keys(corpo).filter((chave) => camposPermitidos.includes(chave));

    // Exige pelo menos uma alteração permitida
    if (alteracoes.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo permitido informado.' });
    }

    // Valida cada campo que será atualizado
    for (const campo of alteracoes) {

      // Valida e limpa o novo nome
      if (campo === 'nome') {
        if (typeof corpo.nome !== 'string' || corpo.nome.trim().length < 2 || corpo.nome.trim().length > 100) {
          return res.status(400).json({ error: 'Nome deve ter entre 2 e 100 caracteres.' });
        }

        corpo.nome = corpo.nome.trim();
      }

      // Valida e padroniza o novo e-mail
      if (campo === 'email') {
        if (typeof corpo.email !== 'string' || corpo.email.trim().length < 5 || corpo.email.trim().length > 254) {
          return res.status(400).json({ error: 'E-mail deve ter entre 5 e 254 caracteres.' });
        }

        // Remove espaços extras e transforma o e-mail em letras minúsculas
        corpo.email = corpo.email.trim().toLowerCase();

        // Verifica se o e-mail possui um formato básico válido
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(corpo.email)) {
          return res.status(400).json({ error: 'E-mail inválido.' });
        }
      }

      // Confere se o perfil escolhido é válido
      if (campo === 'perfil' && !PERFIS_VALIDOS.includes(corpo.perfil)) {
        return res.status(400).json({ error: 'Perfil inválido.' });
      }

      // Confere se o estado ativo foi informado corretamente
      if (campo === 'ativo' && ![0, 1, false, true].includes(corpo.ativo)) {
        return res.status(400).json({ error: 'Estado ativo inválido.' });
      }
    }

    // Reserva a conexão usada pela atualização
    let conexao: DbConnection | undefined;

    try {
      // Abre uma conexão com o banco
      conexao = await database.connection();

      // Guarda os valores que serão enviados à consulta SQL
      const binds: any = {};

      // Percorre os campos que realmente podem ser alterados
      for (const chave of alteracoes) {
        // Associa cada campo ao seu novo valor na consulta SQL
        binds[chave] = corpo[chave];
      }

      // Inclui o identificador da conta que será alterada
      binds.id = usuarioId;

      // Monta uma lista SQL usando somente os campos permitidos
      const camposSql = alteracoes.map((chave) => `${chave} = :${chave}`).join(', ');

      // Executa a atualização parcial
      const resultado = await conexao.execute(
        `UPDATE usuarios SET ${camposSql}, atualizado_em = CURRENT_TIMESTAMP(6) WHERE id = :id`,
        binds
      );

      // Informa que o usuário não existe
      if (!resultado.affectedRows) {
        return res.status(404).json({ error: 'Usuário não encontrado.' });
      }

      // Confirma a alteração no banco
      await conexao.commit();

      // Confirma o sucesso sem devolver dados
      return res.status(204).end();
    } catch (erro) {

      // Desfaz alterações incompletas
      if (conexao) await conexao.rollback();

      // Registra o erro no servidor
      console.error(erro);

      // Informa que não foi possível atualizar
      return res.status(500).json({ error: 'Erro ao atualizar usuário.' });
    } finally {

      // Fecha a conexão com o banco
      if (conexao) await conexao.close();
    }
  });

  // Desativa uma conta sem apagar seu registro
  app.delete('/api/usuarios/:id', exigirAdmin, async (req: Request, res: Response) => {

    // Converte e valida o identificador recebido na URL
    const usuarioId = converterIdPositivo(req.params.id);

    if (usuarioId === null) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }

    // Reserva a conexão usada pela desativação
    let conexao: DbConnection | undefined;

    try {
      // Abre uma conexão com o banco
      conexao = await database.connection();

      // Marca o usuário como inativo e atualiza a data
      const resultado = await conexao.execute(
        'UPDATE usuarios SET ativo = 0, atualizado_em = CURRENT_TIMESTAMP(6) WHERE id = :id',
        { id: usuarioId }
      );

      // Informa que o usuário não existe
      if (!resultado.affectedRows) {
        return res.status(404).json({ error: 'Usuário não encontrado.' });
      }

      // Confirma a desativação no banco
      await conexao.commit();

      // Confirma o sucesso sem devolver dados
      return res.status(204).end();
    } catch (erro) {

      // Desfaz alterações incompletas
      if (conexao) await conexao.rollback();

      // Registra o erro no servidor
      console.error(erro);

      // Informa que não foi possível desativar
      return res.status(500).json({ error: 'Erro ao desativar usuário.' });
    } finally {
      
      // Fecha a conexão com o banco
      if (conexao) await conexao.close();
    }
  });
}

/*
  Autora: Sophia Franco de Godoy / RA: 24000833
  Descrição: Rotas de usuários (GET /api/usuarios, POST /api/usuarios, PATCH /api/usuarios/:id
  e DELETE /api/usuarios/:id) sem expor senhas
  Contempla os dados de teste em memória (Reunião 4) e a consulta/manipulação no banco de dados
  com fechamento da conexão no bloco finally (Reunião 5)
*/
import { Express, Request, Response } from 'express';
import type { Database, DbConnection } from '../app';
import { exigirAdmin } from '../autenticacao';

const bcrypt = require('bcryptjs');

type PerfilUsuario = 'ADMIN' | 'LIDER' | 'MEMBRO';

interface UsuarioTeste {
  id: number;
  nome: string;
  email: string;
  senha: string;
  perfil: PerfilUsuario;
}

const PERFIS_VALIDOS: PerfilUsuario[] = ['ADMIN', 'LIDER', 'MEMBRO'];

// Dados de teste em memória com os três perfis exigidos na Reunião 4.
export const usuariosTeste: UsuarioTeste[] = [
  { id: 1, nome: 'Administrador', email: 'admin@local.test', senha: 'demo-pi2-2026', perfil: 'ADMIN' },
  { id: 2, nome: 'Ana Souza', email: 'ana.lider@local.test', senha: 'demo-pi2-2026', perfil: 'LIDER' },
  { id: 3, nome: 'Carla Mendes', email: 'carla.membro@local.test', senha: 'demo-pi2-2026', perfil: 'MEMBRO' }
];

function converterIdPositivo(valor: unknown): number | null {
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 1) {
    return null;
  }
  return numero;
}

// Registra as rotas de usuários no aplicativo Express.
export function registrarUsuarios(app: Express, database?: Database) {
  // Rota 1: GET /api/usuarios — Lista os usuários sem retornar a senha.
  app.get('/api/usuarios', async (req: Request, res: Response) => {
    // Modo em memória (Reunião 4): retorna os usuários do array sem o campo senha.
    if (!database) {
      const usuarios = usuariosTeste.map((usuario) => ({
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        perfil: usuario.perfil
      }));

      return res.status(200).json(usuarios);
    }

    // Modo com banco de dados (Reunião 5): consulta apenas campos públicos e fecha a conexão no finally.
    let conexao: DbConnection | undefined;
    try {
      conexao = await database.connection();
      const usuario = req.authUser;
      let usuarios;

      if (usuario.perfil === 'ADMIN') {
        usuarios = await conexao.query(
          'SELECT id, nome, email, perfil, ativo, criado_em, atualizado_em FROM usuarios ORDER BY nome'
        );
      } else {
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

      return res.status(200).json(usuarios);
    } catch (erro) {
      console.error(erro);
      return res.status(500).json({ error: 'Erro ao listar usuários.' });
    } finally {
      if (conexao) await conexao.close();
    }
  });

  // Rota 2: POST /api/usuarios — Cadastra um novo usuário (restrito a ADMIN ou bootstrap inicial).
  app.post('/api/usuarios', async (req: Request, res: Response) => {
    if (!req.bootstrap && req.authUser?.perfil !== 'ADMIN') {
      return res.status(403).json({ error: 'Somente um administrador pode cadastrar usuários.' });
    }

    const corpo = req.body || {};
    const camposObrigatorios = ['nome', 'email', 'senha', 'perfil'];
    for (const campo of camposObrigatorios) {
      if (corpo[campo] === undefined || corpo[campo] === null || String(corpo[campo]).trim() === '') {
        return res.status(400).json({ error: `Campo obrigatório: ${campo}` });
      }
    }

    if (req.bootstrap && corpo.perfil !== 'ADMIN') {
      return res.status(403).json({ error: 'O primeiro usuário precisa ser ADMIN.' });
    }

    if (!PERFIS_VALIDOS.includes(corpo.perfil)) {
      return res.status(400).json({ error: 'Perfil inválido. Use ADMIN, LIDER ou MEMBRO.' });
    }

    if (typeof corpo.nome !== 'string' || corpo.nome.trim().length < 2 || corpo.nome.trim().length > 100) {
      return res.status(400).json({ error: 'Nome deve ter entre 2 e 100 caracteres.' });
    }

    if (typeof corpo.email !== 'string' || corpo.email.trim().length < 5 || corpo.email.trim().length > 254) {
      return res.status(400).json({ error: 'E-mail deve ter entre 5 e 254 caracteres.' });
    }

    const nomeLimpo = corpo.nome.trim();
    const emailLimpo = corpo.email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpo)) {
      return res.status(400).json({ error: 'E-mail inválido.' });
    }

    if (typeof corpo.senha !== 'string' || corpo.senha.length < 10 || corpo.senha.length > 200) {
      return res.status(400).json({ error: 'A senha deve ter entre 10 e 200 caracteres.' });
    }

    if (bcrypt.truncates(corpo.senha)) {
      return res.status(400).json({ error: 'A senha deve ter até 72 bytes em UTF-8.' });
    }

    if (!database) {
      const novoUsuario: UsuarioTeste = {
        id: usuariosTeste.length + 1,
        nome: nomeLimpo,
        email: emailLimpo,
        senha: corpo.senha,
        perfil: corpo.perfil
      };
      usuariosTeste.push(novoUsuario);
      return res.status(201).json({ id: novoUsuario.id });
    }

    const senhaHash = await bcrypt.hash(corpo.senha, 12);
    let conexao: DbConnection | undefined;
    let travaBootstrap = false;
    try {
      conexao = await database.connection();

      if (req.bootstrap) {
        const trava = await conexao.query("SELECT GET_LOCK('pi2_demandas_first_admin', 10) AS acquired");
        if (Number(trava[0]?.acquired) !== 1) {
          await conexao.rollback();
          return res.status(503).json({
            error: 'Não foi possível iniciar o cadastro inicial; tente novamente.'
          });
        }
        travaBootstrap = true;

        const existentes = await conexao.query('SELECT COUNT(*) AS total FROM usuarios');
        if (Number(existentes[0]?.total || 0) !== 0) {
          await conexao.rollback();
          return res.status(403).json({
            error: 'O cadastro inicial já foi concluído. Entre como ADMIN para cadastrar outros usuários.'
          });
        }
      }

      const resultado = await conexao.execute(
        'INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES (:nome, :email, :senha_hash, :perfil)',
        { nome: nomeLimpo, email: emailLimpo, senha_hash: senhaHash, perfil: corpo.perfil }
      );
      await conexao.commit();
      return res.status(201).json({ id: resultado.insertId });
    } catch (erro: any) {
      if (conexao) await conexao.rollback();
      if (erro?.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Este e-mail já está cadastrado.' });
      }
      console.error(erro);
      return res.status(500).json({ error: 'Erro ao cadastrar usuário.' });
    } finally {
      if (conexao && travaBootstrap) {
        await conexao.query("SELECT RELEASE_LOCK('pi2_demandas_first_admin')");
      }
      if (conexao) await conexao.close();
    }
  });

  // Rota 3: PATCH /api/usuarios/:id — Atualiza dados de um usuário (restrito a ADMIN).
  app.patch('/api/usuarios/:id', exigirAdmin, async (req: Request, res: Response) => {
    const usuarioId = converterIdPositivo(req.params.id);
    if (usuarioId === null) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }

    const corpo = req.body || {};
    const camposPermitidos = ['nome', 'email', 'perfil', 'ativo'];
    const alteracoes = Object.keys(corpo).filter((chave) => camposPermitidos.includes(chave));

    if (alteracoes.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo permitido informado.' });
    }

    for (const campo of alteracoes) {
      if (campo === 'nome') {
        if (typeof corpo.nome !== 'string' || corpo.nome.trim().length < 2 || corpo.nome.trim().length > 100) {
          return res.status(400).json({ error: 'Nome deve ter entre 2 e 100 caracteres.' });
        }
        corpo.nome = corpo.nome.trim();
      }
      if (campo === 'email') {
        if (typeof corpo.email !== 'string' || corpo.email.trim().length < 5 || corpo.email.trim().length > 254) {
          return res.status(400).json({ error: 'E-mail deve ter entre 5 e 254 caracteres.' });
        }
        corpo.email = corpo.email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(corpo.email)) {
          return res.status(400).json({ error: 'E-mail inválido.' });
        }
      }
      if (campo === 'perfil' && !PERFIS_VALIDOS.includes(corpo.perfil)) {
        return res.status(400).json({ error: 'Perfil inválido.' });
      }
      if (campo === 'ativo' && ![0, 1, false, true].includes(corpo.ativo)) {
        return res.status(400).json({ error: 'Estado ativo inválido.' });
      }
    }

    if (!database) {
      return res.status(204).end();
    }

    let conexao: DbConnection | undefined;
    try {
      conexao = await database.connection();
      const binds: any = {};
      for (const chave of alteracoes) {
        binds[chave] = corpo[chave];
      }
      binds.id = usuarioId;

      const camposSql = alteracoes.map((chave) => `${chave} = :${chave}`).join(', ');
      const resultado = await conexao.execute(
        `UPDATE usuarios SET ${camposSql}, atualizado_em = CURRENT_TIMESTAMP(6) WHERE id = :id`,
        binds
      );

      if (!resultado.affectedRows) {
        return res.status(404).json({ error: 'Usuário não encontrado.' });
      }

      await conexao.commit();
      return res.status(204).end();
    } catch (erro) {
      if (conexao) await conexao.rollback();
      console.error(erro);
      return res.status(500).json({ error: 'Erro ao atualizar usuário.' });
    } finally {
      if (conexao) await conexao.close();
    }
  });

  // Rota 4: DELETE /api/usuarios/:id — Desativa um usuário sem excluí-lo fisicamente (restrito a ADMIN).
  app.delete('/api/usuarios/:id', exigirAdmin, async (req: Request, res: Response) => {
    const usuarioId = converterIdPositivo(req.params.id);
    if (usuarioId === null) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }

    if (!database) {
      return res.status(204).end();
    }

    let conexao: DbConnection | undefined;
    try {
      conexao = await database.connection();
      const resultado = await conexao.execute(
        'UPDATE usuarios SET ativo = 0, atualizado_em = CURRENT_TIMESTAMP(6) WHERE id = :id',
        { id: usuarioId }
      );

      if (!resultado.affectedRows) {
        return res.status(404).json({ error: 'Usuário não encontrado.' });
      }

      await conexao.commit();
      return res.status(204).end();
    } catch (erro) {
      if (conexao) await conexao.rollback();
      console.error(erro);
      return res.status(500).json({ error: 'Erro ao desativar usuário.' });
    } finally {
      if (conexao) await conexao.close();
    }
  });
}

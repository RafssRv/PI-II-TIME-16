/*
  Autora: Sophia Franco de Godoy / RA: 24000833
  Descrição: Rota POST /api/login para autenticação de usuários
  Valida os campos obrigatórios e consulta o usuário no MySQL,
  com encerramento da conexão no bloco finally (Reunião 5).
  Após conferir o hash, regenera e salva a sessão no servidor, conforme a Aula 11.
*/
import { Express, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import type { Database, DbConnection } from '../app';
import type { UsuarioSessao } from '../autenticacao';

interface UsuarioBanco extends UsuarioSessao {
  senha_hash: string;
}

// Registra a rota POST /api/login no aplicativo Express.
export function registrarLogin(app: Express, database: Database) {
  app.post('/api/login', async (req: Request, res: Response, next: NextFunction) => {
    const { email, senha } = req.body || {};

    if (!email || !senha) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    }

    if (typeof email !== 'string' || typeof senha !== 'string') {
      return res.status(400).json({ error: 'Informe e-mail e senha como texto.' });
    }

    if (email.trim() === '' || senha.trim() === '') {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    }

    if (bcrypt.truncates(senha)) {
      return res.status(400).json({ error: 'A senha deve ter até 72 bytes em UTF-8.' });
    }

    // Obtém a conexão com o banco, consulta o usuário e fecha no finally.
    let conexao: DbConnection | undefined;
    let usuario: UsuarioBanco | undefined;
    try {
      conexao = await database.connection();
      const usuarios = await conexao.query(
        'SELECT id, nome, email, senha_hash, perfil FROM usuarios WHERE LOWER(email) = LOWER(:email) AND ativo = 1',
        { email: email.trim().toLowerCase() }
      );
      usuario = usuarios[0];
    } catch (erro) {
      return next(erro);
    } finally {
      if (conexao) await conexao.close();
    }

    const senhaCorreta = usuario && await bcrypt.compare(senha, usuario.senha_hash);
    if (!usuario || !senhaCorreta) {
      return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    }

    // Troca o identificador após o login e guarda somente os dados públicos.
    req.session.regenerate((erro) => {
      if (erro) return next(erro);
      req.session.usuario = {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        perfil: usuario.perfil
      };

      // Salva a sessão antes de o navegador abrir a próxima página.
      req.session.save((erro) => {
        if (erro) return next(erro);
        return res.status(200).json(req.session.usuario);
      });
    });
  });
}

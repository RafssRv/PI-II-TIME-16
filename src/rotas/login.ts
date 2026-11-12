/*
  Autora: Sophia Franco de Godoy / RA: 24000833
  Descrição: Rota POST /api/login para autenticação de usuários
  Contempla a validação de campos obrigatórios, a busca em memória (Reunião 4)
  e a consulta no banco de dados com encerramento da conexão no bloco finally (Reunião 5)
*/
import { Express, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import type { Database, DbConnection } from '../app';
import { criarToken } from '../sessao';
import { usuariosTeste } from './usuarios';

// Registra a rota POST /api/login no aplicativo Express.
export function registrarLogin(app: Express, database?: Database, segredoSessao = '') {
  app.post('/api/login', async (req: Request, res: Response) => {
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

    // Modo em memória (Reunião 4): utilizado quando nenhum banco de dados é informado.
    if (!database) {
      const usuario = usuariosTeste.find(
        (item) => item.email === email.trim().toLowerCase() && item.senha === senha
      );

      if (!usuario) {
        return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
      }

      const dadosUsuario = {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        perfil: usuario.perfil
      };

      return res.status(200).json({ usuario: dadosUsuario });
    }

    // Modo com banco de dados (Reunião 5): obtém a conexão, consulta e fecha no finally.
    let conexao: DbConnection | undefined;
    try {
      conexao = await database.connection();
      const usuarios = await conexao.query(
        'SELECT id, nome, email, senha_hash, perfil FROM usuarios WHERE LOWER(email) = LOWER(:email) AND ativo = 1',
        { email: email.trim().toLowerCase() }
      );
      const usuario = usuarios[0];

      if (!usuario) {
        return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
      }

      const senhaCorreta = await bcrypt.compare(senha, usuario.senha_hash);
      if (!senhaCorreta) {
        return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
      }

      const dadosUsuario = {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        perfil: usuario.perfil
      };

      return res.status(200).json({
        usuario: dadosUsuario,
        token: criarToken(usuario.id, segredoSessao)
      });
    } catch (erro) {
      console.error(erro);
      return res.status(500).json({ error: 'Erro ao realizar login.' });
    } finally {
      if (conexao) await conexao.close();
    }
  });
}

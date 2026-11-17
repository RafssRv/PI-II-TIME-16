/*
Autora: Sophia Franco de Godoy - RA: 24000833
Tela: Login (backend)

Descrição: 
Faz a autenticação a partir do e-mail e da senha informados. Consulta os usuários ativos e compara a senha com
o hash salvo no banco. Quando os dados estão corretos, regenera o identificador da sessão e salva as informações do 
usuário para permitir o acesso ao sistema
*/

import { Express, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import type { Database, DbConnection } from '../app';
import type { UsuarioSessao } from '../autenticacao';

// Descreve os dados que vêm do banco, incluindo o hash da senha
interface UsuarioBanco extends UsuarioSessao {
  // Hash é uma versão protegida da senha, não a senha original
  senha_hash: string;
}

// Cria a rota que recebe os dados de login e usa o banco para verificar a conta
export function registrarLogin(app: Express, database: Database) {

  // Define o endereço POST /api/login, chamado quando alguém tenta entrar
  app.post('/api/login', async (req: Request, res: Response, next: NextFunction) => {

    // Lê o e-mail e a senha enviados; usa um objeto vazio se não houver dados
    const { email, senha } = req.body || {};

    // Se algum dado não foi enviado, responde que os dois são obrigatórios
    if (!email || !senha) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    }

    // Confere se o e-mail e a senha foram enviados como texto
    if (typeof email !== 'string' || typeof senha !== 'string') {
      return res.status(400).json({ error: 'Informe e-mail e senha como texto.' });
    }

    // Recusa e-mail ou senha que contenha apenas espaços
    if (email.trim() === '' || senha.trim() === '') {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    }

    // Impede o uso de senhas maiores do que o limite aceito pelo sistema de proteção
    if (bcrypt.truncates(senha)) {
      return res.status(400).json({ error: 'A senha deve ter até 72 bytes em UTF-8.' });
    }

    // Reserva uma variável para guardar a conexão com o banco, quando ela for aberta
    let conexao: DbConnection | undefined;

    // Reserva uma variável para guardar os dados do usuário encontrado
    let usuario: UsuarioBanco | undefined;

    try {
      // Abre uma conexão com o banco de dados
      conexao = await database.connection();

      // Procura uma conta ativa pelo e-mail, sem diferenciar letras maiúsculas de minúsculas
      const usuarios = await conexao.query(
        'SELECT id, nome, email, senha_hash, perfil FROM usuarios WHERE LOWER(email) = LOWER(:email) AND ativo = 1',
        { email: email.trim().toLowerCase() }
      );

      // Guarda o primeiro usuário encontrado; será indefinido se não houver resultado
      usuario = usuarios[0];

    } catch (erro) {
      // Encaminha erros do banco para o tratamento geral de erros do servidor
      return next(erro);
      
    } finally {
      // Fecha a conexão mesmo se a consulta falhar
      if (conexao) await conexao.close();
    }

    // Compara a senha digitada com a versão protegida salva no banco
    const senhaCorreta = usuario && await bcrypt.compare(senha, usuario.senha_hash);

    // Se a conta não existe ou a senha não confere, informa que os dados são inválidos
    if (!usuario || !senhaCorreta) {
      return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    }

    // Gera um novo identificador de sessão ao entrar, como medida de segurança
    req.session.regenerate((erro) => {

      // Se não foi possível criar a sessão, encaminha o erro ao servidor
      if (erro) return next(erro);

      // Guarda na sessão apenas os dados do usuário necessários para a aplicação
      req.session.usuario = {

        // Salva o identificador da conta
        id: usuario.id,

        // Salva o nome para identificar o usuário
        nome: usuario.nome,

        // Salva o e-mail da conta
        email: usuario.email,

        // Salva o perfil, que define as permissões do usuário
        perfil: usuario.perfil
      };

      // Persiste a sessão antes de responder ao navegador
      req.session.save((erro) => {

        // Se a sessão não puder ser salva, encaminha o erro ao servidor
        if (erro) return next(erro);
        // Confirma o login e envia os dados do usuário, sem incluir o hash da senha
        return res.status(200).json(req.session.usuario);
      });
    });
  });
}

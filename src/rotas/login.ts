/*
Autora: Sophia Franco de Godoy - RA: 24000833
Tela: Login (backend)
  - Verifica a conta e registra quem está autenticado 

Descrição: 
Faz a autenticação a partir do e-mail e da senha informados. Consulta os usuários ativos e compara a senha com
o hash salvo no banco. Quando os dados estão corretos, regenera o identificador da sessão e salva as informações do 
usuário para permitir o acesso ao sistema
*/

import { Express, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import type { Database, DbConnection } from '../app';
import type { UsuarioSessao } from '../autenticacao';

// Inclui o hash da senha nos dados encontrados no banco
interface UsuarioBanco extends UsuarioSessao {
  // Versão protegida usada para conferir a senha digitada
  senha_hash: string;
}

// Registra a rota responsável pelo login
export function registrarLogin(app: Express, database: Database) {

  // Recebe e-mail e senha e cria ou mantém a sessão do usuário
  app.post('/api/login', async (req: Request, res: Response, next: NextFunction) => {

    // Lê os dados enviados ou usa um objeto vazio
    const { email, senha } = req.body || {};

    // Exige que os dois campos tenham sido enviados
    if (!email || !senha) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    }

    // Exige que e-mail e senha sejam textos
    if (typeof email !== 'string' || typeof senha !== 'string') {
      return res.status(400).json({ error: 'Informe e-mail e senha como texto.' });
    }

    // Remove espaços para conferir se os campos não estão vazios
    if (email.trim() === '' || senha.trim() === '') {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    }

    // Rejeita uma senha maior que o limite aceito pelo bcrypt
    if (bcrypt.truncates(senha)) {
      return res.status(400).json({ error: 'A senha deve ter até 72 bytes em UTF-8.' });
    }

    // Reserva a variável usada pela conexão com o banco
    let conexao: DbConnection | undefined;

    // Reserva o usuário encontrado na consulta
    let usuario: UsuarioBanco | undefined;

    try {
      // Abre uma conexão com o banco
      conexao = await database.connection();

      // Busca uma conta ativa pelo e-mail informado
      const usuarios = await conexao.query(
        'SELECT id, nome, email, senha_hash, perfil FROM usuarios WHERE LOWER(email) = LOWER(:email) AND ativo = 1',
        { email: email.trim().toLowerCase() }
      );

      // Guarda o primeiro usuário encontrado
      usuario = usuarios[0];

    } catch (erro) {
      // Encaminha o erro ao tratamento configurado pelo Express
      return next(erro);
      
    } finally {
      // Fecha a conexão mesmo se a consulta falhar
      if (conexao) await conexao.close();
    }

    // Compara a senha digitada com o hash salvo no banco
    const senhaCorreta = usuario && await bcrypt.compare(senha, usuario.senha_hash);

    // Recusa o login quando não encontrar o usuário ou a senha estiver incorreta
    if (!usuario || !senhaCorreta) {
      return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    }
    
    // Gera um novo identificador de sessão após o login
    req.session.regenerate((erro) => {

      // Interrompe se não puder criar a nova sessão
      if (erro) return next(erro);

      // Guarda na sessão os dados públicos necessários
      req.session.usuario = {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        perfil: usuario.perfil
      };

      // Persiste os dados antes de responder ao navegador
      req.session.save((erro) => {

        // Interrompe se não puder salvar a sessão
        if (erro) return next(erro);

        // Confirma o login sem enviar senha ou hash
        return res.status(200).json(req.session.usuario);
      });
    });
  });
}

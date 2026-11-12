/*
  Autora: Priscila Amorim dos Santos / RA: 24787350
  Descrição: Configuração principal do aplicativo Express (middlewares, autenticação de sessão
  e registro das rotas dos 5 integrantes do grupo na pasta src/rotas/).
*/
import express, { NextFunction, Request, Response } from 'express';
import session from 'express-session';
import { exigirLogin, UsuarioSessao } from './autenticacao';
import { registrarCadastroDemandaEProjetos } from './rotas/cadastro-demanda';
import { registrarDashboard } from './rotas/dashboard';
import { registrarDetalhesEComentarios } from './rotas/detalhes-comentarios';
import { registrarListagemDemandas } from './rotas/listagem-demandas';
import { registrarLogin } from './rotas/login';
import { registrarUsuarios } from './rotas/usuarios';

const path = require('node:path');
const { isNationalHoliday } = require('./holidays');

type AuthUser = UsuarioSessao;
type DbConnection = {
  query(sql: string, binds?: any): Promise<any[]>;
  execute(sql: string, binds?: any): Promise<{ affectedRows: number; insertId: number }>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  close(): Promise<void>;
};
type Database = { connection(): Promise<DbConnection> };
type AppOptions = {
  isHoliday?: (date: string) => Promise<boolean>;
  now?: () => Date;
  sessionSecret?: string;
  skipAuthorization?: boolean;
};

declare global {
  namespace Express {
    interface Request {
      authUser: AuthUser;
      bootstrap?: boolean;
    }
  }
}

function createApp(
  database: Database,
  {
    isHoliday = isNationalHoliday,
    now = () => new Date(),
    sessionSecret = process.env.SESSION_SECRET,
    skipAuthorization = false
  }: AppOptions = {}
) {
  const app = express();

  if (!sessionSecret || sessionSecret.length < 32 || sessionSecret.startsWith('SUBSTITUA_')) {
    throw new Error('Defina SESSION_SECRET no .env com pelo menos 32 caracteres aleatórios.');
  }

  // Permite que o Express leia dados enviados em formato JSON no corpo da requisição (req.body).
  app.use(express.json());

  // Configuração usada na Aula 11: sessão em memória e cookie com validade de 30 minutos.
  app.use(session({
    name: 'portal.sid',
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 30 * 60 * 1000
    }
  }));

  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // O frontend e a API usam a mesma origem, como no exemplo do professor.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origem = req.get('Origin');
    const origemEsperada = `${req.protocol}://${req.get('Host')}`;
    const alteraDados = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
    if (alteraDados && origem && origem !== origemEsperada) {
      return res.status(403).json({ error: 'Origem da requisição não permitida.' });
    }
    next();
  });

  // Garante que requisições de escrita enviem um objeto JSON válido.
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    if (
      ['POST', 'PATCH', 'PUT'].includes(req.method) && req.path !== '/logout' &&
      (!req.is('application/json') || !req.body || typeof req.body !== 'object' || Array.isArray(req.body))
    ) {
      return res.status(400).json({ error: 'Envie um objeto JSON válido no corpo da requisição.' });
    }
    next();
  });

  // Verifica a sessão antes de entregar as páginas internas, inclusive por URL direta.
  const pastaFrontend = path.join(__dirname, '..', 'frontend');
  app.use('/frontend/html', (req: Request, res: Response, next: NextFunction) => {
    const pagina = req.path.toLowerCase();
    if (pagina === '/login.html') return next();
    if (!req.session.usuario) return res.redirect('/frontend/html/login.html');
    if (pagina === '/administracao.html' && req.session.usuario.perfil !== 'ADMIN') {
      return res.redirect('/frontend/html/dashboard.html');
    }
    if (pagina === '/cadastro.html' && req.session.usuario.perfil === 'MEMBRO') {
      return res.redirect('/frontend/html/listagemDemandas.html');
    }
    next();
  }, express.static(path.join(pastaFrontend, 'html')));
  for (const pasta of ['css', 'js', 'vendor']) {
    app.use(`/frontend/${pasta}`, express.static(path.join(pastaFrontend, pasta)));
  }
  app.get('/', (_req: Request, res: Response) => res.redirect('/frontend/html/login.html'));

  // Rota de verificação da conexão com o banco de dados.
  app.get('/api/health', async (_req: Request, res: Response) => {
    let conexao: DbConnection | undefined;
    try {
      conexao = await database.connection();
      await conexao.query('SELECT 1 AS ok');
      return res.status(200).json({ database: 'online' });
    } catch (erro) {
      console.error(erro);
      return res.status(503).json({ error: 'Banco de dados indisponível.' });
    } finally {
      if (conexao) await conexao.close();
    }
  });

  // Aluna 1 (Sophia): Rota pública de Login (POST /api/login).
  registrarLogin(app, database);

  // Encerrar a sessão não depende de uma nova consulta ao banco.
  app.post('/api/logout', exigirLogin, (req: Request, res: Response, next: NextFunction) => {
    req.session.destroy((erro) => {
      if (erro) return next(erro);
      res.clearCookie('portal.sid', { path: '/', httpOnly: true, sameSite: 'lax', secure: false });
      return res.json({ mensagem: 'Sessão encerrada.' });
    });
  });

  // Middleware de autenticação para proteger as demais rotas de /api.
  app.use('/api', async (req: Request, res: Response, next: NextFunction) => {
    if (skipAuthorization) {
      req.authUser = { id: 1, nome: 'Usuário de teste', email: 'teste@local.test', perfil: 'ADMIN' };
      req.session.usuario = req.authUser;
      return next();
    }

    const cadastroInicial = req.path === '/usuarios' && req.method === 'POST';
    if (!req.session.usuario && !cadastroInicial) {
      return exigirLogin(req, res, next);
    }

    let conexao: DbConnection | undefined;
    let usuarios: UsuarioSessao[] = [];
    try {
      conexao = await database.connection();

      if (cadastroInicial && !req.session.usuario) {
        const usuariosCadastrados = await conexao.query('SELECT COUNT(*) AS total FROM usuarios');
        if (Number(usuariosCadastrados[0]?.total || 0) === 0) {
          req.bootstrap = true;
        }
      }

      // Mantém a verificação de conta ativa e perfil atualizado que o projeto já possuía.
      if (req.session.usuario) {
        usuarios = await conexao.query(
          'SELECT id, nome, email, perfil FROM usuarios WHERE id = :id AND ativo = 1',
          { id: req.session.usuario.id }
        );
      }
    } catch (erro) {
      return next(erro);
    } finally {
      if (conexao) await conexao.close();
    }

    if (req.bootstrap) return next();
    if (!req.session.usuario) return exigirLogin(req, res, next);
    if (usuarios.length === 0) {
      return req.session.destroy((erro) => {
        if (erro) return next(erro);
        res.clearCookie('portal.sid', { path: '/', httpOnly: true, sameSite: 'lax', secure: false });
        return res.status(401).json({ error: 'Usuário inativo ou sessão expirada.' });
      });
    }

    const usuario = usuarios[0];
    req.session.usuario = { id: usuario.id, nome: usuario.nome, email: usuario.email, perfil: usuario.perfil };
    // As rotas existentes continuam recebendo o usuário identificado pelo servidor.
    req.authUser = req.session.usuario;
    next();
  });

  app.get('/api/sessao', exigirLogin, (req: Request, res: Response) => {
    return res.json(req.session.usuario);
  });

  // Aluna 1 (Sophia): Rotas de Usuários (GET, POST, PATCH e DELETE /api/usuarios).
  registrarUsuarios(app, database);

  // Aluno 2 (Vinícius): Rota de Dashboard (GET /api/dashboard).
  registrarDashboard(app, database, now);

  // Aluna 3 (Heloisa): Rota de Listagem de Demandas com filtros, busca e ordenação (GET /api/demandas).
  registrarListagemDemandas(app, database);

  // Aluno 4 (Rafael): Rotas de Cadastro de Demanda e Projetos (POST /api/demandas e /api/projetos).
  registrarCadastroDemandaEProjetos(app, database, now, isHoliday);

  // Aluna 5 (Priscila): Rotas de Detalhes da Demanda, Edição e Comentários (/api/demandas/:id e comentários).
  registrarDetalhesEComentarios(app, database, now, isHoliday);

  // Redirecionamentos para manter compatibilidade com chamadas sem o prefixo /api.
  app.use('/dashboard', (req: Request, res: Response) =>
    res.redirect(307, `/api/dashboard${req.url === '/' ? '' : req.url}`)
  );
  app.use('/demandas', (req: Request, res: Response) =>
    res.redirect(307, `/api/demandas${req.url === '/' ? '' : req.url}`)
  );
  app.use('/projetos', (req: Request, res: Response) =>
    res.redirect(307, `/api/projetos${req.url === '/' ? '' : req.url}`)
  );

  // Resposta padrão 404 para rotas da API que não existem.
  app.use('/api', (_req: Request, res: Response) => {
    return res.status(404).json({ error: 'Rota não encontrada.' });
  });

  // Tratamento geral de erros inesperados.
  app.use((error: any, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(error);
    const status = error.status || 500;
    if (status >= 500) console.error(error);
    return res.status(status).json({
      error: status >= 500 ? 'Erro interno ao acessar o banco.' : error.message
    });
  });

  return app;
}

export { createApp };
export type { Database, DbConnection };

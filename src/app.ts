/*
Autora: Priscila Amorim dos Santos - RA: 24787350
Tela: Uso geral do sistema (configuração do backend)

Descrição: 
Organiza a aplicação Express, configura as sessões e registra as rotas do sistema. Controla o acesso às páginas
internas e à API, disponibiliza os arquivos do frontend e centraliza as respostas para rotas inexistentes e erros
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

// Importa recursos para trabalhar com caminhos do sistema
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
};

declare global {
  namespace Express {
    interface Request {
      // Identifica o usuário confirmado pelo banco
      authUser: AuthUser;

      // Informa que a requisição está criando o primeiro administrador
      bootstrap?: boolean;
    }
  }
}

function createApp(
  database: Database,
  {
    isHoliday = isNationalHoliday,
    now = () => new Date(),
    sessionSecret = process.env.SESSION_SECRET
  }: AppOptions = {}
) {
  // Impede iniciar a aplicação sem uma conexão válida com o banco
  if (!database || typeof database.connection !== 'function') {
    throw new Error('Configure a conexão com o banco de dados para iniciar a API.');
  }

  // Cria a instância da aplicação Express
  const app = express();

  // Exige uma chave segura para assinar os cookies da sessão
  if (!sessionSecret || sessionSecret.length < 32 || sessionSecret.startsWith('SUBSTITUA_')) {
    throw new Error('Defina SESSION_SECRET no .env com pelo menos 32 caracteres aleatórios.');
  }

  // Permite ler dados JSON enviados no corpo das requisições
  app.use(express.json());

  // Configura a sessão e o cookie que identifica o usuário
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
    // Impede que páginas ou respostas fiquem armazenadas pelo navegador
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Bloqueia operações de origem externa diferente da aplicação
  app.use((req: Request, res: Response, next: NextFunction) => {

    // Obtém a origem enviada pelo navegador
    const origem = req.get('Origin');
    const origemEsperada = `${req.protocol}://${req.get('Host')}`;
    const alteraDados = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
    if (alteraDados && origem && origem !== origemEsperada) {
      return res.status(403).json({ error: 'Origem da requisição não permitida.' });
    }
    next();
  });

  // Valida o formato JSON das requisições que alteram dados
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    if (
      ['POST', 'PATCH', 'PUT'].includes(req.method) && req.path !== '/logout' &&
      (!req.is('application/json') || !req.body || typeof req.body !== 'object' || Array.isArray(req.body))
    ) {
      return res.status(400).json({ error: 'Envie um objeto JSON válido no corpo da requisição.' });
    }
    next();
  });

  // Protege páginas internas e fornece os arquivos do frontend
  const pastaFrontend = path.join(__dirname, '..', 'frontend');
  app.use('/frontend/html', (req: Request, res: Response, next: NextFunction) => {
    
    // Obtém o nome da página solicitada
    const pagina = req.path.toLowerCase();
    
    // Permite abrir a tela de login sem sessão
    if (pagina === '/login.html') return next();
    
    // Redireciona páginas internas quando não houver sessão
    if (!req.session.usuario) return res.redirect('/frontend/html/login.html');
    
    // Impede perfis comuns de abrir a administração
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

  // Verifica se a API consegue consultar o banco
  app.get('/api/health', async (_req: Request, res: Response) => {

    // Reserva a conexão usada pela consulta de saúde
    let conexao: DbConnection | undefined;

    try {
      // Abre o banco e executa uma consulta simples
      conexao = await database.connection();
      await conexao.query('SELECT 1 AS ok');
      return res.status(200).json({ database: 'online' });
    } catch (erro) {
      // Registra uma falha de banco no servidor
      console.error(erro);
      return res.status(503).json({ error: 'Banco de dados indisponível.' });
    } finally {
      if (conexao) await conexao.close();
    }
  });

  // Registra a rota pública que realiza o login
  registrarLogin(app, database);

  // Remove a sessão atual do usuário
  app.post('/api/logout', exigirLogin, (req: Request, res: Response, next: NextFunction) => {
    
    // Destrói os dados guardados na sessão
    req.session.destroy((erro) => {
      if (erro) return next(erro);

      // Remove o cookie usado pelo navegador
      res.clearCookie('portal.sid', { path: '/', httpOnly: true, sameSite: 'lax', secure: false });
      return res.json({ mensagem: 'Sessão encerrada.' });
    });
  });

  // Protege as demais rotas da API e atualiza os dados do usuário
  app.use('/api', async (req: Request, res: Response, next: NextFunction) => {

    // Permite o cadastro inicial antes da primeira conta existir
    const cadastroInicial = req.path === '/usuarios' && req.method === 'POST';

    // Exige login fora do fluxo permitido para o primeiro administrador
    if (!req.session.usuario && !cadastroInicial) {
      return exigirLogin(req, res, next);
    }

    let conexao: DbConnection | undefined;

    let usuarios: UsuarioSessao[] = [];

    try {
      // Abre uma conexão para conferir o cadastro inicial ou o usuário atual
      conexao = await database.connection();

      if (cadastroInicial && !req.session.usuario) {
        // Conta quantos usuários existem para ativar o modo bootstrap
        const usuariosCadastrados = await conexao.query('SELECT COUNT(*) AS total FROM usuarios');
        
        if (Number(usuariosCadastrados[0]?.total || 0) === 0) {
          req.bootstrap = true;
        }
      }

      // Recarrega perfil e dados da conta antes de autorizar operações
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

    if (req.bootstrap) return next()
      ;
    if (!req.session.usuario) return exigirLogin(req, res, next);

    // Encerra a sessão quando a conta foi desativada ou deixou de existir
    if (usuarios.length === 0) {
      return req.session.destroy((erro) => {
        
        if (erro) return next(erro);
        res.clearCookie('portal.sid', { path: '/', httpOnly: true, sameSite: 'lax', secure: false });
        return res.status(401).json({ error: 'Usuário inativo ou sessão expirada.' });
      });
    }

    const usuario = usuarios[0];
    
    // Atualiza a sessão com os dados atuais vindos do banco
    req.session.usuario = { id: usuario.id, nome: usuario.nome, email: usuario.email, perfil: usuario.perfil };
    
    // Disponibiliza o usuário confirmado para todas as rotas seguintes
    req.authUser = req.session.usuario;
    next();
  });

  app.get('/api/sessao', exigirLogin, (req: Request, res: Response) => {
    return res.json(req.session.usuario);
  });

  // Registra as rotas de consulta e cadastro de usuários
  registrarUsuarios(app, database);

  // Registra a rota dos indicadores do dashboard
  registrarDashboard(app, database, now);

  // Registra a listagem com filtros, busca e ordenação
  registrarListagemDemandas(app, database);

  // Registra o cadastro de demandas e a administração de projetos
  registrarCadastroDemandaEProjetos(app, database, now, isHoliday);

  // Registra detalhes, edição e comentários das demandas
  registrarDetalhesEComentarios(app, database, now, isHoliday);

  // Mantém compatibilidade com chamadas que não usam o prefixo /api
  app.use('/dashboard', (req: Request, res: Response) =>
    res.redirect(307, `/api/dashboard${req.url === '/' ? '' : req.url}`)
  );

  app.use('/demandas', (req: Request, res: Response) =>
    res.redirect(307, `/api/demandas${req.url === '/' ? '' : req.url}`)
  );

  app.use('/projetos', (req: Request, res: Response) =>
    res.redirect(307, `/api/projetos${req.url === '/' ? '' : req.url}`)
  );

  // Responde 404 para rotas inexistentes dentro da API
  app.use('/api', (_req: Request, res: Response) => {
    return res.status(404).json({ error: 'Rota não encontrada.' });
  });

  // Trata erros inesperados que não foram respondidos antes
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

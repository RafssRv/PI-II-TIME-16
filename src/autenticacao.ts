/*
  Autora: Sophia Franco de Godoy / RA: 24000833
  Descrição: Tipos e verificações de sessão conforme a Aula 11 de autenticação.
  A sessão fica no servidor. O navegador recebe apenas o cookie portal.sid.
*/
import { Request, Response, NextFunction } from 'express';

export interface UsuarioSessao {
  id: number;
  nome: string;
  email: string;
  perfil: 'ADMIN' | 'LIDER' | 'MEMBRO';
}

// Informa ao TypeScript quais dados podem ser guardados na sessão.
declare module 'express-session' {
  interface SessionData {
    usuario?: UsuarioSessao;
  }
}

export function exigirLogin(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.usuario) {
    return res.status(401).json({ error: 'Faça login para continuar.' });
  }
  next();
}

export function exigirAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.session?.usuario?.perfil !== 'ADMIN') {
    return res.status(403).json({ error: 'Somente um administrador pode realizar esta ação.' });
  }
  next();
}

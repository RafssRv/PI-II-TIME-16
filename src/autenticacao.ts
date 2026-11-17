/*
Autora: Sophia Franco de Godoy -RA: 24000833
Tela: Telas e operações que exigem autenticação

Descrição:
Define quais informações do usuário podem ser guardadas na sessão. Reúne as verificações que exigem login
e restringem determinadas ações aos administradores, retornando uma mensagem quando o acesso não é permitido
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

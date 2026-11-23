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

// Acrescenta os dados do usuário às informações da sessão
declare module 'express-session' {

  // Define quais propriedades podem ser armazenadas na sessão
  interface SessionData {
    // O usuário pode existir ou não, conforme a pessoa estar logada
    usuario?: UsuarioSessao;
  }
}

// Permite continuar somente quando existe uma sessão autenticada
export function exigirLogin(req: Request, res: Response, next: NextFunction) {
  
  // Retorna não autorizado quando o usuário não está salvo na sessão
  if (!req.session?.usuario) {
    return res.status(401).json({ error: 'Faça login para continuar.' });
  }

  // Encaminha o pedido para o próximo processamento da rota
  next();
}

// Permite continuar somente para usuários administradores
export function exigirAdmin(req: Request, res: Response, next: NextFunction) {

  // Retorna proibido quando o perfil da sessão não é administrador
  if (req.session?.usuario?.perfil !== 'ADMIN') {
    return res.status(403).json({ error: 'Somente um administrador pode realizar esta ação.' });
  }
  
  // Encaminha o pedido para o próximo processamento da rota
  next();
}

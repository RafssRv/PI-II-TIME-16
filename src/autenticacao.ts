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

// Avisa ao TypeScript que a sessão pode guardar as informações de um usuário que fez login
declare module 'express-session' {

  // Interface que define quais informações o usuário deve ter
  interface SessionData {
    // ?: significa que essa propriedade é opcional, ou seja, pode existir ou não
    usuario?: UsuarioSessao;
  }
}

// Verificar se a pessoa já fez login antes de permitir que ela acesse uma parte do sistema
export function exigirLogin(req: Request, res: Response, next: NextFunction) {
  
  // Verifica se o usuário está logado 
  // ?.usuario: tenta acessar o usuário guardado na sessão, sem causar erro se a sessão não existir
  if (!req.session?.usuario) {
    return res.status(401).json({ error: 'Faça login para continuar.' });
  }

  // Se havia um usuário na sessão, passa o pedido para a próxima etapa da rota
  next();
}

// Verifica se a pessoa possui o perfil de administrador
export function exigirAdmin(req: Request, res: Response, next: NextFunction) {

  // Verifica se o usuário é ADMIN 
  // ? evita erro caso alguma informação não exista 
  if (req.session?.usuario?.perfil !== 'ADMIN') {
    return res.status(403).json({ error: 'Somente um administrador pode realizar esta ação.' });
  }
  next();
}

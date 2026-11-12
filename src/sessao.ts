import crypto from 'node:crypto';

export function criarToken(usuarioId: number, secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: usuarioId, exp: Math.floor(Date.now() / 1000) + 8 * 60 * 60 })).toString('base64url');
  const mensagem = `${header}.${payload}`;
  const assinatura = crypto.createHmac('sha256', secret).update(mensagem).digest('base64url');
  return `${mensagem}.${assinatura}`;
}

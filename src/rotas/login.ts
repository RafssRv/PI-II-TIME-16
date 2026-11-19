/*
Autora: Sophia Franco de Godoy - RA: 24000833
Tela: Login (backend)

Descrição: 
Faz a autenticação a partir do e-mail e da senha informados. Consulta os usuários ativos e compara a senha com
o hash salvo no banco. Quando os dados estão corretos, regenera o identificador da sessão e salva as informações do 
usuário para permitir o acesso ao sistema
*/

import { Express, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs'; // Compara a senha digitada com o hash guardado no banco de dados
import type { Database, DbConnection } from '../app';
import type { UsuarioSessao } from '../autenticacao'; // Quais informações do usuário podem ser guardadas na sessão

interface UsuarioBanco extends UsuarioSessao {
  // Hash é um resultado calculado a partir da senha
  // Permite conferir a senha digitada sem precisar guardar a senha original no banco
  senha_hash: string;
}

// Registra a rota de login na aplicação
export function registrarLogin(app: Express, database: Database) {

  // Recebe os dados enviados quando uma pessoa tenta entrar no sistema
  // next encaminha o processamento, inclusive erros, para o Express
  // async permite usar await para esperar operações como consultas ao banco
  app.post('/api/login', async (req: Request, res: Response, next: NextFunction) => {

    // req.body contém os dados enviados no corpo do pedido
    // Se não houver corpo, usa {} para evitar erro
    const { email, senha } = req.body || {};

    if (!email || !senha) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    }

    if (typeof email !== 'string' || typeof senha !== 'string') {
      return res.status(400).json({ error: 'Informe e-mail e senha como texto.' });
    }

    // trim() retira espaços do começo e do fim para esta verificação
    // Se o resultado for vazio, o campo tinha apenas espaços e não é aceito
    if (email.trim() === '' || senha.trim() === '') {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    }

    // O bcrypt considera até 72 bytes da senha em UTF-8
    // Esta verificação recusa senhas que ultrapassariam esse limite, para que uma parte delas não seja ignorada durante a comparação
    if (bcrypt.truncates(senha)) {
      return res.status(400).json({ error: 'A senha deve ter até 72 bytes em UTF-8.' });
    }

    // Reserva um lugar para a conexão com o banco
    // Neste momento, ela ainda pode não ter sido criada (undefined)
    let conexao: DbConnection | undefined;

    // Reserva um lugar para o usuário encontrado
    // Também pode ficar undefined caso nenhuma conta corresponda ao e-mail informado
    let usuario: UsuarioBanco | undefined;

    try {
      // Pede uma conexão e espera sua abertura antes de continuar
      conexao = await database.connection();

      // Procura no banco de dados um usuário ativo com o e-mail informado, ignorando maiúsculas e minúsculas
      const usuarios = await conexao.query(
        'SELECT id, nome, email, senha_hash, perfil FROM usuarios WHERE LOWER(email) = LOWER(:email) AND ativo = 1',
        { email: email.trim().toLowerCase() }
      );

      // A consulta devolve uma lista
      // A posição 0 é o primeiro resultado, se a lista estiver vazia, usuario receberá undefined
      usuario = usuarios[0];

    } catch (erro) {
      // Encaminha o problema ao tratamento de erros configurado no servidor
      return next(erro);
      
    } finally {
      // Fechar a conexão com o banco
      // Se a conexão foi aberta, fecha-a para liberar recursos
      if (conexao) await conexao.close();
    }

    // Se um usuário foi encontrado, bcrypt.compare verifica se a senha digitada corresponde ao hash salvo
    // Se não houver usuário, a comparação não é feita 
    const senhaCorreta = usuario && await bcrypt.compare(senha, usuario.senha_hash);

    if (!usuario || !senhaCorreta) {
      return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    }
    
    // Cria uma nova sessão para o usuário que fez login, com um novo identificador
    req.session.regenerate((erro) => {

      // Se houve erro ao criar a sessão, encaminha-o ao servidor e interrompe
      if (erro) return next(erro);

      // Guarda na sessão as informações do usuário que fez login.
      // Essas informações permitem que o sistema reconheça o usuário depois, sem precisar pedir o e-mail e a senha novamente
      req.session.usuario = {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        perfil: usuario.perfil
      };

      // Salva a sessão com as informações do usuário
      req.session.save((erro) => {

        // Se o salvamento falhar, encaminha o erro ao servidor
        if (erro) return next(erro);

        // Envia uma resposta informando que o login foi realizado com sucesso
        // A senha e o hash não são enviados
        return res.status(200).json(req.session.usuario);
      });
    });
  });
}

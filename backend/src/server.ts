/*
Autora: Sophia Godoy
Descrição: Implementação das rotas POST /login e GET /usuarios com Express e TypeScript, validação de credenciais, tratamento de erros HTTP e listagem de usuários sem expor senhas
*/

import express, { Request, Response } from "express";
import cors from "cors";

// Criando o servidor Express
const app = express();

// Definindo a porta do servidor
const PORT = 3000;

// Permite receber dados em formato JSON
app.use(express.json());

// Permite que o frontend faça requisições para a API
app.use(cors());

/*
  Interface Usuario:
  - Define os dados que cada usuário deve ter
  - Cada usuário possui id, nome, email, senha e perfil
*/
interface Usuario {
  id: number;
  nome: string;
  email: string;
  senha: string;
  perfil: string;
}

// Lista de usuários cadastrados para testes
/*
  Usuários cadastrados para testes:
  - Administrador
  - Líder de Projeto
  - Membro da Equipe
*/
let usuarios: Usuario[] = [
  {
    id: 1,
    nome: "João",
    email: "joao@email.com",
    senha: "123456",
    perfil: "Administrador"
  },
  {
    id: 2,
    nome: "Maria",
    email: "maria@email.com",
    senha: "654321",
    perfil: "Líder de Projeto"
  },
  {
    id: 3,
    nome: "Pedro",
    email: "pedro@email.com",
    senha: "123789",
    perfil: "Membro da Equipe"
  }
];

// Rota POST /login
app.post("/login", (req: Request, res: Response) => {

  // Pega o email e a senha enviados pelo frontend
  const { email, senha } = req.body || {};

  // Verifica se os campos obrigatórios foram preenchidos
  if (
    typeof email !== "string" ||
    typeof senha !== "string" ||
    !email.trim() ||
    !senha.trim()
  ) {
    return res.status(400).json({
      mensagem: "Email e senha são obrigatórios"
    });
  }

  /*
    Procurando o usuário:
    - find percorre a lista de usuários
    - Verifica se o email e a senha correspondem
    - Se encontrar, retorna o usuário
  */
  const usuario = usuarios.find((item) => {
    return item.email === email && item.senha === senha;
  });

  // Se não encontrar, retorna erro 401
  if (!usuario) {
    return res.status(401).json({
      mensagem: "Email ou senha inválidos"
    });
  }

  // Retorna somente os dados permitidos, sem a senha
  return res.status(200).json({
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    perfil: usuario.perfil
  });

});

// Rota GET /usuarios
app.get("/usuarios", (req: Request, res: Response) => {

  /*
    map percorre a lista de usuários:
    - Cria uma nova lista
    - Seleciona somente os dados permitidos
    - Não inclui a senha
  */
  const listaUsuarios = usuarios.map((item) => {
    return {
      id: item.id,
      nome: item.nome,
      email: item.email,
      perfil: item.perfil
    };
  });

  // Retorna a lista sem as senhas
  return res.status(200).json(listaUsuarios);

});

// Inicializando o servidor
app.listen(PORT, () => {
  console.log(`Servidor ativo na porta ${PORT}`);
});

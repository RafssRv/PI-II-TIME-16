# Banco Oracle

## Modelo

- `usuarios`: identidade, hash de senha e perfil global (administrador, líder ou membro).
- `projetos` e `projeto_membros`: projetos e sua equipe; a chave composta impede inscrições duplicadas.
- `demandas`: pertence a um projeto, tem criador e pode ter um responsável. Tipo, prioridade e status usam códigos sem acentos; a interface deve traduzi-los.
- `comentarios`: vinculados à demanda e ao autor.
- `historico_demandas`: registra criação e alterações por usuário, campo e valores anterior e novo.

As chaves estrangeiras impedem exclusões que deixariam registros órfãos. Usuários e projetos podem ser desativados; para excluir definitivamente uma demanda é necessário decidir o tratamento dos comentários e histórico antes de removê-los. Não há exclusão em cascata. O banco não impõe que criador ou responsável seja membro do projeto: a API deverá validar essa regra se o grupo a adotar.

`atualizado_em` recebe a data inicial automaticamente; a aplicação deve atualizá-lo em cada edição. A aplicação deve inserir os eventos de histórico na mesma transação das alterações da demanda. O campo `senha_hash` deve guardar somente um hash seguro gerado pela aplicação, nunca a senha. Perfis, autenticação e autorização dependem da API; as restrições SQL não implementam essas regras. A validação de prazo e feriados também pertence à aplicação.

## Preparação no SQL Developer

1. Solicite ao responsável pelo Oracle: host, porta, **nome do serviço** (ou SID, se for o caso), usuário, senha e versão do banco. Para Oracle Cloud, confirme também se é necessário wallet e receba-o por canal seguro. Não coloque credenciais no repositório.
2. Abra o SQL Developer e clique em **Nova conexão** (ícone `+`). Dê um nome, informe usuário e senha e selecione o tipo de conexão indicado pelo administrador. Em conexão básica, informe host e porta e escolha **Nome do serviço** ou **SID** conforme os dados recebidos. Para wallet, siga as instruções fornecidas pelo administrador da instância.
3. Clique em **Testar**. Se falhar, confira rede/VPN, serviço, credenciais e permissões com o responsável; não prossiga até obter sucesso. Clique em **Conectar**.
4. Use preferencialmente um usuário/schema próprio da aplicação, criado pelo administrador com `CREATE SESSION`, `CREATE TABLE` e quota no tablespace adequado. Não execute o schema em `SYS` ou `SYSTEM`. Confirme que o schema está vazio e possui espaço; este script não apaga tabelas existentes.
5. Abra `database/schema.sql` no SQL Developer, selecione a conexão correta na worksheet e execute como **script** (F5). Confira a saída de cada comando: DDL do Oracle faz commit implícito e uma falha pode deixar uma instalação parcial. Não reexecute às cegas; identifique e remova os objetos parciais apenas no schema de desenvolvimento, ou peça auxílio ao administrador.
6. Atualize a árvore **Tabelas** da conexão e confira `USUARIOS`, `PROJETOS`, `PROJETO_MEMBROS`, `DEMANDAS`, `COMENTARIOS` e `HISTORICO_DEMANDAS`. As tabelas vazias ainda não tornam as telas funcionais.

O script usa colunas identity e requer Oracle 12c ou superior. Ele cria a estrutura do zero em schema vazio, sem dados iniciais nem contas. A versão, privilégios e conectividade precisam ser confirmados antes da execução.

## Próxima etapa

O servidor expõe `GET /api/health`, login, CRUD de usuários, projetos, membros, demandas e comentários. Criação e alteração de demandas registram histórico na mesma transação. Usuários e projetos são desativados em vez de apagados; excluir uma demanda apaga seus comentários e histórico na mesma transação.

A conexão usa `ORACLE_USER`, `ORACLE_PASSWORD` e `ORACLE_CONNECT_STRING`; copie `.env.example` para `.env` sem versioná-lo. Instale as dependências com `pnpm install` e execute `pnpm start`. As telas de login, cadastro, listagem e detalhes consomem a API.

Ainda não é possível confirmar a integração real sem um Oracle acessível e sem executar o `schema.sql`. Depois que o script criar as tabelas, valide primeiro `GET /api/health`. A API valida credenciais no login, mas ainda não emite token nem bloqueia endpoints por perfil; essa autorização deve ser implementada antes de produção.

## Primeiro acesso

Depois de executar o schema e iniciar o servidor, crie o primeiro usuário pela API:

```http
POST /api/usuarios
Content-Type: application/json

{
  "nome": "Administrador",
  "email": "admin@local.test",
  "senha": "defina-uma-senha-forte",
  "perfil": "ADMIN"
}
```

Crie também um projeto com `POST /api/projetos`. Em seguida, abra `http://localhost:3000`, faça login e cadastre a primeira demanda.

# Banco MySQL

O projeto usa MySQL 8.4, `mysql2/promise`, InnoDB e utf8mb4. Não há instalação automática do servidor. O MySQL Workbench é o cliente para conectar e executar SQL; o servidor MySQL precisa estar instalado e ativo.

## Modelo e comportamento preservados

- `usuarios`: nome, e-mail único sem diferença de caixa/espaços, hash de senha e perfil.
- `projetos` e `projeto_membros`: projetos e equipe, sem inscrições duplicadas.
- `demandas`: projeto, criador, responsável opcional, título, descrição, tipo, prioridade, status e prazo.
- `comentarios`: texto e autor vinculados à demanda.
- `historico_demandas`: criação e alterações por campo, autor, valor anterior e novo.

Usuários e projetos são desativados pela API. Demandas não são excluídas fisicamente: DELETE retorna 405. O cancelamento usa PATCH com status CANCELADA e preserva comentários e histórico. Criação/edição da demanda e histórico são atômicos. A conexão inicia transações explicitamente e desfaz qualquer transação aberta antes de voltar ao pool. Senhas da aplicação são gravadas em hash; `atualizado_em` é atualizado pela API. Prazo é devolvido como `YYYY-MM-DD`, e timestamps são tratados em UTC.

O login confere credenciais, mas os endpoints ainda não exigem sessão/token e não aplicam autorização por perfil nem pertencimento ao projeto. As rotas legadas `/dashboard` e `/demandas` redirecionam para `/api`, que é a fonte de persistência. O dashboard consulta o MySQL. As limitações de autenticação ficam fora desta integração.

## Preparação quando o MySQL estiver disponível

1. No MySQL Workbench, crie uma conexão com host `127.0.0.1`, porta `3306` e o usuário administrativo definido na instalação. Clique em **Test Connection**. Use a senha real escolhida na instalação.
2. Conectado como administrador, execute uma vez, substituindo a senha abaixo:

```sql
CREATE DATABASE demandas_app CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_cs;
CREATE USER 'app_demandas'@'localhost' IDENTIFIED BY 'substitua_por_sua_senha';
GRANT SELECT, INSERT, UPDATE, DELETE ON demandas_app.* TO 'app_demandas'@'localhost';
```

3. Na mesma conexão administrativa, execute `USE demandas_app;`. Abra `database/schema.sql` e execute o script completo. Ele requer um banco vazio e não apaga dados nem recria tabelas já existentes. DDL faz commit implícito: confira todos os resultados e corrija erros antes de continuar. Execute o schema só uma vez por banco vazio.
4. Confira `SHOW TABLES;`: devem existir seis tabelas. O usuário da aplicação recebe somente acesso aos dados; o administrador executa a criação de tabelas.
5. Crie uma conexão no Workbench com o usuário `app_demandas`, a senha definida e o banco `demandas_app` para consultar os registros da aplicação.

## Executar a aplicação

Na raiz do repositório, copie `.env.example` para `.env` e preencha:

```dotenv
PORT=3000
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DATABASE=demandas_app
MYSQL_USER=app_demandas
MYSQL_PASSWORD=sua_senha_real
```

Não use o administrador/root na aplicação. O `.env` não é versionado. Execute:

```bash
pnpm install
pnpm build
pnpm start
```

Abra `http://localhost:3000/api/health`: o resultado esperado é `{"database":"online"}`. Esse endpoint verifica a conexão; não confirma sozinho que todas as tabelas foram criadas.

## Primeiro usuário, projeto e teste manual

No Postman, envie `POST http://localhost:3000/api/usuarios`, Body → raw → JSON:

```json
{"nome":"Administrador","email":"admin@local.test","senha":"defina-uma-senha-forte","perfil":"ADMIN"}
```

Crie o projeto com `POST http://localhost:3000/api/projetos`:

```json
{"nome":"Sistema de Demandas","descricao":"Projeto Integrador II"}
```

Abra `http://localhost:3000`, faça login com o usuário criado e acesse a tela de demandas. Cadastre, liste, abra o detalhe, edite, altere status e comente. Recarregue a página para verificar persistência. Confira no Workbench:

```sql
SELECT * FROM demandas ORDER BY id;
SELECT * FROM comentarios ORDER BY id;
SELECT * FROM historico_demandas ORDER BY id;
SELECT id, nome, email, perfil, ativo FROM usuarios;
SELECT * FROM projetos;
```

Depois cancele uma demanda com `PATCH /api/demandas/:id`, corpo `{"autor_id": ID_DO_USUARIO, "status": "CANCELADA"}`: o registro, os comentários e o histórico devem continuar presentes. O ciclo é ABERTA → EM_ANDAMENTO → EM_REVISAO → CONCLUIDA; EM_REVISAO pode retornar a EM_ANDAMENTO. Demandas concluídas não podem ser canceladas. Usuários e projetos são gerenciados pela API; não há telas administrativas próprias. `GET/POST/PATCH/DELETE /api/usuarios` e `/api/projetos` cobrem listagem, criação, edição por `/:id` e desativação por `/:id`. Membros usam `/api/projetos/:id/membros`; comentários usam `/api/demandas/:id/comentarios` e `/api/comentarios/:id`.

## Testes automatizados

`pnpm test` roda testes com adaptador simulado, sem exigir MySQL. O teste real é ignorado por padrão. Para executá-lo, crie um banco separado `demandas_app_test`, aplique nele o mesmo schema e conceda ao usuário acesso somente às tabelas desse banco de testes. Configure `MYSQL_DATABASE=demandas_app_test` e execute:

```bash
MYSQL_INTEGRATION=1 pnpm test
```

O teste exige nome terminado em `_test`, cria registros próprios, verifica login, IDs, datas, edição, comentário, histórico, filtros, dashboard e cancelamento e remove somente os registros que criou por SQL de limpeza no banco de testes. Não use dados reais nesse banco.

Esta entrega prepara uma instalação nova em MySQL; não transfere dados de uma instância Oracle existente.


## Integração de detalhes, listagem e dashboard

- `GET /api/dashboard`: totais, distribuições e demandas críticas/próximas do prazo (hoje até sete dias, calendário de São Paulo).
- `GET /api/demandas`: filtros combináveis `status`, `prioridade`, `tipo`, `projeto_id`, `responsavel_id`, `busca` (título ou descrição).
- `ordenacao`: `criacao_desc` (padrão), `prazo_asc`, `prioridade_desc` ou `status`.
- `PATCH /api/demandas/:id`: edição de campos com `autor_id`, histórico transacional, ciclo de status e responsável ativo vinculado ao projeto.
- Alterações de prazo validam formato, data real, passado e feriados nacionais na BrasilAPI; indisponibilidade retorna 503 e não grava o prazo.
- A criação de demandas e o login existentes não foram alterados. A criação ainda precisa receber, em trabalho separado, a mesma validação de feriados e de pertencimento do responsável.
- Não há sessão validada no servidor nem autorização por perfil: `autor_id` ainda é enviado pelo cliente. Essa integração funcional não elimina essa pendência de segurança.

Na interface, abra listagem ou dashboard após entrar pelo fluxo existente. Em detalhes use Editar, Salvar status, Comentar e Cancelar demanda. O botão Projetos nas telas integradas direciona ao filtro por projeto da listagem; ainda não existe uma tela administrativa de projetos.

# Banco MySQL e execução local

O backend usa MySQL 8.0 ou superior, `mysql2/promise`, InnoDB e `utf8mb4`. O banco local da equipe pode ser o MySQL 8.0.46 já instalado; o serviço do banco precisa estar ativo antes de iniciar a API.

## Preparar o banco

1. Entre como administrador no MySQL. No Ubuntu:

   ```bash
   sudo mysql -u root -p
   ```

2. Crie uma base de desenvolvimento e uma conta de aplicação. Escolha uma senha local e não a salve no repositório:

   ```sql
   CREATE DATABASE demandas_app CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_cs;
   CREATE USER 'app_demandas'@'127.0.0.1' IDENTIFIED BY 'escolha-uma-senha-local';
   GRANT SELECT, INSERT, UPDATE, DELETE ON demandas_app.* TO 'app_demandas'@'127.0.0.1';
   ```

3. Selecione a base vazia e aplique o schema uma vez:

   ```sql
   USE demandas_app;
   SOURCE /caminho/absoluto/PI-II-TIME-16/database/schema.sql;
   SHOW TABLES;
   ```

   Devem aparecer `usuarios`, `projetos`, `projeto_membros`, `demandas`, `comentarios` e `historico_demandas`. O schema não apaga tabelas e não é uma migration incremental. Não o execute sobre uma base existente sem backup e revisão.

4. Saia do cliente MySQL. A API usa `127.0.0.1`, porta `3306` e as credenciais da conta de aplicação. Não use root na aplicação.

## Configurar e iniciar a API

Na raiz do repositório:

```bash
cp .env.example .env
nano .env
```

Preencha as configurações do banco:

```dotenv
PORT=3000
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DATABASE=demandas_app
MYSQL_USER=app_demandas
MYSQL_PASSWORD=sua_senha_local
```

Node.js 26 LTS é o requisito do projeto. Instale e execute em desenvolvimento com `npm install` e `npm run dev`; para compilar e iniciar a versão de produção, use `npm run build` e `npm start`. Acesse `http://localhost:3000/api/health`; a resposta esperada é `{"database":"online"}`.

O `SESSION_SECRET` é opcional no ambiente local: sem ele, o servidor gera uma chave temporária e tokens deixam de valer quando o processo reinicia. Para manter sessões entre reinicializações, gere uma chave com `openssl rand -hex 32` e adicione `SESSION_SECRET=<chave-gerada>` ao `.env`. Não compartilhe nem versione esse valor.

## Criar o primeiro ADMIN e entrar

O primeiro usuário só pode ser criado pela API quando a tabela `usuarios` está vazia. O servidor protege esse cadastro inicial com um lock do MySQL e aceita somente perfil `ADMIN`. Nunca insira senha diretamente no banco: a API aplica bcrypt antes de armazenar o hash.

Envie pelo Postman ou curl, trocando a senha por uma senha forte com pelo menos 10 caracteres:

```bash
curl -X POST http://localhost:3000/api/usuarios \
  -H 'Content-Type: application/json' \
  -d '{"nome":"Administrador","email":"admin@local.test","senha":"escolha-uma-senha-forte","perfil":"ADMIN"}'
```

Faça login pela tela em `http://localhost:3000` ou pela rota `POST /api/login` com `email` e `senha`. A resposta contém `usuario` e `token`. A interface guarda ambos em `sessionStorage` e envia `Authorization: Bearer <token>` nas chamadas protegidas. O token expira após oito horas. Depois do primeiro ADMIN, novos usuários só podem ser criados por uma requisição autenticada de ADMIN.

O ADMIN cria um projeto em `POST /api/projetos` e vincula usuários em `POST /api/projetos/:id/membros`, com corpo `{"usuario_id": 2}`. Para testar líder e membro, cadastre os perfis e vincule-os aos projetos pelo ADMIN. O usuário autenticado deve ser usado para gravar criador, responsável pela alteração, autor do histórico e autor dos comentários; esses IDs não são aceitos como fonte confiável do cliente.

## Permissões aplicadas na API

| Perfil | Acesso atual |
| --- | --- |
| ADMIN | Acessa todas as demandas e administra usuários, projetos e equipes. |
| LIDER | Consulta os projetos aos quais está vinculado; cria, edita e cancela demandas desses projetos. |
| MEMBRO | Consulta demandas de projetos vinculados, comenta e só pode alterar status de demanda atribuída a si: `ABERTA → EM_ANDAMENTO → EM_REVISAO`. |

Estas são as regras provisórias adotadas para implementar a proteção no servidor; a equipe deve confirmar a matriz com o documento/reunião. Comentários só podem ser editados ou removidos pelo autor ou por ADMIN. A interface oculta ações indisponíveis, mas a autorização também é verificada pela API.

## Regras de demandas

- Criar demanda exige projeto ativo. LIDER precisa estar vinculado a esse projeto; membro não pode criar demandas.
- Responsável é opcional; quando informado, precisa ser usuário ativo vinculado ao projeto.
- Prazo vazio é aceito. Prazo informado precisa ser data real, não pode estar no passado nem em feriado nacional. Cadastro e edição usam a BrasilAPI; se a consulta falhar, a API retorna 503 e não grava a mudança.
- Transições são `ABERTA → EM_ANDAMENTO → EM_REVISAO → CONCLUIDA`; revisão pode retornar a andamento. ADMIN/LIDER podem cancelar uma demanda ainda não concluída. Demanda concluída/cancelada não volta ao fluxo.
- Exclusão física de demanda é bloqueada (`DELETE` retorna 405). Use `PATCH /api/demandas/:id` com `{"status":"CANCELADA"}`. Comentários e histórico são preservados.
- Atualizações da demanda e seus eventos de histórico são gravadas na mesma transação.

## Testes com MySQL

`npm test` executa os testes automatizados com banco simulado. Para o teste de integração, crie uma base separada e vazia terminada em `_test`, por exemplo `demandas_app_test`, aplique nela `database/schema.sql` e use credenciais com permissões apenas nessa base. O teste cria e remove seus próprios registros; não rode com dados reais.

```bash
MYSQL_INTEGRATION=1 MYSQL_DATABASE=demandas_app_test npm test
```

O teste de integração exige a tabela `usuarios` vazia no início para poder exercitar o cadastro inicial. Se uma execução for interrompida antes da limpeza, revise e limpe manualmente apenas o banco descartável de teste antes de executar de novo.

## Consultas de conferência

Após cadastrar e usar a aplicação, confira persistência e autoria no MySQL:

```sql
SELECT id, nome, email, perfil, ativo FROM usuarios;
SELECT id, nome, ativo FROM projetos;
SELECT id, projeto_id, criador_id, responsavel_id, status, prazo FROM demandas ORDER BY id;
SELECT id, demanda_id, autor_id, texto, criado_em FROM comentarios ORDER BY id;
SELECT id, demanda_id, autor_id, acao, campo, valor_anterior, valor_novo
FROM historico_demandas ORDER BY id;
```

Esta instalação é local para desenvolvimento. Não contém usuários de demonstração; o primeiro ADMIN e os demais dados são cadastrados pela API.

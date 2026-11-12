# DemandasApp — PI-II-TIME-16

Projeto desenvolvido no componente curricular Projeto Integrador II do curso de Engenharia de Software da Pontifícia Universidade Católica de Campinas, no segundo semestre de 2026.

**Professora orientadora:** Renata Arantes.

## Integrantes da equipe

| Nome | RA | Semestre |
|---|---|---|
| Heloisa Lacerda Marinho | 25893868 | 4º |
| Priscila Amorim dos Santos | 24787350 | 6º |
| Rafael Roveri Pires | 24007131 | 6º |
| Sophia Franco de Godoy | 24000833 | 6º |
| Vinícius Panutti Salgado | 25007329 | 4º |

## Sobre o projeto

O DemandasApp é um sistema de acompanhamento de demandas de desenvolvimento de software. Permite organizar tarefas, defeitos, melhorias e atividades de documentação vinculadas a projetos.

A aplicação integra frontend, API e banco de dados relacional, com autenticação e permissões específicas para Administrador, Líder de Projeto e Membro da Equipe.

## Funcionalidades

- Autenticação de usuários.
- Consulta de projetos e integrantes das equipes.
- Cadastro e desativação de projetos pela interface do Administrador, com consulta de projetos ativos e inativos.
- Cadastro, listagem, detalhamento e edição de demandas.
- Atribuição e alteração de responsável, prioridade e prazo.
- Troca do projeto de uma demanda pela janela de edição, respeitando as permissões de acesso.
- Atualização de status conforme o ciclo de vida da demanda.
- Cancelamento sem exclusão física do registro.
- Reabertura de demandas canceladas por Administrador ou Líder autorizado, preservando os dados e o histórico.
- Registro de comentários e histórico de alterações.
- Filtros por status, prioridade, tipo, projeto e responsável.
- Busca textual por título ou descrição.
- Ordenação por prioridade, data de criação, prazo ou status.
- Dashboard com indicadores e demandas próximas do prazo.
- Validação de prazos com a API externa de feriados nacionais.

## Tecnologias utilizadas

| Camada | Tecnologias |
|---|---|
| Frontend | HTML5, CSS3, JavaScript e Bootstrap |
| Backend | Node.js, TypeScript e Express |
| Banco de dados | MySQL, com o driver mysql2 |
| Autenticação | Senhas protegidas com bcrypt e sessões no servidor com express-session |
| API externa | BrasilAPI — feriados nacionais |
| Versionamento | Git e GitHub |

## Pré-requisitos

- Node.js 26 ou superior, conforme o requisito definido no `package.json`.
- npm.
- Git.
- MySQL 8.0 ou superior, com o serviço em execução.
- Um cliente SQL, como o MySQL Workbench.
- Acesso à internet para consultar a BrasilAPI e carregar os recursos externos da interface.

Verifique as ferramentas no terminal:

```bash
node --version
npm --version
git --version
```

## Como executar o projeto

### 1. Clonar o repositório

```bash
git clone --branch develop https://github.com/RafssRv/PI-II-TIME-16.git
cd PI-II-TIME-16
npm ci
```

Execute os próximos comandos a partir da raiz do projeto.

### 2. Criar o banco e o usuário da aplicação

Conecte-se ao MySQL com uma conta administrativa e execute:

```sql
CREATE DATABASE demandas_app
CHARACTER SET utf8mb4
COLLATE utf8mb4_0900_as_cs;

CREATE USER 'app_demandas'@'127.0.0.1'
IDENTIFIED BY 'troque_por_uma_senha_local';

GRANT SELECT, INSERT, UPDATE, DELETE
ON demandas_app.*
TO 'app_demandas'@'127.0.0.1';
```

Substitua `troque_por_uma_senha_local` por uma senha escolhida para o ambiente local. Essa mesma senha deverá ser informada no arquivo `.env`.

No MySQL Workbench:

1. Defina `demandas_app` como o banco padrão da conexão.
2. Abra o arquivo `database/schema.sql` do projeto.
3. Execute todo o conteúdo do arquivo usando a conta administrativa.

Confira as tabelas:

```sql
USE demandas_app;
SHOW TABLES;
```

Devem existir:

- `usuarios`
- `projetos`
- `projeto_membros`
- `demandas`
- `comentarios`
- `historico_demandas`

O schema deve ser aplicado uma única vez em um banco vazio.

### 3. Configurar as variáveis de ambiente

Crie o arquivo `.env` a partir do exemplo.

No Windows, usando PowerShell:

```powershell
Copy-Item .env.example .env
```

No Linux ou macOS:

```bash
cp .env.example .env
```

Abra o arquivo `.env` e configure:

```dotenv
PORT=3000
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DATABASE=demandas_app
MYSQL_USER=app_demandas
MYSQL_PASSWORD=troque_por_uma_senha_local
```

A senha deve ser igual à definida ao criar o usuário no MySQL.

O arquivo `.env` contém configurações locais e não deve ser enviado ao repositório.

Configure obrigatoriamente `SESSION_SECRET` no `.env`, conforme a Aula 11 de autenticação. Gere uma chave aleatória no terminal e copie o resultado para essa variável:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

O servidor recusa chaves ausentes, com menos de 32 caracteres ou que ainda comecem com `SUBSTITUA_`. Não publique a chave.

A autenticação usa `express-session`, com os dados do usuário na memória do servidor e o cookie `portal.sid` no navegador. O cookie é `HttpOnly`, `SameSite=Lax` e tem validade de 30 minutos. A configuração `secure: false` corresponde ao ambiente local HTTP da aula. Reiniciar o backend encerra as sessões; os usuários e demais dados continuam no MySQL.

As rotas de autenticação são `POST /api/login`, `GET /api/sessao` e `POST /api/logout`. O navegador envia o cookie com `credentials: 'same-origin'`. O logout destrói a sessão no servidor e limpa o cookie. O frontend consulta a sessão antes de carregar cada tela e não armazena tokens em `sessionStorage`.

Os perfis do projeto continuam sendo `ADMIN`, `LIDER` e `MEMBRO`, com suas permissões específicas. A conta ativa e seu perfil são conferidos no banco durante os acessos à API. As páginas internas também verificam a sessão antes de entregar o HTML. No ambiente de aula, o site e a API devem ser abertos pela mesma origem, usando o endereço do servidor Express.

### 4. Criar os dados de demonstração

Com as tabelas criadas e o `.env` configurado, execute:

```bash
npm run seed
```

O comando cria:

- Seis usuários com os três perfis de acesso.
- Dois projetos com suas equipes.
- Dez demandas distribuídas entre os tipos, prioridades e status.
- Comentários e histórico para demonstração.

Utilize o seed em um banco de demonstração recém-preparado. O script recusa a execução se já houver usuários cadastrados.

### 5. Iniciar a aplicação

Para executar em desenvolvimento:

```bash
npm run dev
```

Acesse no navegador:

```text
http://localhost:3000
```

O endereço abre a tela de login. O próprio backend disponibiliza o frontend; não é necessário iniciar outro servidor para as páginas HTML.

Para encerrar o servidor, pressione `Ctrl+C`.

## Contas de demonstração

Após executar `npm run seed`, as contas abaixo ficam disponíveis.

**Senha padrão de todas as contas:** `demo-pi2-2026`

| Perfil | E-mail |
|---|---|
| Administrador | admin@local.test |
| Líder de Projeto — Ana | ana.lider@local.test |
| Líder de Projeto — Bruno | bruno.lider@local.test |
| Membro da Equipe — Carla | carla.membro@local.test |
| Membro da Equipe — Diego | diego.membro@local.test |
| Membro da Equipe — Elisa | elisa.membro@local.test |

Essas credenciais são destinadas à demonstração local. A senha usada pelo seed pode ser personalizada pela variável `SEED_SENHA`, com pelo menos dez caracteres.

Usuários, projetos e vínculos também podem ser cadastrados pela API. Consulte [a documentação do banco e da API](database/README.md) para o cadastro inicial sem utilizar o seed.

## Perfis e permissões

| Perfil | Permissões |
|---|---|
| Administrador | Consulta todos os projetos, usuários e demandas; cria e edita demandas; altera responsáveis, prioridades e status; cancela demandas e administra usuários, projetos e equipes pela API. |
| Líder de Projeto | Consulta os projetos aos quais está vinculado e gerencia as demandas desses projetos, incluindo atribuição de responsável, edição, conclusão e cancelamento. |
| Membro da Equipe | Consulta os projetos aos quais está vinculado e suas demandas, registra comentários, visualiza o histórico e avança o status das demandas atribuídas a si dentro das transições permitidas. |

O Membro da Equipe pode alterar o status de `Aberta` para `Em andamento` e de `Em andamento` para `Em revisão`. Não pode concluir ou cancelar demandas, alterar prioridades ou atribuir responsáveis.

As permissões são verificadas no backend. Na tela **Projetos e usuários**, o Administrador pode criar projetos informando nome e descrição e desativá-los sem apagar as demandas, os comentários ou o histórico. O filtro de situação permite consultar projetos inativos. Projetos novos começam sem integrantes; os vínculos de equipe são cadastrados pela API.

## Regras das demandas

### Classificações

- **Tipos:** Tarefa, Defeito, Melhoria e Documentação.
- **Prioridades:** Crítica, Alta, Média e Baixa.
- **Status:** Aberta, Em andamento, Em revisão, Concluída e Cancelada.

### Ciclo de vida

Toda demanda é criada com status `Aberta`.

O fluxo principal é:

```text
Aberta → Em andamento → Em revisão → Concluída
```

Uma demanda em revisão pode retornar para `Em andamento`.

O Administrador ou o Líder autorizado pode cancelar uma demanda enquanto ela não estiver concluída. Demandas concluídas não retornam ao fluxo.

Como funcionalidade adicional ao fluxo principal, Administradores e Líderes vinculados ao projeto podem reabrir uma demanda de `Cancelada` para `Aberta`, pelo botão **Reabrir demanda** na tela de detalhes. Os dados, comentários e o histórico anterior são mantidos, e a reabertura gera um novo registro de alteração de status. Membros da Equipe não podem reabrir demandas.

### Responsável, prazo e histórico

- Toda demanda pertence a um projeto.
- O responsável pode ficar em branco.
- Quando atribuído, o responsável precisa estar ativo e vinculado ao projeto.
- Ao trocar de projeto, o responsável é mantido se participar da equipe de destino. Caso contrário, a demanda fica sem responsável até uma nova atribuição.
- O prazo é opcional. Quando informado pela API, deve ser uma data válida, não pode estar no passado nem coincidir com um feriado nacional.
- A validação de feriados utiliza a BrasilAPI. Se a consulta falhar, a operação que informa o prazo é rejeitada com uma mensagem de erro.
- Datas de criação e atualização são registradas automaticamente.
- Alterações na demanda geram registros de histórico.
- O cancelamento preserva a demanda, seus comentários e seu histórico.
- A exclusão física de demandas é bloqueada pela API.

## Dashboard

O dashboard apresenta:

- Total de demandas.
- Quantidade por status.
- Quantidade por prioridade.
- Quantidade por tipo.
- Demandas críticas ainda não concluídas ou canceladas.
- Demandas em aberto com prazo entre hoje e os próximos sete dias.

Os dados respeitam o acesso do usuário autenticado.

## Compilar e executar a versão compilada

```bash
npm run build
npm start
```

A compilação gera os arquivos na pasta `dist`.

O MySQL e o arquivo `.env` devem estar configurados também para essa forma de execução.

## Testes automatizados

Execute:

```bash
npm test
```

A execução padrão utiliza banco simulado nos testes da API e do acesso ao banco, além de simular as respostas da API de feriados.

O teste com MySQL real é ignorado por padrão. Para executá-lo, prepare um banco separado, com nome terminado em `_test`, aplique o schema e configure credenciais exclusivas para esse banco.

Em um terminal PowerShell separado:

```powershell
$env:MYSQL_INTEGRATION = "1"
$env:MYSQL_DATABASE = "demandas_app_test"
$env:MYSQL_USER = "app_demandas_test"
$env:MYSQL_PASSWORD = "senha_do_usuario_de_teste"

npm test
```

O banco de integração deve ser exclusivo para testes, pois o teste cria registros e os remove ao finalizar.

## Conferir a conexão com o banco

Com o servidor em execução, acesse:

```text
http://localhost:3000/api/health
```

A resposta esperada é:

```json
{"database":"online"}
```

## Estrutura do projeto

```text
PI-II-TIME-16/
├── database/          # Schema e documentação do MySQL
├── frontend/
│   ├── css/           # Estilos das páginas
│   ├── html/          # Páginas da aplicação
│   └── js/            # Scripts e comunicação com a API
├── src/
│   ├── app.ts         # Rotas e regras da API
│   ├── database.ts    # Conexão com o MySQL
│   ├── holidays.ts    # Consulta de feriados nacionais
│   ├── seed.ts        # Dados de demonstração
│   └── server.ts      # Inicialização do servidor
├── test/              # Testes automatizados
├── .env.example       # Exemplo de configuração
├── package.json       # Dependências e comandos
└── tsconfig.json      # Configuração do TypeScript
```

## Problemas comuns

| Problema | Verificação |
|---|---|
| Acesso negado ao MySQL | Confira usuário, senha, host e permissões informados no `.env`. |
| Falha ao conectar ao banco | Verifique se o serviço MySQL está em execução e se a porta está correta. |
| Banco ou tabela inexistente | Confira a criação de `demandas_app` e a execução de `database/schema.sql`. |
| O seed informa que já existem usuários | Utilize as contas existentes ou prepare outro banco vazio para demonstração. |
| Não foi possível validar o prazo | Verifique a conexão com a internet e tente novamente. |
| Sessão encerrada após reiniciar o servidor | Faça login novamente. As sessões da aula ficam na memória do processo, mesmo com `SESSION_SECRET` configurado. |
| Porta 3000 ocupada | Defina outra porta na variável `PORT` e utilize esse número no navegador. |

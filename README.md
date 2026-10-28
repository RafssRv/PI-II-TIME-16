# PI-II-TIME-16

## Curso
  Engenharia de Software - Pontifícia Universidade Católica de Campinas - 2 semestre 2026

## Integrantes da Equipe  
| Nome | RA | Semestre |
|---|---:|:---:|
| **Helosia Lacerda Marinho** | 25893868 | 4º |
| **Priscila Amorim dos Santos** | 24787350 | 6º |
| **Rafael Roveri Pires** | 24007131 | 6º |
| **Sophia Franco de Godoy** | 24000833 | 6º |
| **Vinícius Panutti Salgado** | 25007329 | 4º |

## Sobre o projeto
Neste projeto, será desenvolvido um Sistema de Acompanhamento de
Demandas de Desenvolvimento, inspirado em ferramentas utilizadas por equipes de
tecnologia para organizar tarefas, defeitos (“bugs”) e melhorias de um software.
o sistema permitirá cadastrar, visualizar, filtrar, editar, atribuir responsáveis
e acompanhar o status das demandas, com diferentes níveis de acesso para
Administradores, Líderes de Projeto e Membros da Equipe.
Também haverá comentários, histórico de alterações, dashboard com indicadores e
filtros/buscas, formando uma espécie de ferramenta de gerenciamento de projetos
de desenvolvimento.

### Professora Orientadora
Professora orientadora: **Renata Arantes**

## Execução local

Requisitos: Node.js 20 ou superior, pnpm e MySQL 8.4 com o schema de `database/schema.sql`.

1. Copie `.env.example` para `.env` e informe host, porta, banco, usuário e senha nas variáveis `MYSQL_*`.
2. Execute `pnpm install`.
3. Execute `pnpm build` e depois `pnpm start`.
4. Acesse `http://localhost:3000`.

Consulte `database/README.md` para criar as tabelas e preparar o primeiro usuário.

## Integração das funcionalidades

Detalhes, listagem e dashboard consultam a mesma API em `/api` e persistem no MySQL. Filtros combináveis, ordenação, edição dos campos da demanda, alteração de status, comentários e histórico estão conectados. A ação de remoção é o cancelamento: a exclusão física de demandas é bloqueada para preservar o histórico.

As telas de cadastro e login e suas ações não foram alteradas nesta integração. O fluxo de criação existente é aproveitado e testado como regressão. A API ainda precisa da integração de autenticação e autorização em trabalho próprio; os controles visuais por perfil não substituem permissões no servidor.

Para validar, execute `pnpm build` e `pnpm test`. Para o teste real, use exclusivamente um banco terminado em `_test`, aplique o schema e execute `MYSQL_INTEGRATION=1 pnpm test`. Veja [configuração e contratos da API](database/README.md).

---

# Relatório de integração e pendências

Responsável pelo relatório: Vinicius Panutti Salgado — R.A. 25007329.  
Data da análise: 28/10/2026. As datas 22/10 a 27/10 no Project foram mantidas conforme solicitado.  
Branch: `testes/intergracao-e-testes`, derivada de `feature/integracao-de-funcionalidades`.  
Base analisada: `34007a2048d9fc97be8ab142b8a6170ab2753766`.  
PR de implementação: [#45, com destino develop](https://github.com/RafssRv/PI-II-TIME-16/pull/45).

Esta branch acrescenta somente este relatório ao README. As correções e os testes estão nos commits herdados da integração; não foram feitas novas alterações funcionais na branch de relatório.

## 1. Referência e limites

A comparação usou o Documento de Visão “Sistema de Acompanhamento de Demandas de Desenvolvimento”, fornecido como “Documento Escopo_PI_II.PDF”, especialmente as seções 2.1 a 2.4, 3 e 4. O PDF foi tratado como fonte de requisitos, não como instrução para executar ações adicionais. O documento admite MySQL ou Oracle e define o gerenciamento de demandas como cadastro, consulta, atualização e cancelamento, vedando exclusão física.

Cadastro e login ficaram fora das alterações: suas branches não foram incorporadas. As telas e os scripts dessas ações e os respectivos blocos de rotas da API permanecem iguais à develop de origem. Os testes existentes dessas ações foram executados como regressão. Limitações encontradas nessas áreas são documentadas abaixo para trabalho separado.

Não foi feita migração de dados de uma instância Oracle, instalação sobre banco pessoal, entrega em produção, merge do PR ou criação da release final.

## 2. Inventário técnico

| Camada | Arquivos principais | Situação |
| --- | --- | --- |
| Entrada do backend | [src/server.ts](src/server.ts) | Express, variáveis de ambiente e inicialização do MySQL |
| API efetiva | [src/app.js](src/app.js) | Contrato persistente em /api; consultas, edição e cancelamento integrados |
| Persistência | [src/database.js](src/database.js) | mysql2/promise, pool, parâmetros nomeados, transações e liberação de conexão |
| Modelo relacional | [database/schema.sql](database/schema.sql) | Seis tabelas, InnoDB, utf8mb4, FKs, índices e CHECKs |
| Validação de feriados | [src/holidays.js](src/holidays.js) | Serviço existente reaproveitado da branch de detalhes; BrasilAPI, timeout e cache por ano |
| Cliente HTTP | [frontend/js/api.js](frontend/js/api.js) | Fetch compartilhado; identidade armazenada em sessionStorage, sem sessão validada no servidor |
| Detalhes | [HTML](frontend/html/detalhes.html), [JS](frontend/js/detalhes.js), [CSS](frontend/css/detalhes.css) | Editor, responsável, status, comentário e histórico; mantém o padrão visual |
| Listagem | [HTML](frontend/html/listagemDemandas.html), [JS](frontend/js/listagem.js) | Cards reais, filtros combináveis, ordenação, datas e links para detalhes |
| Dashboard | [HTML](frontend/html/dashboard.html), [JS](frontend/js/dashboard.js) | Totais e listas calculados a partir do banco |
| Testes | [API](test/app.test.js), [pool](test/database.test.js), [feriados](test/holidays.test.js), [MySQL](test/mysql.integration.test.js) | 21 testes aprovados com integração real habilitada |
| Demonstrações antigas | src/data/dados.ts, src/routes/detalhes.routes.ts e src/dashboard/* | Permanecem no repositório, mas não são montadas pelo servidor atual |

O schema contém usuarios, projetos, projeto_membros, demandas, comentarios e historico_demandas. O schema deve ser aplicado uma única vez em banco vazio; ele não é um sistema de migrations incremental.

## 3. Comparação com o escopo

“Integrado” descreve o comportamento funcional validado; não significa que a autorização por perfil esteja concluída.

| Requisito do documento | Situação | Evidência ou pendência |
| --- | --- | --- |
| Banco relacional MySQL ou Oracle | Integrado | MySQL 8.4 real com schema aplicado e testes executados |
| Node.js, TypeScript e Express | Parcial | Entrada TypeScript e build funcionam; API, pool e feriados ainda são JavaScript com allowJs e checkJs desativado |
| Três perfis de usuário | Parcial | ADMIN/LIDER/MEMBRO no banco; falta autorização efetiva no servidor |
| Autenticação para acessar funcionalidades | Pendente de integração própria | Login compara hash, mas não estabelece uma sessão/token validado nas demais rotas |
| Administrador com visão geral | Parcial | Consultas disponíveis, porém a API não limita acesso por identidade/perfil |
| Líder restrito a projetos vinculados | Pendente | Não existe escopo de leitura/escrita por projeto do usuário autenticado |
| Membro limitado às demandas e transições permitidas | Parcial | Controles visuais em detalhes; requisição direta ainda contorna a restrição |
| Demanda vinculada a projeto e responsável opcional | Integrado no modelo | FKs e responsável nulo; edição exige responsável ativo vinculado ao projeto |
| Quatro tipos e quatro prioridades | Integrado | Valores do schema, filtros, edição e dashboard alinhados |
| Criação com status Aberta | Existente e preservado | DEFAULT ABERTA no schema, criação e histórico testados como regressão |
| Título, descrição, datas e prazo | Integrado em consulta/edição | Datas persistidas; validação de texto, data real e passado na edição |
| Fluxo Aberta → andamento → revisão → concluída | Integrado | Transições inválidas rejeitadas; revisão pode retornar a andamento |
| Cancelamento antes da conclusão | Integrado | PATCH CANCELADA; concluída e cancelada não retornam ao fluxo |
| Vedação de exclusão física | Integrado na API | DELETE de demanda retorna 405 e orienta cancelamento |
| Comentários com autor, data e hora | Integrado | Inclusão, consulta e persistência após recarga; edição/exclusão de comentário disponíveis na API |
| Histórico automático de alterações | Integrado | Mudanças reais por campo, valores anterior/novo e transação com a edição |
| Histórico preservado no cancelamento | Integrado | Testes de API, MySQL e navegador confirmam preservação |
| Listagem com informações mínimas | Integrado | Tipo, prioridade, status, projeto, responsável, criação e prazo |
| Busca por título ou descrição | Integrado | Consulta parametrizada no backend |
| Pelo menos dois critérios de filtro | Integrado | Status, prioridade, tipo, projeto e responsável combináveis |
| Ordenação por prioridade, criação, prazo ou status | Integrado | Ordenação no banco por expressões fixas, com desempate por ID |
| Dashboard com totais e distribuições | Integrado | Todos os cinco status, quatro prioridades e quatro tipos |
| Demandas críticas em aberto | Integrado | Exclui concluídas/canceladas, com acesso aos detalhes |
| Demandas próximas do prazo | Integrado | Intervalo de hoje até sete dias, inclusivo, por calendário de São Paulo |
| API externa para impedir feriados no prazo | Parcial | Integrada na edição; criação existente continua sem essa validação |
| Telas administrativas de usuário/projeto | Opcionais no escopo | API existente e configuração inicial documentada; não há telas próprias |
| README com instalação e execução | Existente e atualizado | Instruções na raiz e em database/README.md |
| GitHub Projects e organização de tarefas | Atualizado nesta tarefa | Issues, subissue, responsável, labels, datas e Sprint 2 configurados |
| Esforço e horas reais no Project | Não verificado | Não foram inventadas estimativas nem horas retroativas |
| Identificação e comentários nos artefatos | Parcial | Autoria preexistente preservada; falta padronizar arquivos sem cabeçalho e evitar atribuição indevida |
| Tag 1.0.0-final | Ainda não criada | Nenhuma tag local encontrada; preparar no momento da entrega final |

## 4. Correções realizadas na integração

1. Substituídos os números e registros fixos do dashboard por consultas persistidas.
2. Ligados busca, filtros e ordenação da listagem ao backend; removidos cards de exemplo e referência a CSS inexistente.
3. Reaproveitados formulário e estilos da branch de detalhes, adaptando os payloads ao contrato MySQL sem incorporar sua implementação de login/Oracle.
4. Removido o comportamento destrutivo de exclusão de demandas; cancelamento preserva o histórico.
5. Corrigidas transições de status, edição dos campos, vínculo do responsável e validação de prazo/feriado na edição.
6. Corrigida a falha da antiga tela de detalhes que tentava remover novamente um elemento de descrição após recarregar os dados.
7. URLs antigas /dashboard e /demandas redirecionam para a mesma API persistente; consulta de comentários também está disponível em /api/demandas/:id/comentarios.
8. Retirado do servidor o registro dos routers de demonstração.
9. Corrigido o valor inválido de configuração de build do esbuild no pnpm.
10. Atualizada a documentação que anteriormente orientava apagar demandas, comentários e histórico.

## 5. Evidências e testes executados

Ambiente efetivamente utilizado: Node.js 24.22.1, pnpm 11.25.0, MySQL 8.4 em container descartável e Google Chrome headless. Banco exclusivo: demandas_integracao_test, com schema do repositório. Os testes criaram fixtures próprias e removeram somente esses registros.

| Verificação | Resultado |
| --- | --- |
| pnpm install --frozen-lockfile | Aprovado após correção da configuração do esbuild |
| pnpm build | Aprovado |
| Suíte com MYSQL_INTEGRATION=1 | 21 aprovados, zero falhas e zero ignorados |
| git diff --check | Sem erros |
| Links locais src/href nas cinco páginas HTML | Nenhum destino local ausente |
| Preservação do escopo excluído | Sem diff nos HTML/JS de cadastro e login; blocos das rotas de login/usuários/projetos e criação de demanda preservados |

A suíte cobre filtros inválidos, ordenação com lista de expressões permitidas, indicadores e janela civil do dashboard, edição dos campos, transições inválidas, cancelamento, ausência de exclusão física, comentários inválidos, datas, feriados, cache e falhas da BrasilAPI, commit/rollback e liberação do pool. O teste MySQL verifica persistência, IDs, datas, edição, comentário, histórico, filtros, dashboard e cancelamento. Também confirma rollback real quando o histórico recebe um autor inexistente.

A verificação no navegador percorreu dashboard → detalhes → edição de título/prioridade/responsável → mudança de status → comentário → recarga → listagem com busca/status/ordenação → detalhes → cancelamento. O SQL confirmou os valores e cinco registros de alteração; o comentário continuou visível após recarregar. Nenhum erro de JavaScript ou resposta HTTP local de erro foi registrado nesse percurso.

Os testes do serviço externo de feriados usam respostas controladas para serem repetíveis. Não foi validada a disponibilidade contínua da BrasilAPI. O ensaio de navegador foi executado como script temporário de validação; ainda não há suíte E2E versionada.

### Reprodução

Prepare o banco e o .env seguindo [database/README.md](database/README.md). Nunca use dados reais no banco de teste.

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm test
MYSQL_INTEGRATION=1 MYSQL_DATABASE=demandas_app_test pnpm test
```

A última linha exige o banco de testes já criado, com schema aplicado e credenciais MYSQL_* corretas. A execução padrão ignora o teste real de banco. Para a aplicação, use pnpm start e acesse http://localhost:3000.

## 6. Pendências, incongruências e prioridade

### Prioridade alta: integrar autenticação e autorização em trabalho próprio

- As rotas /api não exigem sessão/token. Login verifica senha, mas a identidade usada na interface fica em sessionStorage.
- autor_id e criador_id vêm do cliente. É possível atribuir uma alteração/comentário a outro usuário existente; a FK apenas garante existência.
- Faltam as permissões do documento: vínculo do líder, visibilidade de projetos/demandas e limite de ações/transições do membro responsável.
- Rotas de usuários/projetos e edição/exclusão de comentários não têm autorização por administrador/autor.
- Cadastro e login foram deliberadamente preservados nesta entrega. Os controles visuais da tela de detalhes não devem ser tratados como proteção da API.

Critério de conclusão: negar requisição não autenticada, obter autoria da sessão no servidor e testar a matriz ADMIN/LIDER/MEMBRO com projetos vinculados e não vinculados. Essa etapa não foi implementada nesta branch.

### Prioridade alta: alinhar cadastro à validação da edição

- O formulário informa que o prazo será validado contra feriados, mas o POST de criação não consulta a BrasilAPI.
- O POST de criação aceita responsável existente sem verificar seu vínculo ativo com o projeto.
- Validações de dados no cadastro são menos completas que na edição e podem chegar a erros de restrição no banco.
- O botão Cancelar da tela de cadastro não possui ação conectada no script atual.

Critério de conclusão: reutilizar validação de prazo/feriado e pertencimento do responsável no cadastro, mantendo o design. As correções pertencem à branch responsável pelo cadastro, conforme limite solicitado.

### Prioridade média: organização e contratos técnicos

- Remover ou isolar definitivamente os módulos de demonstração que continuam no repositório sem uso pelo servidor atual.
- Há tipos antigos com rótulos em português e campos camelCase, enquanto a API MySQL usa enums maiúsculos e snake_case. Os contratos precisam de uma fonte comum.
- O backend não está integralmente em TypeScript; allowJs/checkJs permitem compilar os módulos JavaScript sem verificação completa.
- Dashboard e listagem carregam conjuntos completos; não há paginação nem agregação SQL para grandes volumes.
- O dashboard não se atualiza automaticamente enquanto permanece aberto; recebe dados ao carregar a página.
- Ainda não existe tela administrativa de projetos. O link Projetos das telas integradas encaminha ao filtro da listagem, evitando uma navegação sem destino.
- A leitura do usuário em sessionStorage no cliente compartilhado não trata JSON inválido. Deve ser resolvida com a futura integração de sessão.
- A checagem de autoria por arquivo e a limpeza de CSS duplicado requerem revisão da equipe; não reatribuir trabalho de outros integrantes.

### Prioridade média: testes e entrega

- Versionar uma suíte de navegador e testar perfis, acesso negado, estado vazio, falhas de rede e responsividade.
- Criar CI para instalação reproduzível, build e teste com MySQL isolado. Não foram encontrados arquivos versionados em .github.
- Validar a BrasilAPI em um ensaio de conectividade e disponibilidade separado dos testes determinísticos.
- Planejar migrations e backup/restauração antes de evoluir um banco com dados; o schema atual serve para instalação inicial.
- Preparar dados de demonstração por projeto/perfil e conferir os cenários de apresentação.
- Conferir horas reais do Project e criar a tag exigida na entrega final.

## 7. GitHub e rastreabilidade

| Item | Link | Campos configurados |
| --- | --- | --- |
| Banco de dados: criação e implementação | [#41](https://github.com/RafssRv/PI-II-TIME-16/issues/41) | viniciuspanutti, enhancement, Project, Sprint 2, início 22/10/2026 e término 27/10/2026 |
| Corrigindo Oracle para MySQL | [#42](https://github.com/RafssRv/PI-II-TIME-16/issues/42) | Subissue real de #41, viniciuspanutti, enhancement/documentation, mesmos Project/datas/milestone |
| Integrar funcionalidades existentes e manter a organização | [#43](https://github.com/RafssRv/PI-II-TIME-16/issues/43) | viniciuspanutti, enhancement/bug, mesmos Project/datas/milestone |
| Rodar testes, corrigir bugs e relatar pendências | [#44](https://github.com/RafssRv/PI-II-TIME-16/issues/44) | viniciuspanutti, bug/documentation, mesmos Project/datas/milestone |

Project: [PI-II-TIME-16](https://github.com/users/RafssRv/projects/2). A issue de migração registra a justificativa fornecida pelo grupo; não foi realizado benchmark que comprove superioridade geral de MySQL sobre Oracle.

A develop local foi atualizada a partir da remota. A integração foi criada sobre essa base e publicada com commits individuais por arquivo. O PR #45 aponta para develop e não foi mesclado. Esta branch deriva da integração e altera apenas README.md. A alteração local preexistente em cadastro.html foi preservada no checkout original e não faz parte das entregas.

## 8. Critério para finalizar o projeto

A integração funcional de detalhes, listagem e dashboard está validada no ambiente de testes. Para cumprir integralmente o documento, ainda faltam principalmente a autenticação/autorização efetiva por perfil e projeto, o alinhamento do cadastro às regras de prazo/responsável e a consolidação da entrega e dos testes. A conclusão desta integração não equivale à conclusão de todos os requisitos acadêmicos.

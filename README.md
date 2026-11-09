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

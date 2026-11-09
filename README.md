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

---

## Como executar o backend

O backend utiliza **Node.js**, **Express** e **TypeScript**.

### Pré-requisitos
- [Node.js](https://nodejs.org/) (versão LTS)
- npm (instalado junto com o Node.js)

### Instalação das dependências
```bash
git clone https://github.com/RafssRv/PI-II-TIME-16.git
cd PI-II-TIME-16
npm install
```

### Execução do servidor
```bash
npm run dev
```
O servidor inicia em `http://localhost:3000`. Para parar, use `Ctrl+C`.

### Outros comandos
| Comando | O que faz |
|---|---|
| `npm run build` | Compila o TypeScript para a pasta `dist` |
| `npm start` | Executa a versão compilada (rode `npm run build` antes) |

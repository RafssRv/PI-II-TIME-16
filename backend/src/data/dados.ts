// Autor: Heloisa Marinho
// Dados de teste em memória.

export const TIPOS = ["Tarefa", "Defeito", "Melhoria", "Documentação"] as const;
export const PRIORIDADES = ["Crítica", "Alta", "Média", "Baixa"] as const;
export const STATUS = ["Aberta", "Em andamento", "Em revisão", "Concluída", "Cancelada"] as const;

export type Tipo = (typeof TIPOS)[number];
export type Prioridade = (typeof PRIORIDADES)[number];
export type Status = (typeof STATUS)[number];

export interface Demanda {
  id: number;
  titulo: string;
  descricao: string;
  tipo: Tipo;
  prioridade: Prioridade;
  status: Status;
  projetoId: number;
  responsavelId: number | null;
  dataCriacao: string;
  dataAtualizacao: string;
  prazo: string | null;
}

export const projetos = [
  { id: 1, nome: "App Cliente" },
  { id: 2, nome: "Painel Admin" },
  { id: 3, nome: "Backend" },
];

export const usuarios = [
  { id: 1, nome: "Sophia",   email: "sophia@exemplo.com",   senha: "123456", perfil: "Líder de Projeto" },
  { id: 2, nome: "Priscila", email: "priscila@exemplo.com", senha: "123456", perfil: "Membro da Equipe" },
  { id: 3, nome: "Panutti",  email: "panutti@exemplo.com",  senha: "123456", perfil: "Membro da Equipe" },
  { id: 4, nome: "Heloisa",  email: "heloisa@exemplo.com",  senha: "123456", perfil: "Administrador" },
];

export const demandas: Demanda[] = [
  {
    id: 1, titulo: "Corrigir erro no login com Google",
    descricao: "Usuários não conseguem entrar usando a conta Google; o login retorna erro 500.",
    tipo: "Defeito", prioridade: "Crítica", status: "Em andamento",
    projetoId: 1, responsavelId: 1,
    dataCriacao: "2026-08-07", dataAtualizacao: "2026-08-12", prazo: "2026-08-26",
  },
  {
    id: 2, titulo: "Implementar filtro por responsável",
    descricao: "Adicionar filtro por responsável na listagem de demandas do painel.",
    tipo: "Tarefa", prioridade: "Alta", status: "Em revisão",
    projetoId: 2, responsavelId: 2,
    dataCriacao: "2026-08-20", dataAtualizacao: "2026-08-24", prazo: "2026-08-27",
  },
  {
    id: 3, titulo: "Atualizar documentação da API",
    descricao: "Revisar e atualizar a documentação das rotas da API após as últimas mudanças.",
    tipo: "Documentação", prioridade: "Média", status: "Aberta",
    projetoId: 3, responsavelId: 3,
    dataCriacao: "2026-08-26", dataAtualizacao: "2026-08-26", prazo: "2026-08-28",
  },
  {
    id: 4, titulo: "Melhorar layout da tela de cadastro",
    descricao: "Reorganizar os campos do formulário de cadastro para facilitar o preenchimento.",
    tipo: "Melhoria", prioridade: "Baixa", status: "Aberta",
    projetoId: 1, responsavelId: 1,
    dataCriacao: "2026-09-02", dataAtualizacao: "2026-09-02", prazo: "2026-10-30",
  },
  {
    id: 5, titulo: "Corrigir cálculo de totais no dashboard",
    descricao: "O total de demandas no dashboard não considera as demandas canceladas.",
    tipo: "Defeito", prioridade: "Alta", status: "Aberta",
    projetoId: 2, responsavelId: 2,
    dataCriacao: "2026-09-10", dataAtualizacao: "2026-09-10", prazo: "2026-10-16",
  },
  {
    id: 6, titulo: "Criar rotas de comentários",
    descricao: "Implementar as rotas GET e POST de comentários das demandas.",
    tipo: "Tarefa", prioridade: "Média", status: "Em andamento",
    projetoId: 3, responsavelId: 3,
    dataCriacao: "2026-09-15", dataAtualizacao: "2026-09-18", prazo: "2026-10-25",
  },
  {
    id: 7, titulo: "Escrever manual do usuário",
    descricao: "Redigir o manual de uso do sistema para os usuários finais.",
    tipo: "Documentação", prioridade: "Baixa", status: "Concluída",
    projetoId: 2, responsavelId: null, // sem responsável
    dataCriacao: "2026-07-15", dataAtualizacao: "2026-08-10", prazo: "2026-08-10",
  },
  {
    id: 8, titulo: "Pesquisar biblioteca de gráficos",
    descricao: "Comparar bibliotecas de gráficos para o dashboard; pesquisa cancelada.",
    tipo: "Tarefa", prioridade: "Baixa", status: "Cancelada",
    projetoId: 2, responsavelId: 2,
    dataCriacao: "2026-08-01", dataAtualizacao: "2026-08-05", prazo: null, // sem prazo
  },
];
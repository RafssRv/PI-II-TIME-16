/*
  Autores: Priscila Amorim dos Santos, Heloisa Marinho
  Descrição: DADOS DE TESTE TEMPORÁRIOS, em memória.
*/

import { Comentario, Demanda, Projeto, Usuario, TipoDemanda, StatusDemanda } from '../types';

export const TIPOS = ['Tarefa', 'Defeito', 'Melhoria', 'Documentação'] as const;
export const PRIORIDADES = ['Crítica', 'Alta', 'Média', 'Baixa'] as const;
export const STATUS = ['Aberta', 'Em andamento', 'Em revisão', 'Concluída', 'Cancelada'] as const;

export type { Demanda, Prioridade } from '../types';
export type Tipo = TipoDemanda;
export type Status = StatusDemanda;

export const usuarios: Usuario[] = [
  { id: 1, nome: 'Ana Admin', email: 'ana@exemplo.com', senha: 'Admin@123', perfil: 'Administrador' },
  { id: 2, nome: 'Lucas Líder', email: 'lucas@exemplo.com', senha: 'Lider@123', perfil: 'Líder de Projeto' },
  { id: 3, nome: 'João Silva', email: 'joao@exemplo.com', senha: 'Membro@123', perfil: 'Membro da Equipe' },
  { id: 4, nome: 'Maria Santos', email: 'maria@exemplo.com', senha: 'Membro@123', perfil: 'Membro da Equipe' },
];

export const projetos: Projeto[] = [
  { id: 1, nome: 'Sistema de Demandas' },
  { id: 2, nome: 'App Cliente' },
  { id: 3, nome: 'Painel Admin' },
  { id: 4, nome: 'Backend' },
];

export const demandas: Demanda[] = [
  {
    id: 1,
    titulo: 'Corrigir erro no formulário de login',
    descricao: 'Ao inserir uma senha incorreta, o sistema não apresenta a mensagem de erro ao usuário.',
    tipo: 'Defeito', prioridade: 'Alta', status: 'Em andamento',
    projetoId: 1, responsavelId: 3,
    criadaEm: '2026-08-25T10:15:00.000Z', atualizadaEm: '2026-08-28T14:20:00.000Z', prazo: '2026-09-02',
  },
  {
    id: 2,
    titulo: 'Implementar filtro por responsável',
    descricao: 'Permitir filtrar a listagem de demandas pelo responsável.',
    tipo: 'Melhoria', prioridade: 'Média', status: 'Aberta',
    projetoId: 2, responsavelId: null,
    criadaEm: '2026-08-26T09:00:00.000Z', atualizadaEm: '2026-08-26T09:00:00.000Z', prazo: null,
  },
  {
    id: 3,
    titulo: 'Corrigir erro no login com Google',
    descricao: 'Usuários não conseguem entrar usando a conta Google; o login retorna erro 500.',
    tipo: 'Defeito', prioridade: 'Crítica', status: 'Em andamento',
    projetoId: 2, responsavelId: 1,
    criadaEm: '2026-08-07T00:00:00.000Z', atualizadaEm: '2026-08-12T00:00:00.000Z', prazo: '2026-08-26',
  },
  {
    id: 4,
    titulo: 'Atualizar documentação da API',
    descricao: 'Revisar e atualizar a documentação das rotas da API após as últimas mudanças.',
    tipo: 'Documentação', prioridade: 'Média', status: 'Aberta',
    projetoId: 4, responsavelId: 3,
    criadaEm: '2026-08-26T00:00:00.000Z', atualizadaEm: '2026-08-26T00:00:00.000Z', prazo: '2026-08-28',
  },
  {
    id: 5,
    titulo: 'Melhorar layout da tela de cadastro',
    descricao: 'Reorganizar os campos do formulário de cadastro para facilitar o preenchimento.',
    tipo: 'Melhoria', prioridade: 'Baixa', status: 'Aberta',
    projetoId: 2, responsavelId: 1,
    criadaEm: '2026-09-02T00:00:00.000Z', atualizadaEm: '2026-09-02T00:00:00.000Z', prazo: '2026-10-30',
  },
  {
    id: 6,
    titulo: 'Corrigir cálculo de totais no dashboard',
    descricao: 'O total de demandas no dashboard não considera as demandas canceladas.',
    tipo: 'Defeito', prioridade: 'Alta', status: 'Aberta',
    projetoId: 3, responsavelId: 2,
    criadaEm: '2026-09-10T00:00:00.000Z', atualizadaEm: '2026-09-10T00:00:00.000Z', prazo: '2026-10-16',
  },
  {
    id: 7,
    titulo: 'Criar rotas de comentários',
    descricao: 'Implementar as rotas GET e POST de comentários das demandas.',
    tipo: 'Tarefa', prioridade: 'Média', status: 'Em andamento',
    projetoId: 4, responsavelId: 3,
    criadaEm: '2026-09-15T00:00:00.000Z', atualizadaEm: '2026-09-18T00:00:00.000Z', prazo: '2026-10-25',
  },
  {
    id: 8,
    titulo: 'Escrever manual do usuário',
    descricao: 'Redigir o manual de uso do sistema para os usuários finais.',
    tipo: 'Documentação', prioridade: 'Baixa', status: 'Concluída',
    projetoId: 3, responsavelId: null, // sem responsável
    criadaEm: '2026-07-15T00:00:00.000Z', atualizadaEm: '2026-08-10T00:00:00.000Z', prazo: '2026-08-10',
  },
  {
    id: 9,
    titulo: 'Pesquisar biblioteca de gráficos',
    descricao: 'Comparar bibliotecas de gráficos para o dashboard; pesquisa cancelada.',
    tipo: 'Tarefa', prioridade: 'Baixa', status: 'Cancelada',
    projetoId: 3, responsavelId: 2,
    criadaEm: '2026-08-01T00:00:00.000Z', atualizadaEm: '2026-08-05T00:00:00.000Z', prazo: null, // sem prazo
  },
];

export const comentarios: Comentario[] = [
  {
    id: 1, demandaId: 1, usuarioId: 4,
    texto: 'O erro acontece apenas quando a senha informada está incorreta.',
    criadoEm: '2026-08-27T16:10:00.000Z',
  },
  {
    id: 2, demandaId: 1, usuarioId: 3,
    texto: 'Identifiquei o problema e estou verificando o formulário.',
    criadoEm: '2026-08-28T14:30:00.000Z',
  },
];
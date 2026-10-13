/*
  Autor: Priscila Amorim dos Santos
  Descrição: DADOS DE TESTE TEMPORÁRIOS, apenas para testar as
  rotas da tela de Detalhes.
*/

import { Comentario, Demanda, Projeto, Usuario } from '../types';

export const usuarios: Usuario[] = [
  { id: 1, nome: 'Ana Admin', email: 'ana@exemplo.com', senha: 'Admin@123', perfil: 'Administrador' },
  { id: 2, nome: 'Lucas Líder', email: 'lucas@exemplo.com', senha: 'Lider@123', perfil: 'Líder de Projeto' },
  { id: 3, nome: 'João Silva', email: 'joao@exemplo.com', senha: 'Membro@123', perfil: 'Membro da Equipe' },
  { id: 4, nome: 'Maria Santos', email: 'maria@exemplo.com', senha: 'Membro@123', perfil: 'Membro da Equipe' },
];

export const projetos: Projeto[] = [
  { id: 1, nome: 'Sistema de Demandas' },
  { id: 2, nome: 'App Cliente' },
];

export const demandas: Demanda[] = [
  {
    id: 1,
    titulo: 'Corrigir erro no formulário de login',
    descricao:
      'Ao inserir uma senha incorreta, o sistema não apresenta a mensagem de erro ao usuário.',
    tipo: 'Defeito',
    prioridade: 'Alta',
    status: 'Em andamento',
    projetoId: 1,
    responsavelId: 3,
    criadaEm: '2026-08-25T10:15:00.000Z',
    atualizadaEm: '2026-08-28T14:20:00.000Z',
    prazo: '2026-09-02',
  },
  {
    id: 2,
    titulo: 'Implementar filtro por responsável',
    descricao: 'Permitir filtrar a listagem de demandas pelo responsável.',
    tipo: 'Melhoria',
    prioridade: 'Média',
    status: 'Aberta',
    projetoId: 2,
    responsavelId: null,
    criadaEm: '2026-08-26T09:00:00.000Z',
    atualizadaEm: '2026-08-26T09:00:00.000Z',
    prazo: null,
  },
];

export const comentarios: Comentario[] = [
  {
    id: 1,
    demandaId: 1,
    usuarioId: 4,
    texto: 'O erro acontece apenas quando a senha informada está incorreta.',
    criadoEm: '2026-08-27T16:10:00.000Z',
  },
  {
    id: 2,
    demandaId: 1,
    usuarioId: 3,
    texto: 'Identifiquei o problema e estou verificando o formulário.',
    criadoEm: '2026-08-28T14:30:00.000Z',
  },
];

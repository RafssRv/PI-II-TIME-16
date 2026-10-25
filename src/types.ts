/*
  Autor: Priscila Amorim dos Santos
  Descrição: Tipos usados pelas rotas da tela de Detalhes da Demanda.
*/

export type Perfil = 'Administrador' | 'Líder de Projeto' | 'Membro da Equipe';

export type TipoDemanda = 'Tarefa' | 'Defeito' | 'Melhoria' | 'Documentação';
export type Prioridade = 'Crítica' | 'Alta' | 'Média' | 'Baixa';
export type StatusDemanda =
  | 'Aberta'
  | 'Em andamento'
  | 'Em revisão'
  | 'Concluída'
  | 'Cancelada';

export interface Usuario {
  id: number;
  nome: string;
  email: string;
  senha: string;
  perfil: Perfil;
}

export interface Projeto {
  id: number;
  nome: string;
}

export interface Demanda {
  id: number;
  titulo: string;
  descricao: string;
  tipo: TipoDemanda;
  prioridade: Prioridade;
  status: StatusDemanda;
  projetoId: number;
  responsavelId: number | null; // pode ficar em branco
  criadaEm: string; 
  atualizadaEm: string; 
  prazo: string | null; // AAAA-MM-DD
}

export interface Comentario {
  id: number;
  demandaId: number;
  usuarioId: number;
  texto: string;
  criadoEm: string;
}

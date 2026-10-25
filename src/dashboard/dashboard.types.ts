// Autor: Vinícius Panutti Salgado — Responsável pelo Dashboard
// Contratos exclusivos da demonstração; alinhar com os tipos coletivos futuramente.
export type StatusDemanda =
  | 'Aberta'
  | 'Em andamento'
  | 'Em revisão'
  | 'Concluída'
  | 'Cancelada';
export type Prioridade = 'Crítica' | 'Alta' | 'Média' | 'Baixa';
export type TipoDemanda = 'Tarefa' | 'Defeito' | 'Melhoria' | 'Documentação';

export interface DemandaDashboard {
  id: number;
  titulo: string;
  status: StatusDemanda;
  prioridade: Prioridade;
  tipo: TipoDemanda;
  prazo: string | null; // Data de calendário YYYY-MM-DD, sem horário.
}

export interface RespostaDashboard {
  totalDemandas: number;
  quantidadesPorStatus: Record<StatusDemanda, number>;
  quantidadesPorPrioridade: Record<Prioridade, number>;
  quantidadesPorTipo: Record<TipoDemanda, number>;
  demandasCriticasEmAberto: DemandaDashboard[];
  demandasProximasDoPrazo: DemandaDashboard[];
}

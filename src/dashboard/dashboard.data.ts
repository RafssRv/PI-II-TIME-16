// Autor: Vinícius Panutti Salgado — Responsável pelo Dashboard
// DADOS PROVISÓRIOS DE DEMONSTRAÇÃO DO DASHBOARD. Não são a coleção coletiva.
import { DemandaDashboard } from './dashboard.types';
import { dataEmSaoPaulo, somarDias } from './dashboard.service';

/** Recria os exemplos em memória por consulta, mantendo os prazos relativos a hoje. */
export function criarDemandasDemonstracao(agora: Date = new Date()): DemandaDashboard[] {
  const hoje = dataEmSaoPaulo(agora);
  return [
    { id: 1, titulo: '[Demo Dashboard] Crítica aberta com prazo hoje', status: 'Aberta', prioridade: 'Crítica', tipo: 'Defeito', prazo: hoje },
    { id: 2, titulo: '[Demo Dashboard] Em andamento com prazo em 3 dias', status: 'Em andamento', prioridade: 'Alta', tipo: 'Tarefa', prazo: somarDias(hoje, 3) },
    { id: 3, titulo: '[Demo Dashboard] Em revisão no limite de 7 dias', status: 'Em revisão', prioridade: 'Média', tipo: 'Melhoria', prazo: somarDias(hoje, 7) },
    { id: 4, titulo: '[Demo Dashboard] Crítica concluída com prazo hoje', status: 'Concluída', prioridade: 'Crítica', tipo: 'Defeito', prazo: hoje },
    { id: 5, titulo: '[Demo Dashboard] Crítica cancelada com prazo em 3 dias', status: 'Cancelada', prioridade: 'Crítica', tipo: 'Tarefa', prazo: somarDias(hoje, 3) },
    { id: 6, titulo: '[Demo Dashboard] Aberta com prazo vencido ontem', status: 'Aberta', prioridade: 'Baixa', tipo: 'Documentação', prazo: somarDias(hoje, -1) },
    { id: 7, titulo: '[Demo Dashboard] Aberta com prazo além de 7 dias', status: 'Aberta', prioridade: 'Alta', tipo: 'Melhoria', prazo: somarDias(hoje, 8) },
    { id: 8, titulo: '[Demo Dashboard] Aberta sem prazo', status: 'Aberta', prioridade: 'Baixa', tipo: 'Documentação', prazo: null },
  ];
}

// Autor: Vinícius Panutti Salgado — Responsável pelo Dashboard
import { DemandaDashboard, RespostaDashboard } from './dashboard.types';

/** Obtém a data civil em São Paulo, independente do fuso do servidor. */
export function dataEmSaoPaulo(agora: Date): string {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(agora);
  const valor = (tipo: string) => partes.find(parte => parte.type === tipo)!.value;
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}

/** UTC é usado apenas para aritmética de calendário, nunca para definir "hoje". */
export function somarDias(data: string, dias: number): string {
  const calendario = new Date(`${data}T00:00:00.000Z`);
  calendario.setUTCDate(calendario.getUTCDate() + dias);
  return calendario.toISOString().slice(0, 10);
}

function estaEmAberto(demanda: DemandaDashboard): boolean {
  return demanda.status !== 'Concluída' && demanda.status !== 'Cancelada';
}

export function calcularDashboard(
  demandas: readonly DemandaDashboard[],
  agora: Date = new Date(),
): RespostaDashboard {
  const hoje = dataEmSaoPaulo(agora);
  const limite = somarDias(hoje, 7);
  const resposta: RespostaDashboard = {
    totalDemandas: demandas.length,
    quantidadesPorStatus: {
      'Aberta': 0, 'Em andamento': 0, 'Em revisão': 0, 'Concluída': 0, 'Cancelada': 0,
    },
    quantidadesPorPrioridade: { 'Crítica': 0, 'Alta': 0, 'Média': 0, 'Baixa': 0 },
    quantidadesPorTipo: { 'Tarefa': 0, 'Defeito': 0, 'Melhoria': 0, 'Documentação': 0 },
    demandasCriticasEmAberto: [],
    demandasProximasDoPrazo: [],
  };

  for (const demanda of demandas) {
    resposta.quantidadesPorStatus[demanda.status] += 1;
    resposta.quantidadesPorPrioridade[demanda.prioridade] += 1;
    resposta.quantidadesPorTipo[demanda.tipo] += 1;

    if (!estaEmAberto(demanda)) continue;
    if (demanda.prioridade === 'Crítica') {
      resposta.demandasCriticasEmAberto.push(demanda);
    }
    // YYYY-MM-DD permite comparar datas civis sem converter o prazo para UTC.
    if (demanda.prazo !== null && demanda.prazo >= hoje && demanda.prazo <= limite) {
      resposta.demandasProximasDoPrazo.push(demanda);
    }
  }

  return resposta;
}

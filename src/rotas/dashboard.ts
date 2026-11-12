import { Express, Request, Response } from 'express';
import type { Database, DbConnection } from '../app';

type StatusDemanda = 'ABERTA' | 'EM_ANDAMENTO' | 'EM_REVISAO' | 'CONCLUIDA' | 'CANCELADA';
type PrioridadeDemanda = 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAIXA';
type TipoDemanda = 'TAREFA' | 'DEFEITO' | 'MELHORIA' | 'DOCUMENTACAO';

export interface DemandaDashboard {
  id: number;
  titulo: string;
  status: StatusDemanda;
  prioridade: PrioridadeDemanda;
  tipo: TipoDemanda;
  prazo: string | null;
  projeto_nome?: string;
  responsavel_nome?: string | null;
}

// Dados em memória para demonstração da Reunião 4 quando o banco não é utilizado.
export const demandasDashboardTeste: DemandaDashboard[] = [
  {
    id: 1,
    titulo: 'Corrigir falha no login',
    status: 'ABERTA',
    prioridade: 'CRITICA',
    tipo: 'DEFEITO',
    prazo: '2026-11-12',
    projeto_nome: 'Portal Acadêmico',
    responsavel_nome: 'Carla Mendes'
  },
  {
    id: 2,
    titulo: 'Criar tela de dashboard',
    status: 'EM_ANDAMENTO',
    prioridade: 'ALTA',
    tipo: 'TAREFA',
    prazo: '2026-11-15',
    projeto_nome: 'Portal Acadêmico',
    responsavel_nome: 'Ana Souza'
  },
  {
    id: 3,
    titulo: 'Revisar documentação da API',
    status: 'EM_REVISAO',
    prioridade: 'MEDIA',
    tipo: 'DOCUMENTACAO',
    prazo: '2026-11-25',
    projeto_nome: 'Portal Acadêmico',
    responsavel_nome: 'Carla Mendes'
  },
  {
    id: 4,
    titulo: 'Padronizar layout com Bootstrap',
    status: 'CONCLUIDA',
    prioridade: 'BAIXA',
    tipo: 'MELHORIA',
    prazo: '2026-11-10',
    projeto_nome: 'Portal Acadêmico',
    responsavel_nome: 'Ana Souza'
  },
  {
    id: 5,
    titulo: 'Integrar módulo antigo descontinuado',
    status: 'CANCELADA',
    prioridade: 'CRITICA',
    tipo: 'TAREFA',
    prazo: null,
    projeto_nome: 'Portal Acadêmico',
    responsavel_nome: null
  }
];

// Formata a data atual no padrão AAAA-MM-DD considerando o fuso de São Paulo.
function obterDataHoje(agora: Date): string {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(agora);

  const buscarParte = (tipo: string) => partes.find((item) => item.type === tipo)!.value;
  return `${buscarParte('year')}-${buscarParte('month')}-${buscarParte('day')}`;
}

// Soma uma quantidade de dias a uma data no formato AAAA-MM-DD.
function somarDias(dataIso: string, dias: number): string {
  const data = new Date(`${dataIso}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

// Calcula os totais, contagens e listas do dashboard usando filter, como visto em aula.
export function montarResumoDashboard(demandas: DemandaDashboard[], agora: Date = new Date()) {
  const hoje = obterDataHoje(agora);
  const limiteSeteDias = somarDias(hoje, 7);

  const quantidadesPorStatus = {
    ABERTA: demandas.filter((item) => item.status === 'ABERTA').length,
    EM_ANDAMENTO: demandas.filter((item) => item.status === 'EM_ANDAMENTO').length,
    EM_REVISAO: demandas.filter((item) => item.status === 'EM_REVISAO').length,
    CONCLUIDA: demandas.filter((item) => item.status === 'CONCLUIDA').length,
    CANCELADA: demandas.filter((item) => item.status === 'CANCELADA').length
  };

  const quantidadesPorPrioridade = {
    CRITICA: demandas.filter((item) => item.prioridade === 'CRITICA').length,
    ALTA: demandas.filter((item) => item.prioridade === 'ALTA').length,
    MEDIA: demandas.filter((item) => item.prioridade === 'MEDIA').length,
    BAIXA: demandas.filter((item) => item.prioridade === 'BAIXA').length
  };

  const quantidadesPorTipo = {
    TAREFA: demandas.filter((item) => item.tipo === 'TAREFA').length,
    DEFEITO: demandas.filter((item) => item.tipo === 'DEFEITO').length,
    MELHORIA: demandas.filter((item) => item.tipo === 'MELHORIA').length,
    DOCUMENTACAO: demandas.filter((item) => item.tipo === 'DOCUMENTACAO').length
  };

  // Critério de "em aberto": status diferente de CONCLUIDA e de CANCELADA.
  const demandasEmAberto = demandas.filter(
    (item) => item.status !== 'CONCLUIDA' && item.status !== 'CANCELADA'
  );

  // Demandas críticas que ainda estão em aberto.
  const demandasCriticasEmAberto = demandasEmAberto.filter(
    (item) => item.prioridade === 'CRITICA'
  );

  // Critério de "próximas do prazo": em aberto e com prazo entre hoje e os próximos 7 dias.
  const demandasProximasDoPrazo = demandasEmAberto.filter(
    (item) => item.prazo !== null && item.prazo >= hoje && item.prazo <= limiteSeteDias
  );

  return {
    totalDemandas: demandas.length,
    quantidadesPorStatus,
    quantidadesPorPrioridade,
    quantidadesPorTipo,
    demandasCriticasEmAberto,
    demandasProximasDoPrazo
  };
}

// Registra a rota GET /api/dashboard no aplicativo Express.
export function registrarDashboard(
  app: Express,
  database?: Database,
  obterAgora: () => Date = () => new Date()
) {
  app.get('/api/dashboard', async (req: Request, res: Response) => {
    // Modo em memória (Reunião 4): usa o array demandasDashboardTeste.
    if (!database) {
      const resumo = montarResumoDashboard(demandasDashboardTeste, obterAgora());
      return res.status(200).json(resumo);
    }

    // Modo com banco de dados (Reunião 5): consulta o banco e fecha a conexão no finally.
    let conexao: DbConnection | undefined;
    try {
      conexao = await database.connection();
      const usuario = req.authUser;
      let demandas: DemandaDashboard[];

      if (usuario.perfil === 'ADMIN') {
        demandas = await conexao.query(
          `SELECT d.*, p.nome AS projeto_nome, u.nome AS responsavel_nome
             FROM demandas d
             JOIN projetos p ON p.id = d.projeto_id
             LEFT JOIN usuarios u ON u.id = d.responsavel_id
             ORDER BY d.prazo IS NULL, d.prazo, d.id`
        );
      } else {
        demandas = await conexao.query(
          `SELECT d.*, p.nome AS projeto_nome, u.nome AS responsavel_nome
             FROM demandas d
             JOIN projetos p ON p.id = d.projeto_id
             LEFT JOIN usuarios u ON u.id = d.responsavel_id
             WHERE EXISTS (
               SELECT 1 FROM projeto_membros pm
               WHERE pm.projeto_id = d.projeto_id AND pm.usuario_id = :scope_usuario_id
             )
             ORDER BY d.prazo IS NULL, d.prazo, d.id`,
          { scope_usuario_id: usuario.id }
        );
      }

      const resumo = montarResumoDashboard(demandas, obterAgora());
      return res.status(200).json(resumo);
    } catch (erro) {
      console.error(erro);
      return res.status(500).json({ error: 'Erro ao carregar os indicadores do dashboard.' });
    } finally {
      if (conexao) await conexao.close();
    }
  });
}

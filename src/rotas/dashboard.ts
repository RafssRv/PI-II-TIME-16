/*
Autor: Vinícius Panutti Salgado - RA: 25007329
Tela: Dashboard (backend)

Descrição: 
Consulta as demandas disponíveis para o usuário e calcula os totais por status, prioridade e tipo. Separa as demandas
críticas em aberto e as próximas do prazo, considerando as datas no fuso de São Paulo, e envia o resumo para o painel
*/

import { Express, Request, Response } from 'express';
import type { Database, DbConnection } from '../app';

type StatusDemanda = 'ABERTA' | 'EM_ANDAMENTO' | 'EM_REVISAO' | 'CONCLUIDA' | 'CANCELADA';

type PrioridadeDemanda = 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAIXA';

type TipoDemanda = 'TAREFA' | 'DEFEITO' | 'MELHORIA' | 'DOCUMENTACAO';

// Define os dados usados para montar o dashboard
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

// Formata uma data no padrão ano-mês-dia considerando São Paulo
function obterDataHoje(agora: Date): string {

  // Separa os componentes da data no fuso informado
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(agora);

  // Localiza cada componente necessário na lista separada
  const buscarParte = (tipo: string) => partes.find((item) => item.type === tipo)!.value;
  return `${buscarParte('year')}-${buscarParte('month')}-${buscarParte('day')}`;
}

// Soma uma quantidade de dias a uma data no formato ano-mês-dia
function somarDias(dataIso: string, dias: number): string {

  // Cria a data em UTC para evitar mudanças causadas pelo fuso local
  const data = new Date(`${dataIso}T00:00:00Z`);

  // Avança o número de dias informado
  data.setUTCDate(data.getUTCDate() + dias);

  // Devolve somente ano-mês-dia
  return data.toISOString().slice(0, 10);
}

// Calcula totais e listas usadas pelos indicadores do painel
export function montarResumoDashboard(demandas: DemandaDashboard[], agora: Date = new Date()) {
  
  // Define o dia atual e o limite dos próximos sete dias
  const hoje = obterDataHoje(agora);
  const limiteSeteDias = somarDias(hoje, 7);

  // Conta quantas demandas existem em cada status
  const quantidadesPorStatus = {
    ABERTA: demandas.filter((item) => item.status === 'ABERTA').length,
    EM_ANDAMENTO: demandas.filter((item) => item.status === 'EM_ANDAMENTO').length,
    EM_REVISAO: demandas.filter((item) => item.status === 'EM_REVISAO').length,
    CONCLUIDA: demandas.filter((item) => item.status === 'CONCLUIDA').length,
    CANCELADA: demandas.filter((item) => item.status === 'CANCELADA').length
  };

  // Conta quantas demandas existem em cada prioridade
  const quantidadesPorPrioridade = {
    CRITICA: demandas.filter((item) => item.prioridade === 'CRITICA').length,
    ALTA: demandas.filter((item) => item.prioridade === 'ALTA').length,
    MEDIA: demandas.filter((item) => item.prioridade === 'MEDIA').length,
    BAIXA: demandas.filter((item) => item.prioridade === 'BAIXA').length
  };

  // Conta quantas demandas existem em cada tipo
  const quantidadesPorTipo = {
    TAREFA: demandas.filter((item) => item.tipo === 'TAREFA').length,
    DEFEITO: demandas.filter((item) => item.tipo === 'DEFEITO').length,
    MELHORIA: demandas.filter((item) => item.tipo === 'MELHORIA').length,
    DOCUMENTACAO: demandas.filter((item) => item.tipo === 'DOCUMENTACAO').length
  };

  // Considera em aberto todos os status diferentes de concluída e cancelada
  const demandasEmAberto = demandas.filter(
    (item) => item.status !== 'CONCLUIDA' && item.status !== 'CANCELADA'
  );

  // Filtra entre as abertas somente as demandas críticas
  const demandasCriticasEmAberto = demandasEmAberto.filter(
    (item) => item.prioridade === 'CRITICA'
  );

  // Seleciona prazos entre hoje e os próximos sete dias
  const demandasProximasDoPrazo = demandasEmAberto.filter(
    (item) => item.prazo !== null && item.prazo >= hoje && item.prazo <= limiteSeteDias
  );

  // Devolve os totais e as listas que serão enviados pela API
  return {
    totalDemandas: demandas.length,
    quantidadesPorStatus,
    quantidadesPorPrioridade,
    quantidadesPorTipo,
    demandasCriticasEmAberto,
    demandasProximasDoPrazo
  };
}

// Registra a rota que devolve os indicadores do dashboard
export function registrarDashboard(
  app: Express,
  database: Database,

  // Permite controlar a data atual durante testes
  obterAgora: () => Date = () => new Date()
) {

  // Responde às solicitações enviadas ao dashboard
  app.get('/api/dashboard', async (req: Request, res: Response) => {

    // Reserva a conexão usada pela consulta
    let conexao: DbConnection | undefined;
    try {
      // Abre uma conexão com o banco
      conexao = await database.connection();

      // Obtém os dados da pessoa autenticada
      const usuario = req.authUser;

      // Reserva a lista de demandas que será consultada
      let demandas: DemandaDashboard[];

      // Administradores recebem demandas de todos os projetos
      if (usuario.perfil === 'ADMIN') {
        demandas = await conexao.query(
          `SELECT d.*, p.nome AS projeto_nome, u.nome AS responsavel_nome
             FROM demandas d
             JOIN projetos p ON p.id = d.projeto_id
             LEFT JOIN usuarios u ON u.id = d.responsavel_id
             ORDER BY d.prazo IS NULL, d.prazo, d.id`
        );
      } else {
        // Outros perfis recebem demandas dos projetos em que participam
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

      // Calcula os indicadores usando as demandas encontradas
      const resumo = montarResumoDashboard(demandas, obterAgora());

      // Devolve o resumo em formato JSON
      return res.status(200).json(resumo);
    } catch (erro) {

      // Registra o erro no servidor
      console.error(erro);

      // Informa que não foi possível carregar o painel
      return res.status(500).json({ error: 'Erro ao carregar os indicadores do dashboard.' });
    } finally {
      // Fecha a conexão mesmo se ocorrer um erro
      if (conexao) await conexao.close();
    }
  });
}

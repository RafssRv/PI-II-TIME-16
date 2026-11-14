/*
  Autor: Priscila Amorim
  Descrição: Popula um banco VAZIO com dados de demonstração: um usuário de cada
  perfil (ADMIN, LIDER, MEMBRO), dois projetos com equipes e demandas em todos os
  status, com histórico e comentários. Uso: `npm run seed`.

  Segurança: o script se recusa a rodar se já existir qualquer usuário, para nunca
  misturar dados de demonstração com dados reais. A senha é só para demonstração
  local; troque-a com a variável SEED_SENHA se quiser (mínimo de 10 caracteres,
  a mesma regra da API).
*/

import 'dotenv/config';
import bcrypt from 'bcryptjs';

import { createMysqlDatabase } from './database';

// Senha padrão de demonstração (pode ser sobrescrita pelo ambiente).
const SENHA = process.env.SEED_SENHA || 'demo-pi2-2026';

type Perfil = 'ADMIN' | 'LIDER' | 'MEMBRO';

// Usuários de demonstração: um ADMIN, dois líderes (um por projeto) e três membros.
// O membro "Diego" participa dos dois projetos para exercitar o escopo por vínculo.
const USUARIOS: { chave: string; nome: string; email: string; perfil: Perfil }[] = [
  { chave: 'admin', nome: 'Administrador Geral', email: 'admin@local.test', perfil: 'ADMIN' },
  { chave: 'ana', nome: 'Ana Souza', email: 'ana.lider@local.test', perfil: 'LIDER' },
  { chave: 'bruno', nome: 'Bruno Lima', email: 'bruno.lider@local.test', perfil: 'LIDER' },
  { chave: 'carla', nome: 'Carla Mendes', email: 'carla.membro@local.test', perfil: 'MEMBRO' },
  { chave: 'diego', nome: 'Diego Alves', email: 'diego.membro@local.test', perfil: 'MEMBRO' },
  { chave: 'elisa', nome: 'Elisa Rocha', email: 'elisa.membro@local.test', perfil: 'MEMBRO' }
];

// Projetos e suas equipes (o ADMIN enxerga tudo, por isso não precisa de vínculo).
const PROJETOS = [
  {
    chave: 'vendas', nome: 'Sistema de Vendas',
    descricao: 'Plataforma de pedidos, estoque e emissão de notas fiscais da loja.',
    lider: 'ana', membros: ['ana', 'carla', 'diego']
  },
  {
    chave: 'portal', nome: 'Portal do Aluno',
    descricao: 'Portal web para consulta de notas, frequência e comunicados.',
    lider: 'bruno', membros: ['bruno', 'elisa', 'diego']
  }
];

type Status = 'ABERTA' | 'EM_ANDAMENTO' | 'EM_REVISAO' | 'CONCLUIDA' | 'CANCELADA';

// Declara cada campo do objeto com interface
interface CaminhosStatus {
  ABERTA: Status[];
  EM_ANDAMENTO: Status[];
  EM_REVISAO: Status[];
  CONCLUIDA: Status[];
  CANCELADA: Status[];
}

// Caminho percorrido por cada status a partir de ABERTA, respeitando o ciclo de vida.
const CAMINHO: CaminhosStatus = {
  ABERTA: [],
  EM_ANDAMENTO: ['EM_ANDAMENTO'],
  EM_REVISAO: ['EM_ANDAMENTO', 'EM_REVISAO'],
  CONCLUIDA: ['EM_ANDAMENTO', 'EM_REVISAO', 'CONCLUIDA'],
  CANCELADA: ['EM_ANDAMENTO', 'CANCELADA']
};

// Guarda a chave do dado de demonstração junto ao identificador gerado pelo banco.
interface IdentificadorCadastrado {
  chave: string;
  id: number;
}

function buscarId(cadastrados: IdentificadorCadastrado[], chave: string): number {
  const registro = cadastrados.find((item) => item.chave === chave);
  if (!registro) {
    throw new Error(`Identificador não encontrado para a chave: ${chave}.`);
  }
  return registro.id;
}

// "dias" é relativo a hoje (null = sem prazo), para o dashboard sempre ter
// demandas "próximas do prazo" mesmo que o seed seja executado em outra data.
const DEMANDAS: {
  projeto: string; titulo: string; descricao: string; tipo: string; prioridade: string;
  status: Status; responsavel: string | null; dias: number | null;
  comentarios?: [string, string][];
}[] = [
  {
    projeto: 'vendas', titulo: 'Corrigir cálculo de desconto no carrinho',
    descricao: 'O desconto de cupom está sendo aplicado duas vezes quando o pedido tem frete grátis.',
    tipo: 'DEFEITO', prioridade: 'CRITICA', status: 'EM_ANDAMENTO', responsavel: 'carla', dias: 2,
    comentarios: [['carla', 'Reproduzi o erro com cupom de 10% e frete grátis; investigando o serviço de preços.']]
  },
  {
    projeto: 'vendas', titulo: 'Implementar cadastro de clientes',
    descricao: 'Criar formulário e endpoints para cadastrar, consultar e atualizar clientes da loja.',
    tipo: 'TAREFA', prioridade: 'ALTA', status: 'ABERTA', responsavel: 'diego', dias: 9
  },
  {
    projeto: 'vendas', titulo: 'Melhorar tempo de resposta da busca de produtos',
    descricao: 'A busca por nome leva mais de dois segundos; adicionar índice e revisar a consulta.',
    tipo: 'MELHORIA', prioridade: 'MEDIA', status: 'EM_REVISAO', responsavel: 'diego', dias: 5,
    comentarios: [['diego', 'Índice criado; o tempo caiu para cerca de 300 ms. Aguardando revisão.']]
  },
  {
    projeto: 'vendas', titulo: 'Documentar a API de pedidos',
    descricao: 'Descrever rotas, parâmetros e exemplos de resposta da API de pedidos no README.',
    tipo: 'DOCUMENTACAO', prioridade: 'BAIXA', status: 'CONCLUIDA', responsavel: 'carla', dias: -2
  },
  {
    projeto: 'vendas', titulo: 'Erro ao emitir nota fiscal em pedidos com cupom',
    descricao: 'A nota fiscal falha com erro 500 quando o pedido possui cupom de desconto aplicado.',
    tipo: 'DEFEITO', prioridade: 'CRITICA', status: 'ABERTA', responsavel: null, dias: 4
  },
  {
    projeto: 'vendas', titulo: 'Integração com gateway de pagamento antigo',
    descricao: 'Integrar o gateway legado; cancelada porque o fornecedor foi descontinuado.',
    tipo: 'TAREFA', prioridade: 'MEDIA', status: 'CANCELADA', responsavel: null, dias: null,
    comentarios: [['ana', 'Cancelada: o fornecedor encerrou o serviço, vamos usar o gateway novo.']]
  },
  {
    projeto: 'portal', titulo: 'Tela de boletim com notas por disciplina',
    descricao: 'Exibir as notas do aluno agrupadas por disciplina e período, com a média parcial.',
    tipo: 'TAREFA', prioridade: 'ALTA', status: 'EM_ANDAMENTO', responsavel: 'elisa', dias: 6
  },
  {
    projeto: 'portal', titulo: 'Falha no login com e-mails em maiúsculas',
    descricao: 'Alunos que digitam o e-mail com letras maiúsculas não conseguem entrar no portal.',
    tipo: 'DEFEITO', prioridade: 'CRITICA', status: 'EM_REVISAO', responsavel: 'diego', dias: 1,
    comentarios: [
      ['diego', 'Corrigido normalizando o e-mail antes da consulta. Pronto para revisão.'],
      ['bruno', 'Vou revisar hoje; precisa entrar antes da sprint review.']
    ]
  },
  {
    projeto: 'portal', titulo: 'Adicionar modo escuro ao portal',
    descricao: 'Oferecer tema escuro nas telas principais, respeitando a preferência do sistema.',
    tipo: 'MELHORIA', prioridade: 'BAIXA', status: 'ABERTA', responsavel: 'elisa', dias: null
  },
  {
    projeto: 'portal', titulo: 'Guia de uso para novos alunos',
    descricao: 'Escrever um guia curto explicando como acessar notas, frequência e comunicados.',
    tipo: 'DOCUMENTACAO', prioridade: 'MEDIA', status: 'ABERTA', responsavel: null, dias: 14
  }
];

// Data civil de hoje em São Paulo (mesma regra usada pelo dashboard).
function hojeCivil(): Date {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)!.value;
  return new Date(`${valor('year')}-${valor('month')}-${valor('day')}T00:00:00Z`);
}

// Soma dias à data de hoje e devolve AAAA-MM-DD (ou null quando não há prazo).
function prazoRelativo(dias: number | null): string | null {
  if (dias === null) return null;
  const data = hojeCivil();
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

async function main() {
  const database = createMysqlDatabase();
  const c = await database.connection();
  try {
    // Trava de segurança: só popula um banco sem nenhum usuário.
    const existentes = await c.query('SELECT COUNT(*) AS total FROM usuarios');
    if (Number(existentes[0]?.total || 0) !== 0) {
      throw new Error('O banco já possui usuários. O seed só roda em banco vazio; nada foi alterado.');
    }
    if (SENHA.length < 10) throw new Error('SEED_SENHA precisa ter pelo menos 10 caracteres.');
    if (bcrypt.truncates(SENHA)) throw new Error('SEED_SENHA deve ter até 72 bytes em UTF-8.');

    // Todos os usuários de demonstração compartilham a mesma senha (e o mesmo hash).
    const senhaHash = await bcrypt.hash(SENHA, 12);

    const usuariosCadastrados: IdentificadorCadastrado[] = [];
    for (const u of USUARIOS) {
      const r = await c.execute(
        'INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES (:nome, :email, :senha_hash, :perfil)',
        { nome: u.nome, email: u.email, senha_hash: senhaHash, perfil: u.perfil }
      );
      usuariosCadastrados.push({ chave: u.chave, id: r.insertId });
    }

    const projetosCadastrados: IdentificadorCadastrado[] = [];
    for (const p of PROJETOS) {
      const r = await c.execute(
        'INSERT INTO projetos (nome, descricao) VALUES (:nome, :descricao)',
        { nome: p.nome, descricao: p.descricao }
      );
      projetosCadastrados.push({ chave: p.chave, id: r.insertId });
      for (const membro of p.membros) {
        await c.execute(
          'INSERT INTO projeto_membros (projeto_id, usuario_id) VALUES (:projeto_id, :usuario_id)',
          { projeto_id: r.insertId, usuario_id: buscarId(usuariosCadastrados, membro) }
        );
      }
    }

    for (const d of DEMANDAS) {
      const projeto = PROJETOS.find((p) => p.chave === d.projeto)!;
      const criador = buscarId(usuariosCadastrados, projeto.lider);
      const responsavel = d.responsavel ? buscarId(usuariosCadastrados, d.responsavel) : null;
      // A demanda nasce ABERTA (regra do documento) e o status final é aplicado pelo
      // caminho abaixo, gerando o histórico como a API faria.
      const r = await c.execute(
        `INSERT INTO demandas (projeto_id, criador_id, responsavel_id, titulo, descricao, tipo, prioridade, prazo)
         VALUES (:projeto_id, :criador_id, :responsavel_id, :titulo, :descricao, :tipo, :prioridade, :prazo)`,
        {
          projeto_id: buscarId(projetosCadastrados, d.projeto), criador_id: criador, responsavel_id: responsavel,
          titulo: d.titulo, descricao: d.descricao, tipo: d.tipo, prioridade: d.prioridade,
          prazo: prazoRelativo(d.dias)
        }
      );
      const demandaId = r.insertId;

      await c.execute(
        "INSERT INTO historico_demandas (demanda_id, autor_id, acao, valor_novo) VALUES (:id, :autor, 'CRIACAO', :titulo)",
        { id: demandaId, autor: criador, titulo: d.titulo }
      );

      let anterior: Status = 'ABERTA';
      for (const proximo of CAMINHO[d.status]) {
        // Quem executa o andamento é o responsável; concluir/cancelar é do líder.
        const lider = ['CONCLUIDA', 'CANCELADA'].includes(proximo);
        const autor = lider || !responsavel ? criador : responsavel;
        await c.execute(
          `INSERT INTO historico_demandas (demanda_id, autor_id, acao, campo, valor_anterior, valor_novo)
           VALUES (:id, :autor, 'ALTERACAO', 'status', :anterior, :novo)`,
          { id: demandaId, autor, anterior, novo: proximo }
        );
        anterior = proximo;
      }
      if (d.status !== 'ABERTA') {
        await c.execute('UPDATE demandas SET status = :status WHERE id = :id', { status: d.status, id: demandaId });
      }

      for (const [quem, texto] of d.comentarios || []) {
        await c.execute(
          'INSERT INTO comentarios (demanda_id, autor_id, texto) VALUES (:demanda_id, :autor_id, :texto)',
          { demanda_id: demandaId, autor_id: buscarId(usuariosCadastrados, quem), texto }
        );
      }
    }

    await c.commit();

    console.log('Seed concluído. Usuários de demonstração (senha única para todos):\n');
    console.table(USUARIOS.map((u) => ({ perfil: u.perfil, nome: u.nome, email: u.email })));
    console.log(`Senha: ${SENHA}`);
    console.log(`${PROJETOS.length} projetos e ${DEMANDAS.length} demandas criados.`);
  } catch (error) {
    await c.rollback();
    throw error;
  } finally {
    await c.close();
    await database.close();
  }
}

main().catch((error) => {
  console.error(`Falha no seed: ${error.message}`);
  process.exit(1);
});

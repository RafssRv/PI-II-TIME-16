/*
Autora: Priscila Amorim dos Santos - RA: 24787350
Tela: Uso geral do sistema (dados de demonstração)

Descrição: 
Preenche o banco com usuários de diferentes perfis, projetos, equipes e demandas para demonstração. Também cria
comentários e históricos de alterações. A execução é interrompida caso já existam usuários cadastrados no banco
*/

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { createMysqlDatabase } from './database';

// Usa a senha configurada no ambiente ou uma senha padrão
const SENHA = process.env.SEED_SENHA || 'demo-pi2-2026';

// Lista os perfis disponíveis no sistema
type Perfil = 'ADMIN' | 'LIDER' | 'MEMBRO';

// Define os usuários que serão cadastrados para demonstração
const USUARIOS: { chave: string; nome: string; email: string; perfil: Perfil }[] = [
  { chave: 'admin', nome: 'Administrador Geral', email: 'admin@local.test', perfil: 'ADMIN' },
  { chave: 'ana', nome: 'Ana Souza', email: 'ana.lider@local.test', perfil: 'LIDER' },
  { chave: 'bruno', nome: 'Bruno Lima', email: 'bruno.lider@local.test', perfil: 'LIDER' },
  { chave: 'carla', nome: 'Carla Mendes', email: 'carla.membro@local.test', perfil: 'MEMBRO' },
  { chave: 'diego', nome: 'Diego Alves', email: 'diego.membro@local.test', perfil: 'MEMBRO' },
  { chave: 'elisa', nome: 'Elisa Rocha', email: 'elisa.membro@local.test', perfil: 'MEMBRO' }
];

// Define os projetos e os membros que farão parte de cada equipe
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

// Define o caminho de status permitido para cada situação
interface CaminhosStatus {
  ABERTA: Status[];
  EM_ANDAMENTO: Status[];
  EM_REVISAO: Status[];
  CONCLUIDA: Status[];
  CANCELADA: Status[];
}

// Guarda os passos necessários para chegar ao status final de cada demanda
const CAMINHO: CaminhosStatus = {
  ABERTA: [],
  EM_ANDAMENTO: ['EM_ANDAMENTO'],
  EM_REVISAO: ['EM_ANDAMENTO', 'EM_REVISAO'],
  CONCLUIDA: ['EM_ANDAMENTO', 'EM_REVISAO', 'CONCLUIDA'],
  CANCELADA: ['EM_ANDAMENTO', 'CANCELADA']
};

// Associa uma chave de demonstração ao identificador criado no banco
interface IdentificadorCadastrado {
  chave: string;
  id: number;
}

// Localiza o identificador correspondente a uma chave cadastrada
function buscarId(cadastrados: IdentificadorCadastrado[], chave: string): number {

  // Procura o registro pela chave
  const registro = cadastrados.find((item) => item.chave === chave);

  // Interrompe a carga se a chave não tiver sido cadastrada
  if (!registro) {
    throw new Error(`Identificador não encontrado para a chave: ${chave}.`);
  }
  return registro.id;
}

// Define as demandas de demonstração e seus prazos relativos ao dia atual
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

// Obtém a data atual no fuso horário de São Paulo
function hojeCivil(): Date {

  // Separa ano, mês e dia da data atual
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)!.value;

  // Cria uma data UTC usando os componentes locais do dia
  return new Date(`${valor('year')}-${valor('month')}-${valor('day')}T00:00:00Z`);
}

// Calcula um prazo relativo ao dia atual
function prazoRelativo(dias: number | null): string | null {

  // Mantém o prazo vazio quando não existir número de dias
  if (dias === null) return null;

  // Obtém hoje e avança o número de dias informado
  const data = hojeCivil();
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

async function main() {
  // Cria o objeto usado para conectar e fechar o banco
  const database = createMysqlDatabase();

  // Abre uma conexão e inicia uma transação
  const c = await database.connection();
  try {

    // Confere se o banco já possui algum usuário
    const existentes = await c.query('SELECT COUNT(*) AS total FROM usuarios');

    // Interrompe o seed em um banco que já tenha dados
    if (Number(existentes[0]?.total || 0) !== 0) {
      throw new Error('O banco já possui usuários. O seed só roda em banco vazio; nada foi alterado.');
    }

    // Exige uma senha mínima para os dados de demonstração
    if (SENHA.length < 10) throw new Error('SEED_SENHA precisa ter pelo menos 10 caracteres.');
    
    // Rejeita uma senha maior que o limite aceito pelo bcrypt
    if (bcrypt.truncates(SENHA)) throw new Error('SEED_SENHA deve ter até 72 bytes em UTF-8.');

    // Protege uma única senha e reutiliza o hash entre os usuários
    const senhaHash = await bcrypt.hash(SENHA, 12);

    // Guarda os identificadores dos usuários criados
    const usuariosCadastrados: IdentificadorCadastrado[] = [];

    for (const u of USUARIOS) {
      // Insere o usuário e guarda o identificador criado pelo banco
      const r = await c.execute(
        'INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES (:nome, :email, :senha_hash, :perfil)',
        { nome: u.nome, email: u.email, senha_hash: senhaHash, perfil: u.perfil }
      );
      usuariosCadastrados.push({ chave: u.chave, id: r.insertId });
    }

    // Guarda os identificadores dos projetos criados
    const projetosCadastrados: IdentificadorCadastrado[] = [];

    for (const p of PROJETOS) {
      // Insere o projeto e guarda o identificador criado
      const r = await c.execute(
        'INSERT INTO projetos (nome, descricao) VALUES (:nome, :descricao)',
        { nome: p.nome, descricao: p.descricao }
      );
      projetosCadastrados.push({ chave: p.chave, id: r.insertId });

      // Vincula cada membro à equipe do projeto
      for (const membro of p.membros) {
        await c.execute(
          'INSERT INTO projeto_membros (projeto_id, usuario_id) VALUES (:projeto_id, :usuario_id)',
          { projeto_id: r.insertId, usuario_id: buscarId(usuariosCadastrados, membro) }
        );
      }
    }

    for (const d of DEMANDAS) {
      // Localiza o projeto e o líder associados à demanda
      const projeto = PROJETOS.find((p) => p.chave === d.projeto)!;
      const criador = buscarId(usuariosCadastrados, projeto.lider);

      // Usa vazio quando a demanda não possui responsável
      const responsavel = d.responsavel ? buscarId(usuariosCadastrados, d.responsavel) : null;
      
      // Insere toda demanda começando no status aberta
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

      // Registra a criação no histórico da demanda
      await c.execute(
        "INSERT INTO historico_demandas (demanda_id, autor_id, acao, valor_novo) VALUES (:id, :autor, 'CRIACAO', :titulo)",
        { id: demandaId, autor: criador, titulo: d.titulo }
      );

      // Percorre a sequência de status até chegar ao estado final
      let anterior: Status = 'ABERTA';

      for (const proximo of CAMINHO[d.status]) {
        // Liderança autoriza conclusão ou cancelamento
        const lider = ['CONCLUIDA', 'CANCELADA'].includes(proximo);

        // Responsável registra avanço e líder registra ações especiais
        const autor = lider || !responsavel ? criador : responsavel;

        // Insere no histórico a mudança entre dois status
        await c.execute(
          `INSERT INTO historico_demandas (demanda_id, autor_id, acao, campo, valor_anterior, valor_novo)
           VALUES (:id, :autor, 'ALTERACAO', 'status', :anterior, :novo)`,
          { id: demandaId, autor, anterior, novo: proximo }
        );
        anterior = proximo;
      }
      
      // Atualiza o campo status para o estado final configurado
      if (d.status !== 'ABERTA') {
        await c.execute('UPDATE demandas SET status = :status WHERE id = :id', { status: d.status, id: demandaId });
      }

      // Insere cada comentário usando o usuário indicado
      for (const [quem, texto] of d.comentarios || []) {
        await c.execute(
          'INSERT INTO comentarios (demanda_id, autor_id, texto) VALUES (:demanda_id, :autor_id, :texto)',
          { demanda_id: demandaId, autor_id: buscarId(usuariosCadastrados, quem), texto }
        );
      }
    }

    // Confirma todas as inserções em uma única transação
    await c.commit();

    // Apresenta no terminal os usuários disponíveis para demonstração
    console.log('Seed concluído. Usuários de demonstração (senha única para todos):\n');
    console.table(USUARIOS.map((u) => ({ perfil: u.perfil, nome: u.nome, email: u.email })));
    console.log(`Senha: ${SENHA}`);
    console.log(`${PROJETOS.length} projetos e ${DEMANDAS.length} demandas criados.`);
  } catch (error) {
    // Cancela todas as inserções caso alguma etapa falhe
    await c.rollback();
    throw error;
  } finally {
    // Fecha a conexão da transação e encerra o pool do banco
    await c.close();
    await database.close();
  }
}

// Inicia o processo e mostra uma falha clara no terminal
main().catch((error) => {
  console.error(`Falha no seed: ${error.message}`);
  process.exit(1);
});

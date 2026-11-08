// Autor: Heloisa Marinho
// Descrição: Rota GET com listagem, filtros, busca e ordenação.
// Os valores aceitos são os mesmos dos selects da tela do HTML.

import { Router } from "express";
import { demandas, projetos, usuarios, TIPOS, PRIORIDADES, STATUS } from "../data/listagem.data";
import type { Status } from "../data/listagem.data";

const router = Router();

// Remove acentos, espaços e maiúsculas
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

// Devolve o texto do parâmetro da URL, ou undefined se estiver ausente/vazio
function lerTexto(valor: unknown): string | undefined {
  return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : undefined;
}

// Descobre qual item da lista o texto representa.
// Retorna "todos" (sem filtro), o item encontrado, ou null se for inválido.
function resolverValor<T extends string>(
  entrada: string,
  lista: readonly T[],
  apelidos: Record<string, T> = {}
): T | "todos" | null {
  const n = normalizar(entrada);
  if (n === "todos" || n === "todas") return "todos";
  if (apelidos[n]) return apelidos[n];
  return lista.find(item => normalizar(item) === n) ?? null;
}

// Valores do select de status do HTML que diferem do nome completo
const APELIDOS_STATUS: Record<string, Status> = {
  andamento: "Em andamento",
  revisao: "Em revisão",
};

// Peso da prioridade: 1 = mais importante
const pesoPrioridade: Record<string, number> = { Crítica: 1, Alta: 2, Média: 3, Baixa: 4 };

// Opções do select
type CampoOrdenacao = "dataCriacao" | "prazo" | "prioridade" | "status";
const ORDENACOES: Record<string, { campo: CampoOrdenacao; fator: 1 | -1 }> = {
  criacao_desc:    { campo: "dataCriacao", fator: -1 }, // mais recentes primeiro
  prazo_asc:       { campo: "prazo",       fator: 1 },  // prazo mais próximo primeiro
  prioridade_desc: { campo: "prioridade",  fator: 1 },  // Crítica primeiro
  status:          { campo: "status",      fator: 1 },  // ordem do ciclo de vida
};

// rota get
router.get("/listagem", (req, res) => {
  const erros: string[] = [];

  // Lê filtro de lista fixa (status, prioridade, tipo) e registra erro se for inválido
  function lerFiltro<T extends string>(
    param: unknown,
    lista: readonly T[],
    nome: string,
    apelidos: Record<string, T> = {}
  ): T | undefined {
    const texto = lerTexto(param);
    if (!texto) return undefined;
    const resolvido = resolverValor(texto, lista, apelidos);
    if (resolvido === null) {
      erros.push(`${nome} inválido: "${texto}". Use: ${lista.join(", ")} ou todos.`);
      return undefined;
    }
    return resolvido === "todos" ? undefined : resolvido;
  }

  // Lê filtro numérico (id de responsável ou de projeto)
  function lerNumero(param: unknown, nome: string): number | undefined {
    const texto = lerTexto(param);
    if (!texto) return undefined;
    const numero = Number(texto);
    if (!Number.isInteger(numero)) {
      erros.push(`${nome} deve ser um número inteiro (id).`);
      return undefined;
    }
    return numero;
  }

  const status = lerFiltro(req.query.status, STATUS, "Status", APELIDOS_STATUS);
  const prioridade = lerFiltro(req.query.prioridade, PRIORIDADES, "Prioridade");
  const tipo = lerFiltro(req.query.tipo, TIPOS, "Tipo");
  const responsavelId = lerNumero(req.query.responsavel, "Responsável");
  const projetoId = lerNumero(req.query.projeto, "Projeto");
  const busca = lerTexto(req.query.busca);

  // Ordenação (padrão: data de criação, mais recentes primeiro)
  let config = ORDENACOES.criacao_desc;
  const ordenacao = lerTexto(req.query.ordenacao);
  if (ordenacao) {
    if (Object.prototype.hasOwnProperty.call(ORDENACOES, ordenacao)) {
      config = ORDENACOES[ordenacao];
    } else {
      erros.push(`Ordenação inválida: "${ordenacao}". Use: ${Object.keys(ORDENACOES).join(", ")}.`);
    }
  }

  // Se algum parâmetro estiver inválido, responde 400 com mensagem clara
  if (erros.length > 0) {
    res.status(400).json({ erro: erros.join(" ") });
    return;
  }

  // FILTROS
  let resultado = [...demandas];
  if (status)                      resultado = resultado.filter(d => d.status === status);
  if (prioridade)                  resultado = resultado.filter(d => d.prioridade === prioridade);
  if (tipo)                        resultado = resultado.filter(d => d.tipo === tipo);
  if (responsavelId !== undefined) resultado = resultado.filter(d => d.responsavelId === responsavelId);
  if (projetoId !== undefined)     resultado = resultado.filter(d => d.projetoId === projetoId);

  // BUSCA
  if (busca) {
    const termo = busca.toLowerCase();
    resultado = resultado.filter(d =>
      d.titulo.toLowerCase().includes(termo) ||
      d.descricao.toLowerCase().includes(termo)
    );
  }

  // ORDENAÇÃO
  resultado.sort((a, b) => {
    let comparacao = 0;

    if (config.campo === "prioridade") {
      comparacao = pesoPrioridade[a.prioridade] - pesoPrioridade[b.prioridade];
    } else if (config.campo === "status") {
      comparacao = STATUS.indexOf(a.status) - STATUS.indexOf(b.status);
    } else if (config.campo === "prazo") {
      // Demandas sem prazo vão sempre para o final
      if (!a.prazo && !b.prazo) return 0;
      if (!a.prazo) return 1;
      if (!b.prazo) return -1;
      comparacao = a.prazo.localeCompare(b.prazo);
    } else {
      comparacao = a.dataCriacao.localeCompare(b.dataCriacao);
    }

    return comparacao * config.fator;
  });

  // RESPOSTA
  const lista = resultado.map(d => ({
    id: d.id,
    titulo: d.titulo,
    tipo: d.tipo,
    prioridade: d.prioridade,
    status: d.status,
    projeto: projetos.find(p => p.id === d.projetoId)?.nome ?? null,
    responsavel: usuarios.find(u => u.id === d.responsavelId)?.nome ?? null,
    dataCriacao: d.dataCriacao,
    prazo: d.prazo,
  }));

  res.status(200).json(lista);
});

export default router;

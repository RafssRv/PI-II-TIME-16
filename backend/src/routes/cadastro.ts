/*
Autor: Rafael Roveri Pires
RA: 24007131
Descrição: Rotas de cadastro de demandas e listagem de projetos.
*/

import { Router } from "express";

import {
  projetos,
  demandas,
  usuarios,
  TIPOS,
  PRIORIDADES
} from "../data/dados.js";

import type {
  Demanda,
  Tipo,
  Prioridade
} from "../data/dados.js";

const router = Router();

// Retorna todos os projetos cadastrados
router.get("/projetos", (req, res) => {
  return res.status(200).json(projetos);
});


// POST /demandas - Recebe os dados de uma nova demanda
router.post("/demandas", (req, res) => {

  const {
    titulo,
    descricao,
    tipo,
    prioridade,
    projetoId,
    responsavelId,
    prazo
  } = req.body ?? {};

  // Verifica se título e descrição foram preenchidos
    if (
    typeof titulo !== "string" || !titulo.trim() ||
    typeof descricao !== "string" || !descricao.trim()
    ) {
    return res.status(400).json({
        erro: "Título e descrição são obrigatórios."
    });
    }

    // Verifica se o tipo é permitido
    if (!TIPOS.includes(tipo as Tipo)) {
    return res.status(400).json({
        erro: "Tipo inválido. Use: Tarefa, Defeito, Melhoria ou Documentação."
    });
    }

    // Verifica se a prioridade é permitida
    if (!PRIORIDADES.includes(prioridade as Prioridade)) {
    return res.status(400).json({
        erro: "Prioridade inválida. Use: Crítica, Alta, Média ou Baixa."
    });
    }
    // Verifica se o projeto informado existe
    if (
    !Number.isInteger(projetoId) ||
    !projetos.some(p => p.id === projetoId)
    ) {
    return res.status(400).json({
        erro: "Projeto inválido ou inexistente."
    });
    }

    // Verifica se o responsável existe, caso informado
    if (
    responsavelId !== undefined &&
    responsavelId !== null &&
    responsavelId !== ""
    ) {
    if (
        !Number.isInteger(responsavelId) ||
        !usuarios.some(u => u.id === responsavelId)
    ) {
        return res.status(400).json({
        erro: "Responsável inválido ou inexistente."
        });
    }
    }
    // Valida o prazo, caso tenha sido informado
    if (prazo !== undefined && prazo !== null && prazo !== "") {

    // Verifica o formato AAAA-MM-DD
    if (
        typeof prazo !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(prazo)
    ) {
        return res.status(400).json({
        erro: "Prazo inválido. Use o formato AAAA-MM-DD."
        });
    }

    // Verifica se a data realmente existe
    const data = new Date(`${prazo}T00:00:00Z`);

    if (
        Number.isNaN(data.getTime()) ||
        data.toISOString().slice(0, 10) !== prazo
    ) {
        return res.status(400).json({
        erro: "O prazo informado não é uma data válida."
        });
    }
    }
  console.log("Dados recebidos:", req.body);

  
  // Gera um ID maior que todos os existentes
  const novoId = Math.max(0, ...demandas.map(d => d.id)) + 1;

  // Obtém a data atual do servidor
  const hoje = new Date().toISOString().slice(0, 10);

  // Cria a demanda com os dados validados
  const novaDemanda: Demanda = {
    id: novoId,
    titulo: titulo.trim(),
    descricao: descricao.trim(),
    tipo: tipo as Tipo,
    prioridade: prioridade as Prioridade,
    status: "Aberta",
    projetoId,
    responsavelId:
      responsavelId === undefined ||
      responsavelId === null ||
      responsavelId === ""
        ? null
        : responsavelId,
    dataCriacao: hoje,
    dataAtualizacao: hoje,
    prazo:
      prazo === undefined ||
      prazo === null ||
      prazo === ""
        ? null
        : prazo
  };

  // Adiciona a demanda ao array compartilhado
  demandas.push(novaDemanda);

  // Retorna HTTP 201 com a demanda cadastrada
  return res.status(201).json(novaDemanda);

});

export default router;
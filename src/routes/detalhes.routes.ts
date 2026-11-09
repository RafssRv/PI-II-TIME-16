/*
  Autor: Priscila Amorim dos Santos
  Tela: Detalhes da Demanda
  Descrição: Rotas da tela de Detalhes da Demanda (Reunião 4):
    - GET  /demandas/:id               -> dados completos de uma demanda
    - GET  /demandas/:id/comentarios   -> comentários da demanda
    - POST /demandas/:id/comentarios   -> registra um novo comentário
*/

import { Router, Request } from 'express';
import { comentarios, demandas, usuarios } from '../data/dados';
import { Comentario } from '../types';

const router = Router();

const TEXTO_MINIMO = 3;
const TEXTO_MAXIMO = 500;

// Procura uma demanda pelo id recebido na URL (string -> número).
// Retorna undefined se o id não for um número válido ou não existir.
function buscarDemanda(req: Request) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return undefined;
  }
  return demandas.find((d) => d.id === id);
}

// Monta o comentário no formato devolvido pela API, incluindo o nome do autor
function formatarComentario(c: Comentario) {
  const autor = usuarios.find((u) => u.id === c.usuarioId);
  return { ...c, autor: autor ? autor.nome : null };
}

// GET /demandas/:id -> 200 com a demanda | 404 se não existir
router.get('/:id', (req, res) => {
  const demanda = buscarDemanda(req);

  if (!demanda) {
    res.status(404).json({ erro: 'Demanda não encontrada.' });
    return;
  }

  res.status(200).json(demanda);
});

// GET /demandas/:id/comentarios -> 200 com a lista | 404 se a demanda não existir
router.get('/:id/comentarios', (req, res) => {
  const demanda = buscarDemanda(req);

  if (!demanda) {
    res.status(404).json({ erro: 'Demanda não encontrada.' });
    return;
  }

  const lista = comentarios
    .filter((c) => c.demandaId === demanda.id)
    .map(formatarComentario);

  res.status(200).json(lista);
});

// POST /demandas/:id/comentarios
// Corpo esperado: { "usuarioId": number, "texto": string }
// 201 criado | 400 dados inválidos | 404 demanda não encontrada
router.post('/:id/comentarios', (req, res) => {
  const demanda = buscarDemanda(req);

  if (!demanda) {
    res.status(404).json({ erro: 'Demanda não encontrada.' });
    return;
  }

  const { usuarioId, texto } = req.body ?? {};

  // O servidor valida tudo por conta própria, mesmo que a tela já valide.
  if (typeof texto !== 'string' || texto.trim().length === 0) {
    res.status(400).json({ erro: 'O texto do comentário é obrigatório e não pode ficar vazio.' });
    return;
  }

  const textoLimpo = texto.trim();

  if (textoLimpo.length < TEXTO_MINIMO || textoLimpo.length > TEXTO_MAXIMO) {
    res.status(400).json({
      erro: `O comentário deve ter entre ${TEXTO_MINIMO} e ${TEXTO_MAXIMO} caracteres.`,
    });
    return;
  }

  if (typeof usuarioId !== 'number' || !Number.isInteger(usuarioId)) {
    res.status(400).json({ erro: 'O usuarioId é obrigatório e deve ser um número.' });
    return;
  }

  const usuario = usuarios.find((u) => u.id === usuarioId);
  if (!usuario) {
    res.status(400).json({ erro: 'O usuário informado não existe.' });
    return;
  }

  const novoComentario: Comentario = {
    id: comentarios.length > 0 ? Math.max(...comentarios.map((c) => c.id)) + 1 : 1,
    demandaId: demanda.id,
    usuarioId: usuario.id,
    texto: textoLimpo,
    criadoEm: new Date().toISOString(), // data e hora definidas pelo servidor
  };

  comentarios.push(novoComentario);

  res.status(201).json(formatarComentario(novoComentario));
});

export default router;

// Autor: Vinícius Panutti Salgado — Responsável pelo Dashboard
import { Router } from 'express';
import { criarDemandasDemonstracao } from './dashboard.data';
import { calcularDashboard } from './dashboard.service';

const router = Router();

router.get('/', (req, res) => {
  // Nesta etapa, qualquer parâmetro de consulta é inesperado, inclusive sem valor.
  if (Object.keys(req.query).length > 0) {
    res.status(400).json({
      erro: 'GET /dashboard não recebe filtros nem parâmetros de consulta nesta etapa.',
    });
    return;
  }

  // Uma única referência temporal evita divergências se a consulta ocorrer à meia-noite.
  const agora = new Date();
  res.status(200).json(calcularDashboard(criarDemandasDemonstracao(agora), agora));
});

export default router;

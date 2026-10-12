/*
  Autor: equipe (ponto de entrada do servidor)
  Descrição: Servidor Express com TypeScript. 
*/

import express, { NextFunction, Request, Response } from 'express';
import detalhesRoutes from './routes/detalhes.routes';

const app = express();
const porta = 3000;

app.use(express.json());

app.get('/', (_req, res) => {
  res.json({ mensagem: 'Servidor rodando' });
});

// Rotas da tela de Detalhes (Priscila)
app.use('/demandas', detalhesRoutes);

// JSON malformado no corpo da requisição -> 400 em JSON
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  res.status(400).json({ erro: 'Requisição inválida. Verifique o JSON enviado.' });
});

app.listen(porta, () => {
  console.log(`Servidor ouvindo na porta ${porta}`);
});

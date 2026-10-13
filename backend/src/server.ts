// Autor: Heloisa Marinho
// Descrição: Ponto de entrada do servidor Express.

import express, {Request, Response} from "express";
import path from "node:path";
import demandasRouter from "./routes/listagem.js";

const app = express();
const PORTA = 3000;

app.use(express.json());


app.use(demandasRouter);


app.use((_req, res) => {
  res.status(404).json({ erro: "Rota não encontrada." });
});

app.listen(PORTA, () => {
  console.log(`Servidor rodando em http://localhost:${PORTA}`);
});
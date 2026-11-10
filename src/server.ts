/*
  Autor: Vinícius Panutti Salgado — R.A. 25007329
  Descrição: Ponto de entrada do servidor Express (TypeScript) com persistência MySQL: lê a porta
  do ambiente, abre a conexão com o banco, cria o app e encerra o pool ao receber SIGINT/SIGTERM.
*/

import 'dotenv/config';

import { createApp } from './app';
import { createMysqlDatabase } from './database';

const port = Number(process.env.PORT || 3000);
const database = createMysqlDatabase();
const app = createApp(database);

// Dashboard e demandas usam as rotas persistidas registradas em createApp.

const server = app.listen(port, () => {
  console.log(`Servidor disponível em http://localhost:${port}`);
});

async function shutdown() {
  server.close(async () => { await database.close(); });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

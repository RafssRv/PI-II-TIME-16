/*
  Autor: equipe (ponto de entrada do servidor)
  Descrição: Servidor Express com TypeScript e persistência MySQL.
*/

import 'dotenv/config';

const { createApp } = require('./app');
const { createMysqlDatabase } = require('./database');

const port = Number(process.env.PORT || 3000);
const database = createMysqlDatabase();
const app = createApp(database);

const server = app.listen(port, () => {
  console.log(`Servidor disponível em http://localhost:${port}`);
});

async function shutdown() {
  server.close(async () => { await database.close(); });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

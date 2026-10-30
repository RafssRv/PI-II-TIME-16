/*
  Autor: equipe (ponto de entrada do servidor)
  Descrição: Servidor Express com TypeScript e persistência MySQL.
*/

import 'dotenv/config';
import dashboardRoutes from './dashboard/dashboard.routes';
import listagemRoutes from './routes/listagem.routes';

const { createApp } = require('./app');
const { createMysqlDatabase } = require('./database');

const port = Number(process.env.PORT || 3000);
const database = createMysqlDatabase();
const app = createApp(database);

// O dashboard continua separado; detalhes e demandas usam as rotas persistidas em /api.
app.use('/dashboard', dashboardRoutes);
app.use('/', listagemRoutes);

const server = app.listen(port, () => {
  console.log(`Servidor disponível em http://localhost:${port}`);
});

async function shutdown() {
  await database.close();
  server.close();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

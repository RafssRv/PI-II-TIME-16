/*
  Autor: equipe (ponto de entrada do servidor)
  Descrição: Servidor Express com TypeScript e persistência Oracle.
*/

import 'dotenv/config';
import dashboardRoutes from './dashboard/dashboard.routes';
import detalhesRoutes from './routes/detalhes.routes';

const { createApp } = require('./app');
const { createOracleDatabase } = require('./database');

const port = Number(process.env.PORT || 3000);
const database = createOracleDatabase();
const app = createApp(database);

// Mantém disponíveis as rotas demonstrativas criadas nas etapas anteriores.
app.use('/dashboard', dashboardRoutes);
app.use('/demandas', detalhesRoutes);

const server = app.listen(port, () => {
  console.log(`Servidor disponível em http://localhost:${port}`);
});

async function shutdown() {
  await database.close();
  server.close();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

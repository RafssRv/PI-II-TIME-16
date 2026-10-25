require('dotenv').config();
const { createApp } = require('./src/app');
const { createOracleDatabase } = require('./src/database');

const port = Number(process.env.PORT || 3000);
const database = createOracleDatabase();
const server = createApp(database).listen(port, () => {
  console.log(`Servidor disponível em http://localhost:${port}`);
});

async function shutdown() {
  await database.close();
  server.close();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

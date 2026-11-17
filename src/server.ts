/*
Autor: Vinícius Panutti Salgado - RA: 25007329
Tela: Uso geral do sistema (inicialização do servidor)

Descrição: 
Carrega as configurações de ambiente, prepara o acesso ao banco e inicia a aplicação na porta definida.
Exibe o endereço do servidor no terminal e organiza seu encerramento, fechando também as conexões com o MySQL
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

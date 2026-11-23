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

// Usa a porta definida no .env ou a porta 3000 se nenhuma tiver sido informada
const port = Number(process.env.PORT || 3000);

// Cria a conexão que será usada para conversar com o banco de dados
const database = createMysqlDatabase();

// Prepara a aplicação usando essa conexão com o banco
const app = createApp(database);

// Inicia o servidor para receber solicitações na porta escolhida
const server = app.listen(port, () => {
  console.log(`Servidor disponível em http://localhost:${port}`);
});

// Fecha o servidor e a conexão com o banco quando a aplicação for encerrada
async function shutdown() {
  server.close(async () => { await database.close(); });
}

// Executa o encerramento organizado quando o usuário pressiona Ctrl+C
process.on('SIGINT', shutdown);

// Executa o mesmo encerramento quando o sistema pede para parar o servidor
process.on('SIGTERM', shutdown);

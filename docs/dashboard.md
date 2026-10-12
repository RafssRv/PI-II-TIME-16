# Dashboard — entrega individual da Reunião 4

Autor: Vinícius Panutti Salgado — Responsável pelo Dashboard

Implementação provisória e autocontida em `feature/dashboard`. A coleção é
exclusiva da demonstração do Dashboard, não é a base definitiva do grupo.
Frontend e `server.js` antigo são preservados. Não há integração frontend–API,
banco de dados, autenticação ou rotas das outras telas.

## Execução

Requisito: Node.js 24 LTS com npm. Na raiz do repositório:

```bash
npm ci
npm run dev
```

Alternativa para executar o código compilado:

```bash
npm run build
npm start
```

Execute uma alternativa por vez; a porta 3000 precisa estar livre. `npm run dev`
executa `src/server.ts`; `npm start` executa `dist/server.js`. O arquivo antigo
`server.js` não participa desses comandos. `GET /` retorna “Servidor rodando”.

## Contrato

`GET http://localhost:3000/dashboard`, sem corpo, filtros ou parâmetros de consulta.
Sucesso: HTTP 200, `Content-Type: application/json`. Contagens esperadas da coleção
de oito demandas; as duas listas estão abreviadas neste exemplo de contrato:

```json
{
  "totalDemandas": 8,
  "quantidadesPorStatus": {
    "Aberta": 4,
    "Em andamento": 1,
    "Em revisão": 1,
    "Concluída": 1,
    "Cancelada": 1
  },
  "quantidadesPorPrioridade": {
    "Crítica": 3,
    "Alta": 2,
    "Média": 1,
    "Baixa": 2
  },
  "quantidadesPorTipo": {
    "Tarefa": 2,
    "Defeito": 2,
    "Melhoria": 2,
    "Documentação": 2
  },
  "demandasCriticasEmAberto": [],
  "demandasProximasDoPrazo": []
}
```

No exemplo acima, as listas estão abreviadas como `[]` apenas para mostrar o
contrato: na resposta real, a lista crítica contém o ID **1**, e a de próximas
do prazo contém os IDs **1, 2, 3**, nessa ordem. Cada item contém:

```typescript
{
  id: number;
  titulo: string;
  status: 'Aberta' | 'Em andamento' | 'Em revisão' | 'Concluída' | 'Cancelada';
  prioridade: 'Crítica' | 'Alta' | 'Média' | 'Baixa';
  tipo: 'Tarefa' | 'Defeito' | 'Melhoria' | 'Documentação';
  prazo: string | null; // YYYY-MM-DD
}
```

São exatamente seis campos principais. Contagens consideram todas as demandas;
categorias sem ocorrência permanecem com zero, e listas sem resultados são `[]`.
Uma coleção vazia produz HTTP 200, todas as contagens zero e ambas as listas vazias.
Uma demanda pode aparecer nas duas listas. A ordem é a ordem da coleção.

`GET /dashboard?teste=1` (ou qualquer parâmetro) retorna HTTP 400 e:

```json
{
  "erro": "GET /dashboard não recebe filtros nem parâmetros de consulta nesta etapa."
}
```

## Critérios e datas

- Em aberto: status diferente de `Concluída` e `Cancelada`.
- Críticas em aberto: em aberto e prioridade `Crítica`.
- Próximas do prazo: em aberto, com prazo entre hoje e hoje + 7 dias, inclusive.
- Vencidas, sem prazo, concluídas e canceladas não entram nas próximas do prazo.
- Hoje é a data civil em `America/Sao_Paulo`, obtida com `Intl.DateTimeFormat`.
  O prazo é `YYYY-MM-DD`, sem horário; a comparação não converte o prazo para UTC.
  UTC é usado apenas para somar dias de calendário, incluindo viradas de mês/ano.
- A mesma referência temporal é usada para gerar dados e calcular a resposta.
  Os exemplos são recriados em memória a cada consulta para permanecerem relativos
  a hoje, inclusive após a meia-noite. Não existe persistência.
- Os dados internos são tipados e possuem datas válidas. Validação de dados
  externos ficará a cargo do contrato coletivo quando ele existir.

## Dados e checklist no Thunder Client/Postman

| ID | Cenário | Resultado esperado nas listas |
|---|---|---|
| 1 | Crítica aberta, hoje | Críticas e próximas |
| 2 | Alta, em andamento, hoje + 3 | Próximas |
| 3 | Média, em revisão, hoje + 7 | Próximas |
| 4 | Crítica concluída, hoje | Nenhuma |
| 5 | Crítica cancelada, hoje + 3 | Nenhuma |
| 6 | Baixa aberta, ontem | Nenhuma |
| 7 | Alta aberta, hoje + 8 | Nenhuma |
| 8 | Baixa aberta, sem prazo | Nenhuma |

- [ ] `GET http://localhost:3000/dashboard`: HTTP 200 e JSON com os seis campos.
- [ ] Conferir as contagens acima; cada distribuição deve somar 8.
- [ ] Conferir crítica `[1]` e próximas `[1, 2, 3]`.
- [ ] Conferir limites hoje e +7; excluir ontem, +8, sem prazo e status encerrados.
- [ ] `GET http://localhost:3000/dashboard?teste=1`: HTTP 400 e mensagem acima.
- [ ] `GET http://localhost:3000/dashboard?status=Aberta`: HTTP 400, pois não há filtros.
- [ ] `GET http://localhost:3000/dashboard?teste`: HTTP 400 mesmo sem valor.
- [ ] Repetir o GET válido depois do erro: HTTP 200.

Coleção vazia e categorias ausentes devem ser verificados diretamente em
`calcularDashboard([])` e com uma coleção parcial, sem criar parâmetros ou rotas
para trocar dados de teste. O script `npm test` herdado não é uma suíte de testes.

Verificação executada nesta entrega: `npm run build` passou. Um script temporário
externo ao repositório verificou contagens, listas, coleção vazia/parcial, ausência
de mutação, todos os status, virada de dia em São Paulo, virada de ano e ano
bissexto. Também iniciou o servidor compilado com fuso do processo em UTC e fez
requisições HTTP reais na porta 3000: raiz e Dashboard com 200; parâmetros simples,
sem valor, repetidos e com colchetes com 400; consulta válida após os erros com 200.
Todos esses testes passaram, e o processo foi encerrado ao final.

## Consolidação futura

Quando a equipe consolidar o backend, substituir a fábrica de demonstração pela
coleção única, alinhar nomes/tipos dos campos e registrar a rota no servidor
coletivo. Remover o ponto de entrada provisório se necessário, mantendo as regras
do Dashboard. Não importar usuários, comentários ou outras entidades para esta rota.

## Fala para a apresentação

“Eu implementei o backend do Dashboard em Express e TypeScript. A rota GET
/dashboard calcula os indicadores e seleciona demandas críticas em aberto e
próximas do prazo, considerando o calendário de São Paulo. Demonstro o sucesso
com HTTP 200 e a rejeição de parâmetros inesperados com HTTP 400. Os dados são
provisórios e exclusivos da minha demonstração, e o frontend foi preservado.”

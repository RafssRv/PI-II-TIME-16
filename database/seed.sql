-- Autor: Equipe PI-II-TIME-16
-- Descrição: Dados demonstrativos para apresentar perfis, projetos e demandas.
-- Execute após schema.sql em um schema de desenvolvimento. As contas abaixo são apenas para demonstração.

MERGE INTO usuarios u
USING (
    SELECT 'Admin Demo' nome, 'admin@local.test' email,
           '$2b$12$QAyhaWtP9tqSp6oU6myLW..W44FvREIJJGBvk017TmYXjLOF2D8mK' senha_hash, 'ADMIN' perfil FROM dual
    UNION ALL
    SELECT 'Lucas Líder', 'lider@local.test',
           '$2b$12$e2/.lBV02T34.T0SC3JzHuiDEjiXdanjZ2vQezNKzxMhBUI8MeHji', 'LIDER' FROM dual
    UNION ALL
    SELECT 'João Silva', 'joao@local.test',
           '$2b$12$TJRMnBaAcBFIVPAA.td9IOKE8B1/X9.e2S9LAgwSsz3QQJX7OeOee', 'MEMBRO' FROM dual
    UNION ALL
    SELECT 'Maria Santos', 'maria@local.test',
           '$2b$12$TJRMnBaAcBFIVPAA.td9IOKE8B1/X9.e2S9LAgwSsz3QQJX7OeOee', 'MEMBRO' FROM dual
) s
ON (LOWER(u.email) = LOWER(s.email))
WHEN NOT MATCHED THEN INSERT (nome, email, senha_hash, perfil)
VALUES (s.nome, s.email, s.senha_hash, s.perfil);

MERGE INTO projetos p
USING (
    SELECT 'Sistema de Demandas' nome, 'Projeto de acompanhamento de demandas.' descricao FROM dual
    UNION ALL
    SELECT 'App Cliente', 'Aplicação de atendimento ao cliente.' FROM dual
) s
ON (p.nome = s.nome)
WHEN NOT MATCHED THEN INSERT (nome, descricao) VALUES (s.nome, s.descricao);

INSERT INTO projeto_membros (projeto_id, usuario_id)
SELECT p.id, u.id
FROM projetos p CROSS JOIN usuarios u
WHERE (
      (p.nome = 'Sistema de Demandas' AND u.email IN ('lider@local.test', 'joao@local.test', 'maria@local.test'))
   OR (p.nome = 'App Cliente' AND u.email IN ('lider@local.test', 'maria@local.test'))
  )
  AND NOT EXISTS (
      SELECT 1 FROM projeto_membros pm
      WHERE pm.projeto_id = p.id AND pm.usuario_id = u.id
  );

MERGE INTO demandas d
USING (
  SELECT p.id projeto_id, criador.id criador_id, responsavel.id responsavel_id,
         dados.titulo, dados.descricao, dados.tipo, dados.prioridade, dados.status, dados.prazo
  FROM (
    SELECT 'Sistema de Demandas' projeto, 'joao@local.test' criador, 'joao@local.test' responsavel,
           'Ajustar fluxo de login' titulo, 'Corrigir a mensagem apresentada após uma senha inválida.' descricao,
           'DEFEITO' tipo, 'ALTA' prioridade, 'EM_ANDAMENTO' status, DATE '2026-10-29' prazo FROM dual
    UNION ALL
    SELECT 'App Cliente', 'lider@local.test', NULL, 'Implementar busca por responsável',
           'Adicionar busca textual e filtros por pessoa responsável.', 'MELHORIA', 'MEDIA', 'ABERTA', DATE '2026-11-03' FROM dual
    UNION ALL
    SELECT 'Sistema de Demandas', 'lider@local.test', 'joao@local.test', 'Revisar página de cadastro',
           'Ajustar os rótulos e validar as mensagens do formulário.', 'TAREFA', 'CRITICA', 'ABERTA', DATE '2026-10-27' FROM dual
    UNION ALL
    SELECT 'Sistema de Demandas', 'maria@local.test', 'maria@local.test', 'Documentar API de demandas',
           'Registrar os exemplos de requisição e resposta das rotas.', 'DOCUMENTACAO', 'BAIXA', 'EM_REVISAO', NULL FROM dual
    UNION ALL
    SELECT 'App Cliente', 'lider@local.test', 'maria@local.test', 'Atualizar validação de cadastro',
           'Revisar regras e mensagens da validação de cadastro.', 'TAREFA', 'ALTA', 'CONCLUIDA', NULL FROM dual
    UNION ALL
    SELECT 'Sistema de Demandas', 'lider@local.test', 'joao@local.test', 'Remover inconsistência de prioridade',
           'Analisar a demanda duplicada e registrar o motivo do cancelamento.', 'DEFEITO', 'CRITICA', 'CANCELADA', NULL FROM dual
    UNION ALL
    SELECT 'App Cliente', 'maria@local.test', NULL, 'Criar filtros do dashboard',
           'Permitir filtrar indicadores por status e prioridade.', 'MELHORIA', 'MEDIA', 'ABERTA', DATE '2026-10-30' FROM dual
    UNION ALL
    SELECT 'Sistema de Demandas', 'lider@local.test', 'joao@local.test', 'Otimizar consulta Oracle',
           'Reduzir o tempo de resposta da consulta da listagem.', 'TAREFA', 'ALTA', 'EM_REVISAO', DATE '2026-11-02' FROM dual
) dados
  JOIN projetos p ON p.nome = dados.projeto
  JOIN usuarios criador ON criador.email = dados.criador
  LEFT JOIN usuarios responsavel ON responsavel.email = dados.responsavel
) s
ON (d.titulo = s.titulo)
WHEN NOT MATCHED THEN INSERT
    (projeto_id, criador_id, responsavel_id, titulo, descricao, tipo, prioridade, status, prazo)
VALUES
    (s.projeto_id, s.criador_id, s.responsavel_id,
     s.titulo, s.descricao, s.tipo, s.prioridade, s.status, s.prazo);

INSERT INTO historico_demandas (demanda_id, autor_id, acao, valor_novo)
SELECT d.id, d.criador_id, 'CRIACAO', d.titulo
FROM demandas d
WHERE NOT EXISTS (
    SELECT 1 FROM historico_demandas h
    WHERE h.demanda_id = d.id AND h.acao = 'CRIACAO'
);

INSERT INTO comentarios (demanda_id, autor_id, texto)
SELECT d.id, u.id, 'A demanda foi conferida e está registrada para demonstração.'
FROM demandas d CROSS JOIN usuarios u
WHERE d.titulo = 'Ajustar fluxo de login'
  AND u.email = 'maria@local.test'
  AND NOT EXISTS (
      SELECT 1 FROM comentarios c
      WHERE c.demanda_id = d.id AND c.texto = 'A demanda foi conferida e está registrada para demonstração.'
  );

COMMIT;

-- Autor majoritário: Vinicius Panutti Salgado — R.A. 25007329.
-- MySQL 8.0 ou superior. Execute uma única vez em um banco vazio, selecionado na conexão.
-- DDL realiza COMMIT implícito: um erro pode deixar objetos já criados.

-- Armazena contas, hash de senha, perfil e estado de ativação dos usuários.
CREATE TABLE usuarios (
    -- Identifica unicamente o registro; o banco gera o próximo número inteiro na inserção.
    id INT AUTO_INCREMENT PRIMARY KEY,
    -- Armazena o nome de exibição com até cem caracteres e impede NULL.
    nome VARCHAR(100) NOT NULL,
    -- Armazena o endereço de e-mail informado com até 254 caracteres e impede NULL.
    email VARCHAR(254) NOT NULL,
    -- Guarda o hash da senha, com até 255 caracteres; esta coluna não recebe a senha em texto puro.
    senha_hash VARCHAR(255) NOT NULL,
    -- Gera e armazena a versão minúscula e sem espaços externos do e-mail para conferir sua unicidade.
    email_chave VARCHAR(254) GENERATED ALWAYS AS (LOWER(TRIM(email))) STORED,
    -- Impede duplicar a chave normalizada do e-mail, inclusive com diferenças de maiúsculas ou espaços externos.
    CONSTRAINT uq_usuario_email UNIQUE (email_chave),
    -- Guarda o perfil de acesso, usando MEMBRO como valor padrão e impedindo NULL.
    perfil VARCHAR(20) DEFAULT 'MEMBRO' NOT NULL,
    -- Representa a ativação com um inteiro pequeno, adotando 1 por padrão e impedindo NULL.
    ativo TINYINT DEFAULT 1 NOT NULL,
    -- Registra o instante de criação com precisão de microssegundos; o padrão é o horário da inserção.
    criado_em TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6) NOT NULL,
    -- Inicializa o instante da última atualização; sem ON UPDATE, alterações posteriores dependem da aplicação.
    atualizado_em TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6) NOT NULL,
    -- Limita o perfil aos três códigos de acesso reconhecidos pela aplicação.
    CONSTRAINT ck_usuario_perfil CHECK (perfil IN ('ADMIN', 'LIDER', 'MEMBRO')),
    -- Aceita somente 0 ou 1 como estado de ativação do usuário.
    CONSTRAINT ck_usuario_ativo CHECK (ativo IN (0, 1)),
    -- Rejeita nomes que ficam vazios depois de retirar espaços externos.
    CONSTRAINT ck_usuario_nome CHECK (CHAR_LENGTH(TRIM(nome)) > 0),
    -- Rejeita e-mails que ficam vazios depois de retirar espaços externos.
    CONSTRAINT ck_usuario_email CHECK (CHAR_LENGTH(TRIM(email)) > 0)
-- Usa InnoDB para transações e chaves estrangeiras, UTF-8 de quatro bytes e comparação sensível a acentos e caixa.
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_cs;

-- E-mails iguais com diferença apenas de caixa pertencem ao mesmo usuário.
-- A coluna gerada email_chave mantém a unicidade sem diferença de caixa/espaços.

-- Armazena os projetos aos quais as demandas e equipes pertencem.
CREATE TABLE projetos (
    -- Identifica unicamente o registro; o banco gera o próximo número inteiro na inserção.
    id INT AUTO_INCREMENT PRIMARY KEY,
    -- Armazena o nome de exibição com até cem caracteres e impede NULL.
    nome VARCHAR(100) NOT NULL,
    -- Guarda a descrição opcional do projeto, com até mil caracteres.
    descricao VARCHAR(1000),
    -- Representa a ativação com um inteiro pequeno, adotando 1 por padrão e impedindo NULL.
    ativo TINYINT DEFAULT 1 NOT NULL,
    -- Registra o instante de criação com precisão de microssegundos; o padrão é o horário da inserção.
    criado_em TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6) NOT NULL,
    -- Inicializa o instante da última atualização; sem ON UPDATE, alterações posteriores dependem da aplicação.
    atualizado_em TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6) NOT NULL,
    -- Impede cadastrar um projeto com nome vazio ou composto apenas por espaços.
    CONSTRAINT ck_projeto_nome CHECK (CHAR_LENGTH(TRIM(nome)) > 0),
    -- Aceita somente 0 ou 1 para indicar se o projeto está ativo.
    CONSTRAINT ck_projeto_ativo CHECK (ativo IN (0, 1))
-- Usa InnoDB para transações e chaves estrangeiras, UTF-8 de quatro bytes e comparação sensível a acentos e caixa.
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_cs;

-- Relaciona usuários e projetos para compor as equipes usadas nas permissões.
CREATE TABLE projeto_membros (
    -- Guarda o identificador obrigatório do projeto; a chave estrangeira abaixo exige um projeto existente.
    projeto_id INT NOT NULL,
    -- Guarda o identificador obrigatório do usuário que participa da equipe.
    usuario_id INT NOT NULL,
    -- Registra o instante de criação com precisão de microssegundos; o padrão é o horário da inserção.
    criado_em TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6) NOT NULL,
    -- Torna o par projeto_id e usuario_id único, impedindo cadastrar o mesmo vínculo duas vezes.
    CONSTRAINT pk_projeto_membros PRIMARY KEY (projeto_id, usuario_id),
    -- Exige que projeto_id corresponda a projetos.id; não há exclusão em cascata declarada nesta relação.
    CONSTRAINT fk_pm_projeto FOREIGN KEY (projeto_id) REFERENCES projetos (id),
    -- Exige que usuario_id corresponda a usuarios.id; não há exclusão em cascata declarada nesta relação.
    CONSTRAINT fk_pm_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
-- Usa InnoDB para transações e chaves estrangeiras, UTF-8 de quatro bytes e comparação sensível a acentos e caixa.
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_cs;
-- Facilita localizar todos os projetos de um usuário quando a pesquisa começa por usuario_id.
CREATE INDEX ix_pm_usuario ON projeto_membros (usuario_id);

-- Armazena o trabalho acompanhado pelo sistema, seus relacionamentos e o estado atual.
CREATE TABLE demandas (
    -- Identifica unicamente o registro; o banco gera o próximo número inteiro na inserção.
    id INT AUTO_INCREMENT PRIMARY KEY,
    -- Guarda o identificador obrigatório do projeto; a chave estrangeira abaixo exige um projeto existente.
    projeto_id INT NOT NULL,
    -- Guarda o identificador obrigatório do usuário que criou a demanda.
    criador_id INT NOT NULL,
    -- Guarda o usuário responsável; a ausência de NOT NULL permite demanda sem atribuição.
    responsavel_id INT,
    -- Guarda o título obrigatório com limite de cem caracteres; o tamanho mínimo é validado pelo CHECK.
    titulo VARCHAR(100) NOT NULL,
    -- Guarda a descrição obrigatória da demanda com até mil caracteres; o CHECK abaixo define seu tamanho mínimo.
    descricao VARCHAR(1000) NOT NULL,
    -- Guarda o código obrigatório do tipo de demanda, restrito pelo CHECK correspondente.
    tipo VARCHAR(20) NOT NULL,
    -- Guarda o código obrigatório da prioridade, restrito pelo CHECK correspondente.
    prioridade VARCHAR(20) NOT NULL,
    -- Guarda o estado obrigatório da demanda e inicia novos registros como ABERTA por padrão.
    status VARCHAR(20) DEFAULT 'ABERTA' NOT NULL,
    -- Guarda uma data civil sem horário e permite NULL quando não existe prazo definido.
    prazo DATE,
    -- Registra o instante de criação com precisão de microssegundos; o padrão é o horário da inserção.
    criado_em TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6) NOT NULL,
    -- Inicializa o instante da última atualização; sem ON UPDATE, alterações posteriores dependem da aplicação.
    atualizado_em TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6) NOT NULL,
    -- Exige que projeto_id corresponda a projetos.id; não há exclusão em cascata declarada nesta relação.
    CONSTRAINT fk_demanda_projeto FOREIGN KEY (projeto_id) REFERENCES projetos (id),
    -- Exige que criador_id corresponda a usuarios.id; não há exclusão em cascata declarada nesta relação.
    CONSTRAINT fk_demanda_criador FOREIGN KEY (criador_id) REFERENCES usuarios (id),
    -- Exige que responsavel_id corresponda a usuarios.id; não há exclusão em cascata declarada nesta relação.
    CONSTRAINT fk_demanda_responsavel FOREIGN KEY (responsavel_id) REFERENCES usuarios (id),
    -- Exige ao menos três caracteres no título após retirar espaços externos.
    CONSTRAINT ck_demanda_titulo CHECK (TRIM(titulo) IS NOT NULL AND CHAR_LENGTH(TRIM(titulo)) >= 3),
    -- Exige ao menos dez caracteres na descrição após retirar espaços externos.
    CONSTRAINT ck_demanda_desc CHECK (TRIM(descricao) IS NOT NULL AND CHAR_LENGTH(TRIM(descricao)) >= 10),
    -- Restringe o tipo a TAREFA, DEFEITO, MELHORIA ou DOCUMENTACAO.
    CONSTRAINT ck_demanda_tipo CHECK (tipo IN ('TAREFA', 'DEFEITO', 'MELHORIA', 'DOCUMENTACAO')),
    -- Restringe a prioridade a CRITICA, ALTA, MEDIA ou BAIXA.
    CONSTRAINT ck_demanda_prioridade CHECK (prioridade IN ('CRITICA', 'ALTA', 'MEDIA', 'BAIXA')),
    -- Restringe o estado aos cinco códigos do ciclo de vida; as transições entre eles são validadas pela API.
    CONSTRAINT ck_demanda_status CHECK (status IN ('ABERTA', 'EM_ANDAMENTO', 'EM_REVISAO', 'CONCLUIDA', 'CANCELADA'))
-- Usa InnoDB para transações e chaves estrangeiras, UTF-8 de quatro bytes e comparação sensível a acentos e caixa.
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_cs;
-- Facilita consultar as demandas vinculadas a um projeto.
CREATE INDEX ix_demanda_projeto ON demandas (projeto_id);
-- Facilita consultar demandas pelo usuário que as criou.
CREATE INDEX ix_demanda_criador ON demandas (criador_id);
-- Facilita consultar demandas pelo usuário responsável.
CREATE INDEX ix_demanda_responsavel ON demandas (responsavel_id);
-- Cria um índice composto na ordem status, prioridade e prazo para auxiliar consultas compatíveis com esse prefixo.
CREATE INDEX ix_demanda_filtros ON demandas (status, prioridade, prazo);

-- Armazena mensagens vinculadas a uma demanda e ao usuário que as escreveu.
CREATE TABLE comentarios (
    -- Identifica unicamente o registro; o banco gera o próximo número inteiro na inserção.
    id INT AUTO_INCREMENT PRIMARY KEY,
    -- Guarda o identificador obrigatório da demanda à qual este registro pertence.
    demanda_id INT NOT NULL,
    -- Guarda o identificador obrigatório do usuário responsável por este registro.
    autor_id INT NOT NULL,
    -- Guarda o comentário obrigatório com até quinhentos caracteres; o CHECK define o tamanho mínimo.
    texto VARCHAR(500) NOT NULL,
    -- Registra o instante de criação com precisão de microssegundos; o padrão é o horário da inserção.
    criado_em TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6) NOT NULL,
    -- Inicializa o instante da última atualização; sem ON UPDATE, alterações posteriores dependem da aplicação.
    atualizado_em TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6) NOT NULL,
    -- Exige que demanda_id corresponda a demandas.id; não há exclusão em cascata declarada nesta relação.
    CONSTRAINT fk_comentario_demanda FOREIGN KEY (demanda_id) REFERENCES demandas (id),
    -- Exige que autor_id corresponda a usuarios.id; não há exclusão em cascata declarada nesta relação.
    CONSTRAINT fk_comentario_autor FOREIGN KEY (autor_id) REFERENCES usuarios (id),
    -- Exige pelo menos três caracteres no comentário após retirar espaços externos.
    CONSTRAINT ck_comentario_texto CHECK (TRIM(texto) IS NOT NULL AND CHAR_LENGTH(TRIM(texto)) >= 3)
-- Usa InnoDB para transações e chaves estrangeiras, UTF-8 de quatro bytes e comparação sensível a acentos e caixa.
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_cs;
-- Organiza a busca por demanda e, dentro dela, por instante de criação dos comentários.
CREATE INDEX ix_comentario_demanda ON comentarios (demanda_id, criado_em);
-- Facilita localizar comentários de um mesmo autor.
CREATE INDEX ix_comentario_autor ON comentarios (autor_id);

-- Preserva os eventos de criação e de alteração de campos das demandas.
CREATE TABLE historico_demandas (
    -- Identifica unicamente o registro; o banco gera o próximo número inteiro na inserção.
    id INT AUTO_INCREMENT PRIMARY KEY,
    -- Guarda o identificador obrigatório da demanda à qual este registro pertence.
    demanda_id INT NOT NULL,
    -- Guarda o identificador obrigatório do usuário responsável por este registro.
    autor_id INT NOT NULL,
    -- Guarda o código obrigatório do evento, limitado às opções do CHECK de ação.
    acao VARCHAR(20) NOT NULL,
    -- Identifica o campo alterado com até quarenta caracteres; a criação não exige esse valor.
    campo VARCHAR(40),
    -- Preserva o valor anterior como texto de até mil caracteres, permitindo NULL quando não se aplica.
    valor_anterior VARCHAR(1000),
    -- Preserva o valor posterior como texto de até mil caracteres, permitindo NULL para um campo limpo.
    valor_novo VARCHAR(1000),
    -- Registra o instante de criação com precisão de microssegundos; o padrão é o horário da inserção.
    criado_em TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6) NOT NULL,
    -- Exige que demanda_id corresponda a demandas.id; não há exclusão em cascata declarada nesta relação.
    CONSTRAINT fk_historico_demanda FOREIGN KEY (demanda_id) REFERENCES demandas (id),
    -- Exige que autor_id corresponda a usuarios.id; não há exclusão em cascata declarada nesta relação.
    CONSTRAINT fk_historico_autor FOREIGN KEY (autor_id) REFERENCES usuarios (id),
    -- Aceita eventos de CRIACAO ou ALTERACAO no histórico.
    CONSTRAINT ck_historico_acao CHECK (acao IN ('CRIACAO', 'ALTERACAO')),
    -- Exige indicar o campo nos eventos de ALTERACAO; eventos de CRIACAO podem deixar essa coluna nula.
    CONSTRAINT ck_historico_campo CHECK (acao = 'CRIACAO' OR campo IS NOT NULL)
-- Usa InnoDB para transações e chaves estrangeiras, UTF-8 de quatro bytes e comparação sensível a acentos e caixa.
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_cs;
-- Auxilia a leitura dos eventos de uma demanda em ordem de criação.
CREATE INDEX ix_historico_demanda ON historico_demandas (demanda_id, criado_em);
-- Facilita localizar os eventos de histórico registrados por um usuário.
CREATE INDEX ix_historico_autor ON historico_demandas (autor_id);

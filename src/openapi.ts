export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Codex Telegram Bridge API',
    version: '0.1.0',
    description: 'API HTTP local do bridge para acompanhar tarefas, projetos, eventos, configurações e enviar comandos ao Codex. Esta API não possui autenticação própria; mantenha o servidor ligado em loopback ou proteja o acesso externamente.',
  },
  servers: [{ url: '/', description: 'Instância local do bridge' }],
  tags: [
    { name: 'Sistema', description: 'Verificação de disponibilidade e estado operacional.' },
    { name: 'Execução', description: 'Envio de comandos e consulta de tarefas e eventos.' },
    { name: 'Projetos', description: 'Projetos configurados para receber tarefas.' },
    { name: 'Configuração', description: 'Leitura e validação da configuração efetiva, sem gravação do arquivo de ambiente.' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['Sistema'],
        operationId: 'getHealth',
        summary: 'Verifica se o servidor HTTP está respondendo',
        description: 'Retorna somente a disponibilidade do processo HTTP. Não comprova autenticação no Codex, disponibilidade do Telegram ou execução de uma tarefa.',
        responses: {
          '200': {
            description: 'Servidor HTTP disponível.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthResponse' }, example: { status: 'ok' } } },
          },
        },
      },
    },
    '/status': {
      get: {
        tags: ['Sistema', 'Execução'],
        operationId: 'getStatus',
        summary: 'Consulta tarefas recentes',
        description: 'Retorna as 20 tarefas mais recentes registradas no SQLite, independentemente do projeto selecionado.',
        responses: {
          '200': {
            description: 'Estado operacional e tarefas recentes.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/StatusResponse' }, example: { status: 'ok', tasks: [{ id: 42, projectId: 'demo', text: 'Liste os arquivos do projeto.', status: 'completed', createdAt: '2026-09-28 12:00:00' }] } } },
          },
        },
      },
    },
    '/events': {
      get: {
        tags: ['Execução'],
        operationId: 'listEvents',
        summary: 'Consulta eventos registrados',
        description: 'Sem `taskId`, retorna até 100 eventos recentes. Com `taskId`, retorna os eventos da tarefa na ordem de criação.',
        parameters: [{
          name: 'taskId',
          in: 'query',
          required: false,
          description: 'Identificador numérico da tarefa. Quando omitido, consulta eventos recentes de todas as tarefas.',
          schema: { type: 'integer', format: 'int64', minimum: 0 },
          example: 42,
        }],
        responses: {
          '200': {
            description: 'Eventos encontrados; a lista pode ser vazia.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/EventsResponse' }, example: { events: [{ id: 101, taskId: 42, kind: 'status', text: '[100%] Execução concluída.', createdAt: '2026-09-28 12:01:00' }] } } },
          },
        },
      },
    },
    '/projects': {
      get: {
        tags: ['Projetos'],
        operationId: 'listProjects',
        summary: 'Lista projetos configurados',
        description: 'Expõe os projetos disponíveis para seleção e execução. O campo `cwd` informa o diretório de trabalho usado pelo Codex.',
        responses: {
          '200': {
            description: 'Projetos configurados para a instância.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ProjectsResponse' }, example: { projects: [{ id: 'demo', name: 'Projeto demo', cwd: '/workspace/projects/demo' }] } } },
          },
        },
      },
    },
    '/commands': {
      post: {
        tags: ['Execução'],
        operationId: 'createCommand',
        summary: 'Envia uma instrução ao Codex',
        description: 'Cria uma tarefa imediatamente ou a coloca na fila do projeto quando já existe uma execução ativa. O texto também pode usar a convenção `@nome-da-skill comando` para aplicar skills locais.',
        requestBody: {
          required: true,
          description: 'Comando textual a ser enviado. `projectId` é opcional e, quando omitido, usa o projeto padrão do bridge.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CommandRequest' }, examples: {
            comando: { summary: 'Comando comum', value: { text: 'Liste os arquivos do projeto sem alterar nada.', projectId: 'demo' } },
            skill: { summary: 'Comando com skill', value: { text: '@git-commit prepare um commit convencional', projectId: 'demo' } },
          } } },
        },
        responses: {
          '202': {
            description: 'Comando aceito; `taskId` identifica a tarefa criada ou enfileirada.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CommandAcceptedResponse' }, example: { accepted: true, taskId: 42 } } },
          },
          '400': {
            description: 'Payload inválido, projeto inexistente ou skill não encontrada.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
          '503': {
            description: 'O handler de comandos não está disponível nesta instância.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },
    '/api/settings/schema': {
      get: {
        tags: ['Configuração'],
        operationId: 'getSettingsSchema',
        summary: 'Obtém o catálogo de configurações',
        description: 'Retorna os campos aceitos pela tela de configurações e pela validação de rascunho. A resposta é somente leitura.',
        responses: {
          '200': {
            description: 'Catálogo de configurações disponíveis.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/SettingsSchemaResponse' }, example: { readOnly: true, settings: [{ key: 'HTTP_PORT', group: 'server', label: 'Porta HTTP', type: 'number', description: 'Porta usada pelo painel e pela API local.', defaultValue: '8787', restartRequired: 'bridge' }] } } },
          },
        },
      },
    },
    '/api/settings': {
      get: {
        tags: ['Configuração'],
        operationId: 'getSettings',
        summary: 'Consulta a configuração efetiva',
        description: 'Retorna valores efetivos e indicação de configuração. Segredos, como o token do Telegram, não são retornados; somente sua presença é informada.',
        responses: {
          '200': {
            description: 'Configuração efetiva em modo somente leitura.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/SettingsSnapshotResponse' }, example: { readOnly: true, settings: [{ key: 'TELEGRAM_BOT_TOKEN', group: 'telegram', label: 'Token do bot', type: 'secret', description: 'Credencial usada para acessar a Bot API.', configured: true, value: { configured: true }, restartRequired: 'bridge' }] } } },
          },
        },
      },
    },
    '/api/settings/validate': {
      post: {
        tags: ['Configuração'],
        operationId: 'validateSettings',
        summary: 'Valida um rascunho de configurações',
        description: 'Valida chaves e formatos sem gravar o `.env`, reiniciar o bridge ou alterar a configuração efetiva.',
        requestBody: {
          required: true,
          description: 'Objeto com os nomes das variáveis a validar. Os valores JSON são enviados como texto.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/SettingsDraft' }, example: { HTTP_PORT: '8787', CODEX_MODELS_JSON: '[]', CODEX_REASONING_EFFORTS_JSON: '["low"]' } } },
        },
        responses: {
          '200': {
            description: 'Rascunho válido.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/SettingsValidationResponse' }, example: { valid: true, errors: [], warnings: [] } } },
          },
          '422': {
            description: 'Rascunho recebido, mas contém erros de validação.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/SettingsValidationResponse' }, example: { valid: false, errors: [{ key: 'HTTP_PORT', message: 'A porta deve estar entre 1 e 65535.' }], warnings: [] } } },
          },
          '400': {
            description: 'Corpo ausente, JSON inválido ou formato de objeto não aceito.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      HealthResponse: {
        type: 'object',
        description: 'Resposta mínima de disponibilidade do servidor HTTP.',
        required: ['status'],
        properties: { status: { type: 'string', description: 'Estado do servidor. Atualmente retorna `ok`.', example: 'ok' } },
      },
      StatusTask: {
        type: 'object',
        description: 'Resumo de uma tarefa retornado pelo endpoint `/status`. Não contém todos os campos internos da tarefa.',
        required: ['id', 'projectId', 'text', 'status', 'createdAt'],
        properties: {
          id: { type: 'integer', description: 'Identificador interno da tarefa.', example: 42 },
          projectId: { type: 'string', description: 'Identificador estável do projeto selecionado.', example: 'demo' },
          text: { type: 'string', description: 'Instrução registrada para a tarefa.', example: 'Liste os arquivos do projeto.' },
          status: { $ref: '#/components/schemas/TaskStatus' },
          createdAt: { type: 'string', description: 'Data/hora de criação registrada pelo SQLite.', example: '2026-09-28 12:00:00' },
        },
      },
      TaskStatus: { type: 'string', description: 'Estado persistido da tarefa.', enum: ['queued', 'running', 'waiting_user', 'completed', 'failed', 'interrupted', 'unknown'], example: 'completed' },
      Event: {
        type: 'object',
        description: 'Mensagem ou mudança de estado registrada durante uma tarefa.',
        required: ['id', 'taskId', 'kind', 'text', 'createdAt'],
        properties: {
          id: { type: 'integer', description: 'Identificador interno do evento.', example: 101 },
          taskId: { type: 'integer', nullable: true, description: 'Tarefa relacionada; pode ser nulo para eventos gerais.', example: 42 },
          kind: { type: 'string', description: 'Tipo técnico do evento.', example: 'status' },
          text: { type: 'string', description: 'Conteúdo narrativo ou erro associado ao evento.', example: '[100%] Execução concluída.' },
          createdAt: { type: 'string', description: 'Data/hora de criação registrada pelo SQLite.', example: '2026-09-28 12:01:00' },
        },
      },
      HealthStatus: { type: 'string', description: 'Indicador textual do estado geral da resposta.', example: 'ok' },
      StatusResponse: { type: 'object', description: 'Tarefas recentes e estado HTTP do bridge.', required: ['status', 'tasks'], properties: { status: { $ref: '#/components/schemas/HealthStatus' }, tasks: { type: 'array', items: { $ref: '#/components/schemas/StatusTask' } } } },
      EventsResponse: { type: 'object', description: 'Coleção de eventos retornada pela consulta.', required: ['events'], properties: { events: { type: 'array', items: { $ref: '#/components/schemas/Event' } } } },
      Project: { type: 'object', description: 'Projeto configurado como diretório de trabalho do Codex.', required: ['id', 'name', 'cwd'], properties: { id: { type: 'string', description: 'Identificador usado em `projectId` e nos menus.', example: 'demo' }, name: { type: 'string', description: 'Nome exibido para o usuário.', example: 'Projeto demo' }, cwd: { type: 'string', description: 'Diretório absoluto acessível pelo processo do bridge.', example: '/workspace/projects/demo' } } },
      ProjectsResponse: { type: 'object', description: 'Projetos disponíveis nesta instância.', required: ['projects'], properties: { projects: { type: 'array', items: { $ref: '#/components/schemas/Project' } } } },
      CommandRequest: { type: 'object', description: 'Payload textual para criação ou enfileiramento de tarefa.', required: ['text'], properties: { text: { type: 'string', minLength: 1, description: 'Instrução do usuário; aceita `@skill` no início.', example: 'Liste os arquivos do projeto.' }, projectId: { type: 'string', description: 'Projeto de destino. Se omitido, usa o projeto padrão.', example: 'demo' } } },
      CommandAcceptedResponse: { type: 'object', description: 'Confirmação de que o comando virou uma tarefa.', required: ['accepted', 'taskId'], properties: { accepted: { type: 'boolean', example: true }, taskId: { type: 'integer', description: 'Identificador da tarefa criada ou enfileirada.', example: 42 } } },
      ErrorResponse: { type: 'object', description: 'Erro de processamento da requisição.', properties: { error: { type: 'string', description: 'Mensagem destinada ao diagnóstico do cliente.', example: 'text_required' } } },
      SettingDefinition: { type: 'object', description: 'Metadados de uma variável de configuração apresentada pelo bridge.', required: ['key', 'group', 'label', 'type', 'description', 'restartRequired'], properties: { key: { type: 'string', description: 'Nome exato da variável de ambiente aceita pelo bridge.', example: 'HTTP_PORT' }, group: { type: 'string', description: 'Grupo funcional usado para organizar a configuração na interface.', enum: ['telegram', 'projects', 'codex', 'server', 'startup'], example: 'server' }, label: { type: 'string', description: 'Rótulo amigável para exibição ao usuário.', example: 'Porta HTTP' }, type: { type: 'string', description: 'Formato esperado pelo validador do rascunho.', enum: ['secret', 'number', 'json', 'string'], example: 'number' }, description: { type: 'string', description: 'Orientação funcional sobre o uso da configuração.', example: 'Porta usada pelo painel e pela API local.' }, defaultValue: { type: 'string', description: 'Valor padrão quando a variável não está definida.', nullable: true, example: '8787' }, restartRequired: { type: 'string', description: 'Processo que precisa ser reiniciado para aplicar uma alteração.', enum: ['bridge', 'supervisor', 'launcher'], example: 'bridge' } } },
      SettingSnapshot: { allOf: [{ $ref: '#/components/schemas/SettingDefinition' }, { type: 'object', properties: { configured: { type: 'boolean', description: 'Indica se há valor configurado ou se o segredo está presente.' }, value: { description: 'Valor efetivo; segredos não expõem seu conteúdo.' } } }] },
      SettingsSchemaResponse: { type: 'object', description: 'Catálogo das configurações. O campo `readOnly` indica que a API não grava alterações.', required: ['settings', 'readOnly'], properties: { settings: { type: 'array', items: { $ref: '#/components/schemas/SettingDefinition' } }, readOnly: { type: 'boolean', example: true } } },
      SettingsSnapshotResponse: { type: 'object', description: 'Snapshot da configuração efetiva. O campo `readOnly` indica que a API não grava alterações.', required: ['settings', 'readOnly'], properties: { settings: { type: 'array', items: { $ref: '#/components/schemas/SettingSnapshot' } }, readOnly: { type: 'boolean', example: true } } },
      SettingsDraft: { type: 'object', description: 'Rascunho livre de variáveis conhecidas e seus valores textuais.', additionalProperties: { type: 'string' }, example: { HTTP_PORT: '8787' } },
      ValidationError: { type: 'object', required: ['key', 'message'], properties: { key: { type: 'string', example: 'HTTP_PORT' }, message: { type: 'string', example: 'A porta deve estar entre 1 e 65535.' } } },
      SettingsValidationResponse: { type: 'object', description: 'Resultado da validação de um rascunho, sem persistência.', required: ['valid', 'errors', 'warnings'], properties: { valid: { type: 'boolean', example: true }, errors: { type: 'array', items: { $ref: '#/components/schemas/ValidationError' } }, warnings: { type: 'array', items: { type: 'string' } } } },
    },
  },
} as const;

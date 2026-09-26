# Plano de desenvolvimento — Configurações do Codex Telegram Bridge

> Elaborado em 26/09/2026 a partir do código e dos arquivos locais.
> Entrega desta etapa: planejamento. As caixas de implementação permanecem abertas até existir a respectiva entrega e evidência de validação.

## 1. Objetivo e resultado esperado

Construir uma nova tela no navegador, em `/configuracoes`, para consultar e configurar **todos os parâmetros de ambiente do projeto**, inclusive os utilizados pelos scripts de inicialização. Usar componentes da **Watermelon UI**, com temas claro e escuro, interface em português e edição assistida dos campos estruturados.

Também disponibilizar as preferências existentes por chat, deixando explícito que elas são persistidas em SQLite. O usuário deve entender o que está salvo, o que está efetivamente em uso e o que depende de reinício.

### Critérios gerais de conclusão

- [ ] Todos os 15 parâmetros identificados neste levantamento têm campo, descrição, validação, origem e indicação de aplicação.
- [ ] Novos parâmetros identificados durante a construção entram no catálogo e no checklist antes da conclusão.
- [ ] É possível configurar Telegram, projetos, Codex, HTTP, banco e operação sem editar manualmente o `.env`.
- [ ] A interface permite consultar e alterar modelo, raciocínio e permissão por chat.
- [ ] Os componentes Watermelon efetivamente utilizados têm origem e licença registradas.
- [ ] A tela funciona integralmente em tema claro e escuro, inclusive diálogos e estados de erro.
- [ ] Salvar, validar e aplicar são operações distintas e explicadas na interface.
- [ ] As configurações continuam corretas após reiniciar pelos modos de execução suportados.
- [ ] Credenciais, histórico, sessões e tarefas existentes são preservados.
- [ ] O painel atual continua acessível e possui entrada para a nova tela.

## 2. Diagnóstico confirmado no projeto

| Área | Situação encontrada | Consequência para a construção |
| --- | --- | --- |
| Backend | Node.js/TypeScript; servidor nativo em `src/http.ts` | Acrescentar rotas e serviços sem pressupor Express |
| Interface | HTML, CSS e JavaScript em `web/` | Introduzir uma entrada React para a tela Watermelon |
| Build | `tsc` para backend e testes; sem compilação React | Criar build próprio de frontend e integrá-lo aos scripts |
| Ambiente | 11 variáveis em `.env.example`, também presentes no `.env` local | Cobertura inicial obrigatória de 11 campos |
| Inicialização | 4 variáveis adicionais em `start.sh` e `scripts/supervisor.mjs` | Cobertura total inicial de 15 parâmetros |
| Carregamento | `loadDotEnv()` em `src/config.ts`; parser simples; preserva valores não vazios herdados | Formalizar precedência, origem e serialização compatível |
| Configuração ativa | `loadConfig()` executado no início de `src/main.ts` | Gravar arquivo não atualiza objetos e clientes existentes |
| Preferências | SQLite e cache em memória por chat | Compartilhar serviço entre Telegram e tela para evitar cache desatualizado |
| Temas | `bridge-theme` no localStorage e atributo `data-theme` | Reutilizar convenção entre painel e configurações |
| HTTP | Rotas atuais não têm autenticação administrativa | Proteger edição de configurações e rotas operacionais relacionadas |
| Supervisor | Lê atraso do ambiente antes de iniciar filho; não carrega `.env` | Alteração do atraso exige suporte no supervisor e reinício dele |
| Launcher | `start.sh` lê variáveis do shell antes do Node; não carrega `.env` | Apenas gravar essas variáveis no arquivo não produz efeito hoje |
| Primeiro acesso | `PROJECTS_JSON` obrigatório antes de abrir HTTP | Planejar modo de configuração inicial quando ambiente estiver ausente/inválido |

Fontes locais: `src/config.ts`, `src/http.ts`, `src/main.ts`, `src/database.ts`, `src/types.ts`, `src/codex-client.ts`, `src/telegram.ts`, `.env.example`, `start.sh`, `scripts/supervisor.mjs`, `package.json`, `tsconfig.json`, `web/index.html`, `web/app.js` e `web/styles.css`.

O `.env` foi inspecionado apenas para identificar nomes de variáveis; este documento não contém seus valores privados. Há alterações locais preexistentes no repositório que devem ser preservadas durante a implementação.

## 3. Inventário completo de ambiente

Os valores abaixo são padrões do código ou exemplos públicos, não valores extraídos do `.env` privado. As validações indicadas são requisitos da nova tela/API; parte delas ainda não existe no backend atual.

### 3.1 Telegram

| Concluído | Variável | Campo e comportamento | Padrão / validação planejada | Aplicação |
| --- | --- | --- | --- | --- |
| [ ] | `TELEGRAM_BOT_TOKEN` | Credencial com ações manter, substituir e remover | Ausente; obrigatória junto do usuário para habilitar Telegram; nunca devolver valor salvo | Reiniciar bridge |
| [ ] | `TELEGRAM_ALLOWED_USER_ID` | ID do usuário autorizado | Ausente; inteiro positivo seguro; obrigatório ao habilitar bot | Reiniciar bridge |
| [ ] | `TELEGRAM_ALLOWED_CHAT_ID` | Restrição opcional de chat | Ausente; inteiro seguro, inclusive negativo; vazio significa sem restrição adicional de chat | Reiniciar bridge |

- [ ] Oferecer controle “Habilitar Telegram” como conveniência de formulário, sem inventar uma variável de ambiente equivalente.
- [ ] Explicar que remover o token desabilita o bot após aplicação.
- [ ] Rejeitar configuração parcial que pretenda habilitar bot sem usuário autorizado.
- [ ] Oferecer diagnóstico de credencial com chamada explícita a `getMe`, sem enviar mensagens nem alterar webhook.
- [ ] Limitar tempo do diagnóstico e sanitizar erros, pois a URL da Bot API contém a credencial.
- [ ] Explicar que `getMe` não comprova autorização do usuário/chat nem recebimento de mensagens.

### 3.2 Projetos

| Concluído | Variável | Campo e comportamento | Padrão / validação planejada | Aplicação |
| --- | --- | --- | --- | --- |
| [ ] | `PROJECTS_JSON` | Lista editável com `id`, `name`, `cwd`, inclusão, exclusão e ordenação | Obrigatória; ao menos um projeto; IDs únicos; strings não vazias; diretório absoluto existente | Reiniciar bridge |

- [ ] Usar formulário por projeto e visualização JSON sincronizada; texto JSON inválido não substitui dados válidos silenciosamente.
- [ ] Validar existência e acesso ao diretório no servidor, pois o caminho pertence à máquina do bridge.
- [ ] Informar que o primeiro projeto serve de padrão em fluxos sem seleção explícita.
- [ ] Explicar que IDs se relacionam a sessões e tarefas; mudança de ID não pode criar falsa continuidade.
- [ ] Bloquear aplicação de remoção/mudança de projeto com tarefas ativas, em fila ou aguardando usuário.
- [ ] Preservar histórico de projetos removidos; não apagar registros em cascata.
- [ ] Validar o tamanho em bytes dos callbacks Telegram que incorporam ID de projeto.

### 3.3 Codex

| Concluído | Variável | Campo e comportamento | Padrão / validação planejada | Aplicação |
| --- | --- | --- | --- | --- |
| [ ] | `CODEX_COMMAND` | Executável ou caminho | `codex`; não vazio; manter execução por `spawn` sem shell; não aceitar linha com argumentos como se fosse executável | Reiniciar bridge |
| [ ] | `CODEX_MODEL` | Modelo global opcional | Ausente: padrão do Codex; aceitar texto e seleção do catálogo configurado | Reiniciar bridge; indicar efeito em novas sessões |
| [ ] | `CODEX_MODELS_JSON` | Lista editável de modelos | `[]`; lista de strings não vazias, normalizadas e sem duplicatas | Reiniciar bridge |
| [ ] | `CODEX_REASONING_EFFORTS_JSON` | Seleção múltipla | `["low","medium","high"]`; valores atualmente aceitos: `low`, `medium`, `high`, `xhigh` | Reiniciar bridge |

- [ ] Exibir separadamente catálogo salvo e catálogo efetivo: o código inclui `CODEX_MODEL` entre os modelos disponíveis.
- [ ] Permitir lista de modelos vazia e explicar o estado do menu Telegram resultante.
- [ ] Definir explicitamente o comportamento da lista de esforços vazia, hoje aceita pelo parser.
- [ ] Validar tamanho dos callbacks de modelos considerando codificação URI e limite do Telegram.
- [ ] Não apresentar nomes cadastrados como prova de disponibilidade no provedor.
- [ ] Detectar preferências de chats que mencionam modelos/esforços removidos e exigir resolução explícita antes de aplicar.
- [ ] Explicar precedência de modelo por chat e modelo global, incluindo sessões já existentes.
- [ ] Diagnóstico do executável deve ter timeout e não iniciar tarefa, thread ou instalação.

### 3.4 Servidor e armazenamento

| Concluído | Variável | Campo e comportamento | Padrão / validação planejada | Aplicação |
| --- | --- | --- | --- | --- |
| [ ] | `DB_PATH` | Caminho do SQLite | `./data/bridge.sqlite`; resolver relativo à raiz; validar diretório pai e permissões | Reiniciar bridge; nunca migrar automaticamente |
| [ ] | `HTTP_HOST` | Endereço de escuta | `127.0.0.1`; validar hostname/IP suportado, incluindo IPv6 | Reiniciar bridge; conexão pode mudar |
| [ ] | `HTTP_PORT` | Porta | `8787`; inteiro de 1 a 65535 | Reiniciar bridge; conexão pode mudar |

- [ ] Diferenciar trocar arquivo de banco e migrar dados; informar quando o destino representa outro histórico.
- [ ] Preservar o arquivo antigo e evitar qualquer exclusão automática ao trocar `DB_PATH`.
- [ ] Verificar diretório do banco configurado; o `mkdirSync('data')` atual não cobre qualquer destino.
- [ ] Verificar conflito de porta como diagnóstico, mantendo tratamento de corrida no bind real.
- [ ] Mostrar URL de reconexão; traduzir `0.0.0.0` e `::` para endereço acessível adequado e formatar IPv6 corretamente.
- [ ] Exigir proteção administrativa antes de permitir exposição fora de loopback.

### 3.5 Inicialização e operação

| Concluído | Variável | Consumidor atual | Padrão / validação planejada | Aplicação |
| --- | --- | --- | --- | --- |
| [ ] | `BRIDGE_RESTART_DELAY_MS` | `scripts/supervisor.mjs` | `3000`; inteiro positivo em milissegundos, com faixa operacional documentada | Reiniciar supervisor |
| [ ] | `BRIDGE_LOG_FILE` | `start.sh` | `<raiz>/data/start.log`; caminho gravável, diretório pai válido | Reiniciar launcher |
| [ ] | `BRIDGE_LOCK_FILE` | `start.sh` | `<raiz>/data/bridge.lock`; caminho estável e exclusivo | Parada completa e nova inicialização do launcher |
| [ ] | `BRIDGE_SHUTDOWN_TIMEOUT` | `start.sh` | `30`; inteiro não negativo em segundos; zero tem efeito imediato | Reiniciar launcher |

- [ ] Incluir as quatro variáveis no `.env.example` com unidades, padrões e modos em que são utilizadas.
- [ ] Implementar leitura comum de ambiente pelos scripts antes de consumirem esses valores.
- [ ] Não usar `source .env` nem `eval`: valores são dados e não código shell.
- [ ] Definir helper de leitura independente de `dist`, pois o launcher precisa das opções antes do build.
- [ ] Normalizar caminhos relativos à raiz também no launcher; hoje caminhos relativos podem depender do diretório de invocação.
- [ ] Exibir “não utilizado neste modo de execução” quando uma opção não se aplicar ao processo atual.
- [ ] Diferenciar `npm start`, `start.sh` e `npm run supervise`; não pressupor reinício automático no launcher simples.
- [ ] Impedir dois consumidores Telegram ou duas instâncias após mudança de lock/reinício.

### 3.6 Cobertura futura e variáveis adicionais

- [ ] Criar catálogo central com nome, grupo, tipo, padrão, obrigatoriedade, sigilo, validação, consumidor e forma de aplicação.
- [ ] Comparar catálogo com leituras de ambiente em `src/`, `scripts/`, `start.sh` e `.env.example` em verificação automatizada.
- [ ] Considerar acessos indiretos como `required('PROJECTS_JSON')`, e não apenas `process.env.NOME`.
- [ ] Mostrar chaves adicionais já existentes no `.env` em área avançada, com indicação de consumidor desconhecido.
- [ ] Permitir manutenção explícita dessas chaves pelo administrador, preservando conteúdo não editado; tratar valores desconhecidos como sensíveis por padrão.
- [ ] Não prometer efeito para variável que nenhum consumidor conhece; não listar todo o ambiente do sistema.
- [ ] Tratar `BRIDGE_SETUP_TOKEN` citado no README como variável temporária de exemplos de diagnóstico, não como configuração persistente da aplicação.
- [ ] Não transformar variáveis internas do Bash, `PATH`, `HOME` ou configuração externa do Codex em campos do `.env` do bridge sem consumidor e contrato definidos.

## 4. Configurações que não pertencem ao `.env`

| Configuração | Origem/persistência | Requisito |
| --- | --- | --- |
| Modelo por chat | Tabela `preferences`, campo `model` | Selecionar ou limpar para herdar padrão |
| Raciocínio por chat | Tabela `preferences`, campo `effort` | Selecionar valor permitido ou limpar |
| Permissão por chat | Tabela `preferences`, campo `permission_level` | `safe`, `workspace`, `full`; padrão efetivo atual `workspace` |
| Tema | localStorage `bridge-theme` | Claro e escuro; opção sistema como extensão compatível |
| Projeto selecionado por chat | Mapa em memória em `src/main.ts` | Mostrar estado quando disponível; explicar perda na reinicialização |

- [ ] Implementar listagem e edição de preferências por chat no mesmo serviço utilizado pelo Telegram.
- [ ] Ao salvar pela web, atualizar ou invalidar o cache `preferencesByChat` imediatamente.
- [ ] Explicar que a preferência afeta próximas tarefas/turnos; não alterar execução já em curso.
- [ ] Mostrar descrição de cada nível de permissão conforme mapeamento real em `src/codex-client.ts`.
- [ ] Solicitar confirmação específica ao escolher acesso total.
- [ ] Oferecer restauração para herança de padrões sem remover histórico do chat.
- [ ] Caso se ofereça mudança do projeto selecionado pela web, aplicá-la ao mesmo mapa e deixar sua natureza temporária explícita.

## 5. Arquitetura proposta

### 5.1 Frontend e integração

- [ ] Criar `frontend/` com React, TypeScript e Vite, versões fixadas no lockfile e compatíveis com os componentes selecionados.
- [ ] Configurar estilos e dependências exigidos pelo código Watermelon realmente escolhido; confirmar antes de instalar.
- [ ] Publicar a entrada em `/configuracoes` e assets sob prefixo próprio, por exemplo `/configuracoes/assets/`.
- [ ] Servir artefatos estáticos compilados pelo servidor Node existente, com tipos MIME e tratamento de arquivo ausente.
- [ ] Impedir travessia de diretórios; não servir raiz do repositório, `.env`, SQLite ou backups.
- [ ] Manter `/`, `/hello-world`, `/app.js` e `/styles.css` funcionando.
- [ ] Acrescentar botão “Configurações” no cabeçalho do painel atual e retorno ao painel na nova tela.
- [ ] Configurar proxy de desenvolvimento e uso da mesma origem no build de produção.
- [ ] Integrar `build:server`, `build:web` e `build`; garantir que `start.sh` e supervisor encontrem todos os artefatos.
- [ ] Manter erros do frontend desacoplados da capacidade de iniciar o backend já compilado.

### 5.2 Organização prevista de arquivos

```text
src/
  config.ts                         # Resolução da configuração ativa
  settings/
    catalog.ts                      # Metadados dos parâmetros
    validation.ts                   # Validação pura e regras cruzadas
    env-store.ts                    # Leitura, revisão e escrita atômica
    service.ts                      # Salvar, comparar, diagnosticar e aplicar
    preferences-service.ts          # SQLite e cache compartilhados
    auth.ts                         # Sessão administrativa
    routes.ts                       # Contratos HTTP da área administrativa
frontend/
  src/
    pages/settings-page.tsx
    components/ui/                  # Componentes Watermelon incorporados
    components/settings/            # Campos, grupos e revisão de alterações
    sections/                       # Telegram, projetos, Codex, servidor etc.
    lib/api.ts
    lib/theme.ts
    styles/theme.css
  vite.config.ts
scripts/
  env-reader.mjs                     # Leitura segura antes do build
  supervisor.mjs                    # Integração de aplicação/reinício
docs/
  watermelon-components.md          # Origem, revisão, licença e adaptações
test/
  settings-*.test.ts
```

A estrutura é proposta; ajustar nomes conforme implementação, preservando responsabilidades e evitando duas regras divergentes para o mesmo parâmetro.

## 6. Watermelon UI: seleção e uso obrigatório

Referência solicitada: [catálogo de componentes](https://ui.watermelon.sh/components). A documentação pública descreve componentes e exemplos React com fontes consultáveis, além de entradas de catálogo e repositórios. Referências: [guia para ferramentas](https://ui.watermelon.sh/llms.txt), [API pública](https://ui.watermelon.sh/api/docs) e [repositório da plataforma](https://github.com/WatermelonCorp/watermelon-platform).

**Limite desta pesquisa:** a leitura pública de `/components` retornou apresentação geral, sem lista individual de componentes; a consulta direta ao catálogo JSON retornou HTTP 403 neste ambiente. Portanto, nomes abaixo são necessidades da tela, não afirmações de que existe um componente Watermelon com esse identificador. A seleção precisa e a obtenção do código são uma entrega obrigatória da fase 1.

| Necessidade da tela | Peça a localizar no catálogo | Uso previsto |
| --- | --- | --- |
| Estrutura de configurações | Layout de settings/dashboard com navegação | Cabeçalho, navegação por seções e conteúdo |
| Agrupamento | Cartões, separadores e abas | Grupos de configuração e estados |
| Formulários | Input, label, select, checkbox/switch, textarea | Campos simples e listas |
| Listas estruturadas | Tabela/lista e diálogo | Projetos, modelos e preferências por chat |
| Revisão e confirmação | Dialog/alert dialog e badges | Alterações, descarte e reinício |
| Feedback | Alert, toast e skeleton | Erros, confirmação, carregamento |
| Tema e mobile | Alternador de tema e menu/drawer | Claro/escuro e navegação compacta |

- [ ] Localizar exemplos reais para cada necessidade na biblioteca indicada.
- [ ] Registrar URL, identificador, arquivo de origem, revisão, licença e dependências de cada componente incorporado.
- [ ] Usar o código dos componentes selecionados; sem considerar apenas uma aparência semelhante como atendimento do requisito.
- [ ] Verificar licença individual de exemplos que provenham de terceiros.
- [ ] Fazer composição local apenas onde não houver peça apropriada, documentando quais componentes Watermelon a compõem.
- [ ] Não pressupor pacote npm ou comando de instalação da biblioteca sem confirmação no projeto oficial.
- [ ] Compilar recursos localmente, sem carregar código remoto em tempo de uso da tela administrativa.
- [ ] Adaptar rótulos para português e verificar teclado, foco e contraste após as adaptações.

## 7. Organização visual e interação

### 7.1 Estrutura da página

```text
Cabeçalho: Voltar ao painel | Configurações | Estado da conexão | Tema
Navegação: Geral / Telegram / Projetos / Codex / Servidor e banco /
           Inicialização / Preferências por chat / Avançado
Conteúdo: título, explicação, campos e estado de aplicação
Rodapé fixo: quantidade de alterações | Descartar | Validar | Salvar alterações
Após salvar: indicação de pendências e ação Aplicar/Reiniciar quando disponível
```

- [ ] Em “Geral”, resumir bot, quantidade de projetos, servidor, modo de execução e pendências.
- [ ] Permitir busca por nome técnico e rótulo, inclusive por `BRIDGE_RESTART_DELAY_MS`.
- [ ] Exibir nome técnico, descrição, unidade, padrão e origem junto ao campo ou em ajuda acessível.
- [ ] Diferenciar valor salvo no arquivo, valor herdado do ambiente e valor efetivo no processo.
- [ ] Marcar alterações locais, erros, valores herdados e alterações pendentes de reinício.
- [ ] Manter edição ao navegar entre seções; não perder formulário por atualização automática.
- [ ] Pedir confirmação ao sair com alterações; descarte retorna ao último estado carregado.
- [ ] Destacar primeiro erro e levar foco ao campo correspondente ao validar/salvar.
- [ ] Mostrar revisão agrupada antes/depois, sempre mascarando segredos.
- [ ] Não substituir tela inteira por carregamento ao salvar; preservar foco e contexto.
- [ ] Adaptar navegação a celular e garantir que o rodapé não cubra os últimos campos.
- [ ] Desabilitar somente ações incompatíveis com operação em curso e impedir envios duplicados.

### 7.2 Temas claro e escuro

- [ ] Definir tokens semânticos para fundo, superfície, texto, borda, foco, sucesso, atenção e erro.
- [ ] Reutilizar `bridge-theme` e sincronizar tema ao transitar entre painel e configurações.
- [ ] Aplicar tema antes da primeira pintura para evitar flash de cores incorretas.
- [ ] Se houver opção “Sistema”, atualizar também a leitura do painel legado e observar `prefers-color-scheme`.
- [ ] Tratar localStorage indisponível sem impedir abertura da tela.
- [ ] Cobrir inputs, tabelas, modais, menus, tooltips, editor JSON, toast e estados desabilitados nos dois temas.
- [ ] Usar contraste acessível, foco visível, rótulos explícitos e mensagens que não dependam apenas de cor.
- [ ] Respeitar preferência por movimento reduzido nas peças animadas.
- [ ] Validar layouts em 360 px, 768 px e 1440 px, zoom de 200% e navegação por teclado.

## 8. Contratos HTTP propostos

Todos os endpoints abaixo são novos e administrativos. Reutilizar o servidor HTTP atual; validar requisições no backend independentemente do frontend.

| Método e rota | Finalidade | Resposta/condição principal |
| --- | --- | --- |
| `GET /api/settings/schema` | Catálogo e capacidades | Tipos, defaults, regras, grupos, reinícios disponíveis |
| `GET /api/settings` | Estado editável e efetivo | Revisão opaca, valores não sensíveis, presença de segredos, origem e pendências |
| `POST /api/settings/validate` | Validar rascunho sem persistir | Erros por campo, avisos e impacto de aplicação |
| `PUT /api/settings` | Persistir alterações do ambiente | Nova revisão e indicação `restartRequired` por escopo |
| `POST /api/settings/diagnostics` | Diagnóstico explícito | Resultados por tipo, sem executar tarefa de usuário |
| `POST /api/settings/apply` | Solicitar aplicação suportada | `202` com operação; ou bloqueio por tarefas/modo de execução |
| `GET /api/settings/operations/:id` | Consultar aplicação | Pendente, em aplicação, concluída, falhou ou requer ação manual |
| `GET /api/settings/chats` | Listar preferências | Chats conhecidos e valores salvos/efetivos |
| `PUT /api/settings/chats/:chatId` | Alterar preferência | Preferência persistida e cache atualizado |
| `POST /api/settings/session` | Abrir sessão administrativa | Cookie protegido; jamais token na URL |
| `DELETE /api/settings/session` | Encerrar sessão | Revogação e remoção do cookie |

### Regras dos contratos

- [ ] Usar revisão opaca ou `If-Match`; responder `409` se arquivo mudar desde a leitura.
- [ ] Representar credencial como operação explícita: `keep`, `replace` com novo valor ou `remove`.
- [ ] Nunca usar a máscara visual como valor persistível.
- [ ] Distinguir remoção da chave, texto vazio e uso do padrão conforme regra do campo.
- [ ] Usar IDs de chat como strings decimais na API e validar conversão segura no backend.
- [ ] Aplicar limites de tamanho ao corpo, listas e strings; tratar interrupção e JSON inválido.
- [ ] Padronizar `400` sintaxe, `401/403` acesso, `409` conflito/estado, `422` validação e `500` falha interna sanitizada.
- [ ] Separar estado salvo do estado aplicado em todas as respostas relevantes.
- [ ] Não permitir que o cliente escolha o caminho do `.env` a editar.
- [ ] Persistir metadados mínimos de operação para consulta após reinício, inclusive ao trocar banco; nunca incluir credenciais.

## 9. Persistência, precedência e proteção de dados

### 9.1 Leitura e escrita do `.env`

- [ ] Definir gramática de `.env` suportada e parser/serializer único: aspas, espaços, `#`, `=`, escapes, JSON e finais de linha.
- [ ] Preservar comentários, ordem e chaves não alteradas; detectar duplicatas e pedir resolução explícita.
- [ ] Recusar escrita quando o documento não puder ser interpretado sem perda de conteúdo.
- [ ] Validar o documento resultante antes de substituir o original.
- [ ] Escrever temporário no mesmo diretório, ajustar permissões e substituir por rename atômico.
- [ ] Serializar gravações e revisar hash/versão imediatamente antes do commit do arquivo.
- [ ] Preservar proprietário e modo seguro; novos arquivos/backup com acesso restrito ao usuário do serviço.
- [ ] Manter backup anterior com política limitada de retenção, fora das rotas estáticas e ignorado pelo Git.
- [ ] Em falha de escrita, manter original e rascunho; não emitir mensagem de sucesso.
- [ ] Não persistir rascunhos com credenciais no localStorage ou sessionStorage.

### 9.2 Precedência e aplicação real

- [ ] Formalizar precedência: ambiente externo explicitamente definido, arquivo `.env`, padrão do catálogo.
- [ ] Decidir e documentar semântica de string vazia; o carregador atual usa teste de valor truthy.
- [ ] Capturar origem antes de mesclar `.env` ao ambiente, evitando atribuir origem externa a valores carregados do arquivo.
- [ ] Mostrar quando um valor herdado impede que a edição do `.env` tenha efeito.
- [ ] Oferecer instrução concreta para alterar/remover override externo; não declarar aplicação enquanto ele prevalecer.
- [ ] Garantir que reinício do filho releia o arquivo atualizado sem valores antigos injetados pelo launcher/supervisor.
- [ ] Ler opções do launcher/supervisor sem exportar indiscriminadamente todo o `.env` ao filho.
- [ ] Comparar snapshot ativo com snapshot salvo para calcular pendências, inclusive após reabrir a página.

### 9.3 Acesso administrativo

- [ ] Implementar primeiro acesso local por segredo de bootstrap aleatório apresentado no terminal e trocado por sessão.
- [ ] Guardar material administrativo em arquivo protegido sob `data/`, fora do `.env` editável e das rotas estáticas; documentar recuperação local.
- [ ] Usar cookie HttpOnly, SameSite e Secure quando em HTTPS, expiração e revogação de sessão.
- [ ] Validar Host/Origin e CSRF nas mutações; rejeitar origens não confiáveis mesmo em loopback.
- [ ] Proteger também `/commands` e dados operacionais ao habilitar acesso remoto; não deixar execução aberta ao lado de configuração autenticada.
- [ ] Não retornar token salvo em leitura, erro, diff, log, auditoria ou diagnóstico.
- [ ] Configurar `Cache-Control: no-store` nas respostas administrativas e evitar captura de payloads sensíveis nos logs.
- [ ] Registrar autor, horário, nomes das chaves alteradas e resultado, sem valores secretos.
- [ ] Se novas variáveis de autenticação forem necessárias, adicioná-las ao inventário, catálogo e UI antes de encerrar a entrega.

## 10. Salvar, aplicar e recuperar

### Fluxo normal

1. Carregar catálogo, configuração mascarada, revisão e capacidades de execução.
2. Editar campos e validar localmente sem perder rascunho.
3. Validar no servidor e apresentar alterações e impacto.
4. Salvar atomicamente o `.env`; preferências de chat são salvas separadamente no SQLite.
5. Exibir “Salvo; aguardando reinício” quando aplicável.
6. Aplicar conforme modo de execução, ou apresentar comando/manual de reinício correspondente.
7. Reconectar ao endereço resultante e conferir revisão efetivamente carregada.
8. Mostrar conclusão apenas depois da confirmação do processo novo.

- [ ] Escolher, para a primeira versão, reinício controlado do bridge para alterações globais, evitando hot reload parcial de clientes.
- [ ] Permitir salvar com tarefas ativas, mas bloquear aplicação enquanto houver execução, fila ou aprovação pendente.
- [ ] Não cancelar ou repetir tarefas automaticamente para aplicar configuração.
- [ ] Em modo sem supervisor, informar necessidade de reinício manual; não encerrar o único processo prometendo retorno automático.
- [ ] Para parâmetros do supervisor/launcher, informar que reiniciar somente o bridge é insuficiente.
- [ ] Validar configurações antes do restart e preservar último estado conhecido.
- [ ] Ao perder conexão, exibir progresso e timeout; não confundir erro de rede com falha comprovada de gravação.
- [ ] Quando a origem HTTP mudar, explicar necessidade de autenticar novamente; não transportar credencial na URL de reconexão.
- [ ] Documentar recuperação local com backup caso porta, host, banco ou comando impeçam reinício.
- [ ] Proteger restauração contra sobrescrever edição posterior: exigir revisão compatível também no rollback.

### Configuração inicial e ambiente inválido

- [ ] Separar inicialização do servidor de configuração da inicialização do bot, banco operacional e cliente Codex.
- [ ] Abrir modo de setup restrito a loopback quando faltar `.env` ou `PROJECTS_JSON` estiver inválido.
- [ ] Nesse modo, disponibilizar autenticação/bootstrap e formulário; bloquear submissão de tarefas.
- [ ] Usar host/porta de recuperação documentados e tratar porta ocupada sem exposição automática na rede.
- [ ] Mostrar erros estruturados sem imprimir conteúdo sensível do arquivo.
- [ ] Permitir salvar primeira configuração válida e indicar como iniciar o modo operacional.

## 11. Fases de execução e entregáveis

Percentuais abaixo são pesos sugeridos para acompanhar **a futura implementação**, não progresso já realizado.

### Fase 0 — Consolidar contratos e cobertura (10%)

- [ ] Revalidar inventário contra checkout usado na implementação.
- [ ] Fechar semântica de vazio/ausente, precedência, paths e callbacks.
- [ ] Criar catálogo tipado dos 15 parâmetros e metadados de aplicação.
- [ ] Documentar contratos HTTP e estados da configuração.
- [ ] Fechar desenho de autenticação, setup e reinício para cada modo de execução.

**Saída:** catálogo completo e decisões suficientes para implementar sem campos omitidos.

### Fase 1 — Watermelon e fundação visual (15%; acumulado 25%)

- [ ] Obter exemplos reais Watermelon e registrar fontes/licenças.
- [ ] Configurar React, compilação, estilos, assets e rota `/configuracoes`.
- [ ] Construir layout, navegação, formulários-base e feedback com as peças selecionadas.
- [ ] Implementar claro/escuro e compatibilidade com tema do painel.
- [ ] Acrescentar navegação entre painel atual e configurações.

**Saída:** tela navegável nos dois temas com dados de demonstração claramente identificados durante desenvolvimento.

### Fase 2 — Backend de configuração e sessão (20%; acumulado 45%)

- [ ] Implementar autenticação e proteção de rotas.
- [ ] Implementar parser, armazenamento atômico, revisão e backups.
- [ ] Implementar schema, leitura, validação e gravação.
- [ ] Implementar origem dos valores e cálculo de pendências.
- [ ] Implementar proteção de segredos e tratamento uniforme de erros.

**Saída:** API administrativa persistindo configuração válida e preservando arquivo em caso de erro.

### Fase 3 — Formulários completos (20%; acumulado 65%)

- [ ] Implementar Telegram e credenciais.
- [ ] Implementar projetos com editor estruturado e JSON.
- [ ] Implementar modelos, modelo padrão e esforços.
- [ ] Implementar servidor, banco e quatro parâmetros operacionais.
- [ ] Implementar preferências por chat e integração de cache.
- [ ] Implementar busca, área avançada, revisão de mudanças e estados de erro/sucesso.
- [ ] Substituir dados de demonstração pela API em todas as seções.

**Saída:** todos os parâmetros podem ser consultados e persistidos pela tela.

### Fase 4 — Aplicação e ciclo de vida (15%; acumulado 80%)

- [ ] Unificar leitura segura com launcher e supervisor.
- [ ] Implementar modo inicial com configuração inválida/ausente.
- [ ] Implementar diagnósticos, bloqueios por tarefas e aplicação por capacidade.
- [ ] Implementar reconexão, confirmação de revisão e operação persistida.
- [ ] Documentar recuperação e troca de banco/endereço.

**Saída:** configuração salva produz o efeito anunciado em cada modo de execução.

### Fase 5 — Validação, acabamento e documentação (20%; acumulado 100%)

- [ ] Executar matriz de testes abaixo e corrigir falhas encontradas.
- [ ] Revisar cobertura integral do inventário.
- [ ] Revisar acessibilidade, responsividade e ambos os temas.
- [ ] Atualizar README, `.env.example` e documentação de componentes.
- [ ] Registrar evidências e limitações residuais reais.
- [ ] Marcar a entrega como concluída somente com critérios gerais atendidos.

**Dependências:** fase 0 precede contratos; fase 1 e fase 2 fornecem base para fase 3; fase 4 depende da persistência e contratos; fase 5 encerra a entrega completa.

## 12. Matriz de validação planejada

Executar cenários com `.env` temporário, SQLite isolado e serviços simulados quando possível. Não usar bot real ou dados do usuário para testes destrutivos.

| Concluído | Camada | Cenário e resultado esperado |
| --- | --- | --- |
| [ ] | Cobertura | Todos os parâmetros consumidos estão no catálogo, exemplo e formulário |
| [ ] | Parser | JSON, aspas, `#`, `=`, Unicode, CRLF, vazio e ausência fazem round trip sem corrupção |
| [ ] | Parser | Duplicatas e conteúdo inválido geram erro sem sobrescrita |
| [ ] | Persistência | Falha de permissão/disco mantém arquivo anterior e não indica sucesso |
| [ ] | Concorrência | Duas abas ou edição externa causam conflito detectável, sem perda silenciosa |
| [ ] | Segurança | Leitura, logs, diagnósticos, backups HTTP e erros não expõem token |
| [ ] | Segurança | Sessão ausente, CSRF, origem indevida e traversal são rejeitados |
| [ ] | Credenciais | Manter/substituir/remover têm efeitos distintos e nunca salvam máscara |
| [ ] | Telegram | ID negativo de chat é aceito; usuário inválido e configuração parcial são recusados |
| [ ] | Projetos | IDs repetidos, caminho inválido e remoção com tarefa pendente são tratados |
| [ ] | Codex | Catálogo vazio, modelo global e preferência órfã têm comportamento explícito |
| [ ] | Preferências | Edição web aparece no próximo uso pelo Telegram sem cache antigo |
| [ ] | Ambiente | Override externo aparece corretamente e não é anunciado como substituído |
| [ ] | Inicialização | Ausência/erro de `.env` abre setup local recuperável |
| [ ] | Operação | Cada um dos quatro parâmetros de scripts funciona no consumidor correto |
| [ ] | Reinício | Tarefa ativa impede aplicação; nenhuma tarefa é repetida automaticamente |
| [ ] | Reinício | Processo novo confirma revisão, endereço e estado; supervisor não duplica instâncias |
| [ ] | Banco | Troca de caminho não apaga nem migra histórico automaticamente |
| [ ] | UI | Erro, loading, sessão expirada, conflito e perda de conexão preservam contexto |
| [ ] | UI | Teclado, foco, zoom e tamanhos definidos funcionam nos dois temas |
| [ ] | Regressão | Painel, envio de tarefa, eventos, projetos e Hello World continuam disponíveis conforme autenticação |
| [ ] | Build | Build do servidor/frontend e testes existentes passam com scripts atualizados |

## 13. Riscos concretos e respostas planejadas

| Risco | Resposta |
| --- | --- |
| Catálogo Watermelon inacessível por um canal | Consultar navegador/repositório oficial; registrar componentes reais antes de declarar uso |
| `.env` salvo sem efeito no launcher | Helper comum antes do build e validação por modo de execução |
| Valores antigos herdados após restart | Separar ambiente externo do arquivo e controlar o que é passado ao filho |
| Reinício interrompe trabalho | Bloqueio por tarefas/filas/aprovações e aplicação posterior explícita |
| Exposição de execução remota | Autenticação administrativa e proteção conjunta das rotas operacionais |
| Configuração inválida impede abrir tela | Modo setup local desacoplado dos serviços operacionais |
| Preferência salva diverge do cache | Serviço único de preferências com invalidação imediata |
| Alteração de host/porta impede retorno | URL correta, reautenticação e procedimento de recuperação local |
| Mudança de lock permite segunda instância | Exigir encerramento completo do launcher antes da troca |
| Mudança do banco aparenta perda de dados | Explicação prévia, preservação do arquivo e ausência de migração automática |

## 14. Registro de acompanhamento

Preencher durante a execução; referências podem apontar para arquivo, commit, captura ou relatório de validação. Não registrar valores secretos nas evidências.

| Fase | Estado | Responsável | Início | Conclusão | Evidência / pendência |
| --- | --- | --- | --- | --- | --- |
| 0 — Contratos e catálogo | A fazer | — | — | — | — |
| 1 — Watermelon e temas | A fazer | — | — | — | — |
| 2 — Backend e sessão | A fazer | — | — | — | — |
| 3 — Formulários completos | A fazer | — | — | — | — |
| 4 — Aplicação e operação | A fazer | — | — | — | — |
| 5 — Validação e documentação | A fazer | — | — | — | — |

### Checklist final de aceite

- [ ] Cobertura de 15/15 parâmetros iniciais, mais quaisquer novas configurações introduzidas.
- [ ] Nenhum parâmetro consumido permanece sem acesso ou explicação na tela.
- [ ] Componentes Watermelon identificados e incorporados de fontes reais.
- [ ] Temas claro e escuro completos e consistentes com o painel.
- [ ] Persistência segura, revisão concorrente e recuperação comprovadas.
- [ ] Aplicação e reinício descritos com fidelidade para todos os modos suportados.
- [ ] Preferências por chat consistentes entre web, SQLite e Telegram.
- [ ] Critérios da matriz de validação concluídos e documentados.
- [ ] README e `.env.example` refletem a implementação entregue.
- [ ] Checkboxes atualizados conforme evidência, sem marcar como pronto apenas por existir código.

## 15. Progresso de implementação — 26/09/2026

Primeira fatia implementada no projeto:

- [x] Catálogo tipado inicial dos 15 parâmetros em `src/settings.ts`.
- [x] Endpoint somente leitura `GET /api/settings/schema`.
- [x] Endpoint somente leitura `GET /api/settings`, com token do Telegram mascarado.
- [x] Rota web `/configuracoes` e recursos estáticos da tela.
- [x] Link de entrada no dashboard principal.
- [x] Reutilização do tema claro/escuro existente do painel.
- [x] Teste HTTP cobrindo a página e a presença dos 15 parâmetros.

Limites desta etapa:

- [ ] A tela ainda não grava `.env`.
- [ ] A tela ainda não possui autenticação administrativa.
- [ ] A seleção e incorporação dos componentes específicos Watermelon continuam pendentes de confirmação no catálogo.
- [ ] A API ainda não aplica mudanças nem reinicia processos.

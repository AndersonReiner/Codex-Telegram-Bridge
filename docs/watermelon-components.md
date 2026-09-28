# Watermelon UI na tela de configurações

Fonte: https://github.com/WatermelonCorp/watermellon-registry

Revisão incorporada: `a3e4abca3667cc73c460f7876c14190fcdb9483c`.

Os arquivos em `frontend/components/ui/` foram incorporados do diretório
`src/components/ui/` dessa revisão. Componentes: Button, Card, Badge, Input,
Textarea, Switch, Tabs, Dialog, Tooltip, Separator e Skeleton. O utilitário
`frontend/lib/utils.ts` vem de `src/lib/utils.ts` do mesmo registry.

Licença MIT original preservada em `docs/licenses/watermelon-MIT.txt`.
As primitivas usam React, Radix UI, Tailwind CSS, Lucide, class-variance-authority,
clsx e tailwind-merge. Não há dependência do site Watermelon em tempo de execução.
O lockfile fixa as versões instaladas.

A composição da sidebar, cartões de resumo, formulário, paletas e barra de ações
foi feita para o Bridge usando essas primitivas. Os tokens e estilos locais estão
em `frontend/styles.css`. O botão de fechamento de diálogo foi traduzido para
português. Nenhuma classificação externa de qualidade é atribuída a este layout.

Build: `npm run build:web`. A saída fica em `dist/settings/`, servida nas rotas
`/configuracoes.js` e `/configuracoes.css`. O HTML não carrega mais os estilos ou
o JavaScript da antiga tela. `npm run build` compila backend e frontend.
Os links simbólicos `web/configuracoes.js` e `web/configuracoes.css` apontam para
esses mesmos artefatos para compatibilidade com instâncias já iniciadas do servidor.
Não há uma segunda implementação da interface nesses caminhos.

Validação no navegador: `npm run test:ui` usa Chromium do Playwright com um servidor
isolado em `127.0.0.1:8791`, SQLite em memória e dados fictícios. Instale o navegador
com `npx playwright install chromium` em um ambiente novo.

Privacidade: o token salvo nunca é devolvido pela API nem inserido no DOM. Somente
um token novo digitado pelo usuário pode ser revelado, com confirmação, por 15
segundos; perde visibilidade ao sair da aba, perder foco ou ativar privacidade.
O rascunho permanece na memória da página e não é escrito no armazenamento do navegador.
IDs e caminhos ficam ocultos enquanto a privacidade está ativa.

Esta entrega reformula a interface e a validação. Persistência do `.env`, login
administrativo e aplicação de mudanças continuam etapas separadas do plano.

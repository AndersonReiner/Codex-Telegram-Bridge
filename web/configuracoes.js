const $ = (selector) => document.querySelector(selector);
const savedTheme = localStorage.getItem('bridge-theme');
if (savedTheme === 'light') { document.documentElement.dataset.theme = 'light'; $('#theme-toggle').innerHTML = '☾ <span>Modo escuro</span>'; }
$('#theme-toggle').addEventListener('click', () => {
  const light = document.documentElement.dataset.theme !== 'light';
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
  localStorage.setItem('bridge-theme', light ? 'light' : 'dark');
  $('#theme-toggle').innerHTML = light ? '☾ <span>Modo escuro</span>' : '☼ <span>Modo claro</span>';
});

const labels = { telegram: 'Telegram', projects: 'Projetos', codex: 'Codex', server: 'Servidor e banco', startup: 'Inicialização' };
const restartLabels = { bridge: 'reinicia o bridge', supervisor: 'reinicia o supervisor', launcher: 'reinicia o launcher' };
function valueText(setting) {
  if (setting.key === 'TELEGRAM_BOT_TOKEN') return setting.configured ? 'Configurado (valor oculto)' : 'Não configurado';
  if (!setting.configured) return 'Ausente; usando padrão ou configuração externa';
  return typeof setting.value === 'string' ? setting.value : JSON.stringify(setting.value);
}
function render(data) {
  const groups = new Map();
  for (const setting of data.settings) (groups.get(setting.group) || groups.set(setting.group, []).get(setting.group)).push(setting);
  $('#settings').innerHTML = [...groups.entries()].map(([group, settings]) => `<section class="panel settings-group"><div class="panel-heading"><div><p class="eyebrow">${labels[group]}</p><h2>${settings.length} parâmetros</h2></div></div><div class="settings-list">${settings.map((setting) => `<article class="setting-row"><div><strong>${setting.label}</strong><code>${setting.key}</code><p class="muted">${setting.description}</p></div><div class="setting-value"><span>${valueText(setting)}</span><small>${restartLabels[setting.restartRequired]}</small></div></article>`).join('')}</div></section>`).join('');
}
fetch('/api/settings', { cache: 'no-store' }).then((response) => { if (!response.ok) throw new Error('Não foi possível carregar as configurações.'); return response.json(); }).then(render).catch((error) => { $('#settings').innerHTML = `<div class="empty">${error.message}</div>`; });

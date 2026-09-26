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
let currentSettings = [];
function inputValue(setting) { if (!setting.configured || setting.key === 'TELEGRAM_BOT_TOKEN') return ''; return setting.type === 'json' ? JSON.stringify(setting.value, null, 2) : String(setting.value ?? ''); }
function showFeedback(text, error = false) { $('#settings-feedback').textContent = text; $('#settings-feedback').className = error ? 'settings-error' : 'muted'; }
function render(data, filter = '') {
  currentSettings = data.settings; const groups = new Map(); const normalized = filter.trim().toLocaleLowerCase('pt-BR');
  for (const setting of currentSettings) { if (normalized && !`${setting.key} ${setting.label} ${setting.description}`.toLocaleLowerCase('pt-BR').includes(normalized)) continue; const group = groups.get(setting.group) || []; group.push(setting); groups.set(setting.group, group); }
  $('#settings').innerHTML = [...groups.entries()].map(([group, settings]) => `<section class="panel settings-group"><div class="panel-heading"><div><p class="eyebrow">${labels[group]}</p><h2>${settings.length} parâmetros</h2></div></div><div class="settings-list">${settings.map((setting) => `<article class="setting-row"><div class="setting-description"><strong>${setting.label}</strong><code>${setting.key}</code><p class="muted">${setting.description}</p><small>${restartLabels[setting.restartRequired]}</small></div><div class="setting-editor"><label class="sr-only" for="setting-${setting.key}">${setting.label}</label>${setting.type === 'secret' ? `<input id="setting-${setting.key}" data-setting="${setting.key}" type="password" placeholder="${setting.configured ? 'Configurado; deixe vazio para manter' : 'Não configurado'}" autocomplete="new-password">` : `<textarea id="setting-${setting.key}" data-setting="${setting.key}" rows="${setting.type === 'json' ? '4' : '1'}">${inputValue(setting)}</textarea>`}</div></article>`).join('')}</div></section>`).join('') || '<div class="empty">Nenhum parâmetro corresponde à busca.</div>';
}
function draft() { return Object.fromEntries([...document.querySelectorAll('[data-setting]')].map((field) => [field.dataset.setting, field.value]).filter(([, value]) => value !== '')); }
$('#settings-search').addEventListener('input', (event) => render({ settings: currentSettings }, event.target.value));
$('#reset-settings').addEventListener('click', () => render({ settings: currentSettings }, $('#settings-search').value));
$('#settings-form').addEventListener('submit', async (event) => { event.preventDefault(); showFeedback('Validando rascunho...'); try { const response = await fetch('/api/settings/validate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draft()) }); const result = await response.json(); if (!response.ok) { showFeedback(result.errors?.map((item) => `${item.key}: ${item.message}`).join(' ') || 'Rascunho inválido.', true); return; } showFeedback(result.warnings?.join(' ') || 'Rascunho válido. Ainda não foi salvo.'); } catch (error) { showFeedback(`Falha na validação: ${error.message}`, true); } });
fetch('/api/settings', { cache: 'no-store' }).then((response) => { if (!response.ok) throw new Error('Não foi possível carregar as configurações.'); return response.json(); }).then((data) => { render(data); showFeedback('Rascunho carregado.'); }).catch((error) => { $('#settings').innerHTML = `<div class="empty">${error.message}</div>`; showFeedback(error.message, true); });

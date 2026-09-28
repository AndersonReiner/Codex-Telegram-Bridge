import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowUpRight,
  Bot,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Code2,
  Eye,
  EyeOff,
  Folder,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  Monitor,
  Moon,
  Palette,
  Plus,
  RotateCcw,
  Search,
  Send,
  Server,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

type Group = "telegram" | "projects" | "codex" | "server" | "startup";
type Setting = {
  key: string;
  group: Group;
  label: string;
  type: string;
  description: string;
  value?: unknown;
  configured: boolean;
  restartRequired: string;
};
type Validation = {
  valid: boolean;
  errors: { key: string; message: string }[];
  warnings: string[];
};
const groups = {
  telegram: {
    name: "Telegram",
    icon: Send,
    description: "Seu canal de controle, conectado com segurança.",
    color: "blue",
  },
  projects: {
    name: "Projetos",
    icon: Folder,
    description: "Organize os diretórios onde o Codex pode trabalhar.",
    color: "amber",
  },
  codex: {
    name: "Inteligência & modelos",
    icon: Bot,
    description: "Ajuste o modelo e a profundidade de cada resposta.",
    color: "purple",
  },
  server: {
    name: "Servidor & dados",
    icon: Server,
    description: "Endereço local, porta e armazenamento do Bridge.",
    color: "green",
  },
  startup: {
    name: "Inicialização",
    icon: Terminal,
    description: "Logs, proteção de instância e tempos de execução.",
    color: "rose",
  },
};
const privateKey = (key: string) => /TOKEN|_ID$|PATH|_FILE$/.test(key);
const emptyList = (raw: string): unknown[] | null => {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
};
const initialTheme = () => {
  try {
    return localStorage.getItem("bridge-theme") === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
};

export function SettingsApp() {
  const [theme, setTheme] = useState(initialTheme);
  const [section, setSection] = useState<Group | "all">("all");
  const [tab, setTab] = useState("form");
  const [mobile, setMobile] = useState(false);
  const [query, setQuery] = useState("");
  const [settings, setSettings] = useState<Setting[]>([]);
  const [base, setBase] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [privacy, setPrivacy] = useState(true);
  const [editingSecret, setEditingSecret] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [modal, setModal] = useState<"discard" | "reveal" | "help" | null>(
    null,
  );
  const [validation, setValidation] = useState<Validation | null>(null);
  const [notice, setNotice] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const revision = useRef(0);
  const changes = Object.keys(draft).filter((key) => draft[key] !== base[key]);
  const dirty = changes.length > 0;

  async function load() {
    setLoading(true);
    setLoadError(false);
    try {
      const response = await fetch("/api/settings", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!Array.isArray(data.settings)) throw new Error();
      const values = Object.fromEntries(
        data.settings.map((s: Setting) => [
          s.key,
          s.type === "secret"
            ? ""
            : s.value === undefined
              ? ""
              : s.type === "json"
                ? JSON.stringify(s.value, null, 2)
                : String(s.value),
        ]),
      );
      setSettings(data.settings);
      setBase(values);
      setDraft(values);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem("bridge-theme", theme);
    } catch {
      /* tema funciona sem armazenamento */
    }
  }, [theme]);
  useEffect(() => {
    const protect = () => {
      setRevealed(false);
      setPrivacy(true);
    };
    const keydown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape") protect();
    };
    const storage = (event: StorageEvent) => {
      if (
        event.key === "bridge-theme" &&
        (event.newValue === "light" || event.newValue === "dark")
      )
        setTheme(event.newValue);
    };
    window.addEventListener("blur", protect);
    document.addEventListener("visibilitychange", protect);
    window.addEventListener("keydown", keydown);
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener("blur", protect);
      document.removeEventListener("visibilitychange", protect);
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("storage", storage);
    };
  }, []);
  useEffect(() => {
    if (!revealed) return;
    const timer = setTimeout(() => setRevealed(false), 15_000);
    return () => clearTimeout(timer);
  }, [revealed]);
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  function update(key: string, value: string) {
    revision.current++;
    setDraft((prev) => ({ ...prev, [key]: value }));
    setValidation(null);
  }
  function select(value: Group | "all") {
    setSection(value);
    setQuery("");
    setTab("form");
    setMobile(false);
    setRevealed(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function validate() {
    const version = revision.current;
    setBusy(true);
    setValidation(null);
    const payload = { ...draft };
    if (!payload.TELEGRAM_BOT_TOKEN) delete payload.TELEGRAM_BOT_TOKEN;
    try {
      const response = await fetch("/api/settings/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (
        (!response.ok && response.status !== 422) ||
        !Array.isArray(result.errors)
      )
        throw new Error();
      if (version !== revision.current) {
        setNotice("O rascunho mudou. Valide os valores atualizados.");
        return;
      }
      setValidation(result);
      setNotice(
        result.valid
          ? "Rascunho validado. Nenhum valor foi salvo no servidor."
          : "Revise os campos indicados antes de continuar.",
      );
      if (!result.valid) {
        setSection("all");
        setQuery("");
        setTab("form");
        setTimeout(
          () => document.getElementById(result.errors[0]?.key)?.focus(),
          100,
        );
      }
    } catch {
      setNotice(
        "Não foi possível validar. Seu rascunho permanece nesta página.",
      );
    } finally {
      setBusy(false);
    }
  }
  const matching = settings.filter(
    (s) =>
      (query || section === "all" || s.group === section) &&
      `${s.key} ${s.label} ${s.description} ${groups[s.group].name}`
        .toLocaleLowerCase("pt-BR")
        .includes(query.toLocaleLowerCase("pt-BR")),
  );
  const tokenConfigured = settings.find((s) => s.type === "secret")?.configured;

  function field(setting: Setting) {
    const key = setting.key;
    const value = draft[key] ?? "";
    const error = validation?.errors
      .filter((e) => e.key === key)
      .map((e) => e.message)
      .join(" ");
    const common = {
      id: key,
      "aria-invalid": Boolean(error) as boolean,
      "aria-describedby": `${key}-hint${error ? ` ${key}-error` : ""}`,
    };
    let control;
    if (key === "AUDIO_ENABLED") {
      control = (
        <div className="secret-state">
          <Switch {...common} checked={value === "true"}
            onCheckedChange={(checked) => update(key, String(checked))}
            aria-label="Transcrição local" />
          <span>{value === "true" ? "Ativada no rascunho" : "Desativada no rascunho"}</span>
        </div>
      );
    } else if (setting.type === "secret") {
      control = (
        <div className="secret-editor">
          <div className="secret-state">
            <ShieldCheck size={16} />
            <span>
              {setting.configured
                ? "Uma credencial já está configurada"
                : "Nenhuma credencial configurada"}
            </span>
            <Badge variant="outline">
              {editingSecret ? "Novo rascunho" : "Protegida"}
            </Badge>
          </div>
          <div className="input-with-action">
            <Input
              {...common}
              type={revealed ? "text" : "password"}
              value={editingSecret ? value : ""}
              disabled={!editingSecret}
              onChange={(e) => update(key, e.target.value)}
              placeholder={
                setting.configured
                  ? "••••••••••••••••••••••••"
                  : "Nenhum token informado"
              }
              autoComplete="new-password"
              spellCheck={false}
              onCopy={(e) => {
                if (!revealed) e.preventDefault();
              }}
              onCut={(e) => {
                if (!revealed) e.preventDefault();
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={!editingSecret || !value}
              aria-label={
                revealed ? "Ocultar novo token" : "Revelar novo token"
              }
              onClick={() =>
                revealed ? setRevealed(false) : setModal("reveal")
              }
            >
              {revealed ? <EyeOff /> : <Eye />}
            </Button>
          </div>
          <div className="secret-footer">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setEditingSecret(!editingSecret);
                update(key, "");
                setRevealed(false);
              }}
            >
              {editingSecret
                ? "Manter credencial atual"
                : "Substituir no rascunho"}
            </Button>
            <span>
              {revealed
                ? "Visível por até 15 segundos"
                : "O token salvo nunca é enviado ao navegador."}
            </span>
          </div>
        </div>
      );
    } else if (
      key === "CODEX_REASONING_EFFORTS_JSON" &&
      emptyList(value)?.every((v) => typeof v === "string")
    ) {
      const selected = emptyList(value) as string[];
      control = (
        <div id={key} tabIndex={-1} className="effort-grid">
          {[
            ["low", "Baixo", "Respostas rápidas"],
            ["medium", "Médio", "Uso equilibrado"],
            ["high", "Alto", "Análise detalhada"],
            ["xhigh", "Muito alto", "Maior profundidade"],
          ].map(([level, label, desc]) => (
            <div
              key={level}
              className={`effort ${selected.includes(level) ? "selected" : ""}`}
            >
              <div>
                <strong>{label}</strong>
                <small>{desc}</small>
              </div>
              <Switch
                aria-label={`Raciocínio ${label}`}
                checked={selected.includes(level)}
                onCheckedChange={(checked) =>
                  update(
                    key,
                    JSON.stringify(
                      checked
                        ? [...selected, level]
                        : selected.filter((v) => v !== level),
                    ),
                  )
                }
              />
            </div>
          ))}
        </div>
      );
    } else if (
      key === "CODEX_MODELS_JSON" &&
      emptyList(value)?.every((v) => typeof v === "string")
    ) {
      control = <ModelList value={value} onChange={(v) => update(key, v)} />;
    } else if (key === "PROJECTS_JSON") {
      control = (
        <ProjectEditor
          value={value}
          privacy={privacy}
          onChange={(v) => update(key, v)}
        />
      );
    } else if (setting.type === "json") {
      control = (
        <Textarea
          {...common}
          value={value}
          onChange={(e) => update(key, e.target.value)}
          rows={4}
          spellCheck={false}
        />
      );
    } else {
      const concealed = privateKey(key) && privacy;
      control = (
        <Input
          {...common}
          type={concealed ? "password" : "text"}
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => update(key, e.target.value)}
          inputMode={setting.type === "number" ? "numeric" : "text"}
          placeholder={
            key === "CODEX_MODEL" ? "Padrão do Codex" : "Não configurado"
          }
          onCopy={(e) => {
            if (concealed) e.preventDefault();
          }}
        />
      );
    }
    return (
      <div
        className={`field ${setting.type === "json" || setting.type === "secret" ? "wide" : ""}`}
        key={key}
        data-field={key}
      >
        <div className="field-label">
          <label htmlFor={key}>{setting.label}</label>
          {changes.includes(key) && <Badge variant="secondary">Alterado</Badge>}
          {privateKey(key) && (
            <LockKeyhole size={12} aria-label="Campo privado" />
          )}
        </div>
        {control}
        <div id={`${key}-hint`} className="field-hint">
          {setting.description} <code>{key}</code>
        </div>
        {error && (
          <p id={`${key}-error`} className="field-error" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="app-shell">
        <aside className="sidebar desktop-sidebar">
          <a href="/" className="brand">
            <span className="brand-symbol">
              <Terminal size={22} />
            </span>
            <span>
              codex<span className="brand-light">bridge</span>
              <small>WORKSPACE CONSOLE</small>
            </span>
          </a>
          <div className="workspace-pill">
            <span className="workspace-avatar">B</span>
            <div>
              Workspace local<small>Ambiente de desenvolvimento</small>
            </div>
            <LockKeyhole size={14} />
          </div>
          <p className="nav-caption">WORKSPACE</p>
          <a className="nav-item" href="/">
            <LayoutDashboard size={18} />
            Visão geral
            <ArrowUpRight size={14} />
          </a>
          <div className="nav-item active">
            <Settings2 size={18} />
            Configurações
            <span className="active-dot" />
          </div>
          <Separator className="nav-separator" />
          <p className="nav-caption">PREFERÊNCIAS DO AMBIENTE</p>
          <nav aria-label="Seções de configuração">
            <button
              className={`nav-item ${section === "all" ? "selected-nav" : ""}`}
              onClick={() => select("all")}
            >
              <SlidersHorizontal size={17} />
              Todos os parâmetros
              <span className="nav-count">{settings.length || "—"}</span>
            </button>
            {Object.entries(groups).map(([key, g]) => (
              <button
                key={key}
                className={`nav-item ${section === key ? "selected-nav" : ""}`}
                onClick={() => select(key as Group)}
              >
                <g.icon size={17} />
                {g.name}
                <ChevronRight size={13} />
              </button>
            ))}
            <button
              className={`nav-item ${tab === "appearance" ? "selected-nav" : ""}`}
              onClick={() => setTab("appearance")}
            >
              <Palette size={17} />
              Aparência
            </button>
          </nav>
          <div className="sidebar-bottom">
            <div className="sidebar-note">
              <ShieldCheck size={22} />
              <strong>Seu ambiente. Seu controle.</strong>
              <p>
                Credenciais protegidas e ajustes organizados em um só lugar.
              </p>
            </div>
            <div className="local-user">
              <div className="workspace-avatar">LC</div>
              <div>
                Console local
                <small>
                  <span className="status-dot" />
                  {loadError
                    ? "Sem conexão"
                    : loading
                      ? "Conectando"
                      : "Configurações carregadas"}
                </small>
              </div>
            </div>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="breadcrumbs">
              <Button
                className="mobile-menu"
                variant="ghost"
                size="icon"
                aria-label="Abrir navegação"
                onClick={() => setMobile(true)}
              >
                <Menu />
              </Button>
              <span>Workspace</span>
              <ChevronRight size={13} />
              <strong>Configurações</strong>
            </div>
            <div className="topbar-actions">
              <Badge variant="outline" className="local-badge">
                <span className="status-dot" />
                Local
              </Badge>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={
                      theme === "dark"
                        ? "Ativar tema claro"
                        : "Ativar tema escuro"
                    }
                    onClick={() =>
                      setTheme(theme === "dark" ? "light" : "dark")
                    }
                  >
                    {theme === "dark" ? <Sun /> : <Moon />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Alternar aparência</TooltipContent>
              </Tooltip>
              <a className="panel-link" href="/">
                Voltar ao painel <ArrowUpRight size={14} />
              </a>
            </div>
          </header>
          <main className="page-content">
            <div className="page-heading">
              <div>
                <div className="eyebrow">
                  <span />
                  SEU BRIDGE, DO SEU JEITO
                </div>
                <h1>
                  Configurações<span>.</span>
                </h1>
                <p>
                  Um espaço para conectar, personalizar e cuidar do seu
                  ambiente.
                </p>
              </div>
              <Button
                variant="outline"
                className={`privacy-button ${privacy ? "protected" : ""}`}
                aria-pressed={privacy}
                onClick={() => {
                  setPrivacy(!privacy);
                  setRevealed(false);
                }}
              >
                {privacy ? <ShieldCheck /> : <Eye />}
                {privacy ? "Privacidade ativa" : "Ativar privacidade"}
              </Button>
            </div>
            <div className="summary-grid">
              {[
                {
                  icon: SlidersHorizontal,
                  color: "green",
                  value: String(settings.length || "—"),
                  label: "Parâmetros",
                  detail: "Todo o ambiente, organizado",
                },
                {
                  icon: Send,
                  color: "blue",
                  value: loading
                    ? "—"
                    : tokenConfigured
                      ? "Configurado"
                      : "Opcional",
                  label: "Telegram",
                  detail: "Estado da credencial local",
                },
                {
                  icon: ShieldCheck,
                  color: "purple",
                  value: privacy ? "Ativa" : "Parcial",
                  label: "Privacidade",
                  detail: privacy
                    ? "Campos privados ocultos"
                    : "Token salvo continua protegido",
                },
                {
                  icon: Activity,
                  color: "amber",
                  value: String(changes.length),
                  label: "Alterações locais",
                  detail: "Rascunho ainda não salvo",
                },
              ].map((item) => (
                <Card className="summary-card" key={item.label}>
                  <div className={`icon-tile ${item.color}`}>
                    <item.icon size={19} />
                  </div>
                  <div>
                    <p>{item.label}</p>
                    <strong>{item.value}</strong>
                    <small>{item.detail}</small>
                  </div>
                </Card>
              ))}
            </div>
            <div className="workspace-grid">
              <div className="editor-column">
                <Tabs
                  value={tab}
                  onValueChange={(value) => {
                    setTab(value);
                    setRevealed(false);
                  }}
                >
                  <div className="editor-toolbar">
                    <TabsList>
                      <TabsTrigger value="form">
                        <SlidersHorizontal />
                        Configuração
                      </TabsTrigger>
                      <TabsTrigger value="review">
                        <CheckCheck />
                        Revisão{" "}
                        {changes.length > 0 && (
                          <span className="tiny-count">{changes.length}</span>
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="appearance">
                        <Palette />
                        Aparência
                      </TabsTrigger>
                    </TabsList>
                  </div>
                  <TabsContent value="form">
                    <div className="search-box">
                      <Search size={17} />
                      <Input
                        ref={searchRef}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        aria-label="Buscar parâmetros"
                        placeholder="Buscar um parâmetro ou configuração…"
                      />
                      <kbd>⌘ K</kbd>
                      {query && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Limpar busca"
                          onClick={() => setQuery("")}
                        >
                          <X />
                        </Button>
                      )}
                    </div>
                    {section !== "all" && !query && (
                      <div className="filter-label">
                        Mostrando {groups[section].name}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => select("all")}
                        >
                          Ver todos <X size={12} />
                        </Button>
                      </div>
                    )}
                    {loading ? (
                      <div className="loading-cards">
                        {[1, 2].map((n) => (
                          <Card key={n}>
                            <CardContent>
                              <Skeleton className="h-6 w-40 mb-6" />
                              <Skeleton className="h-12 w-full mb-3" />
                              <Skeleton className="h-12 w-full" />
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    ) : loadError ? (
                      <Card>
                        <CardContent className="empty-state">
                          <Server />
                          <h2>Não foi possível conectar</h2>
                          <p>
                            Verifique se o Bridge está em execução e tente
                            novamente.
                          </p>
                          <Button onClick={() => void load()}>
                            Tentar novamente
                          </Button>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="settings-cards">
                        {Object.entries(groups).map(([key, g]) => {
                          const list = matching.filter((s) => s.group === key);
                          if (!list.length) return null;
                          return (
                            <Card key={key} className="settings-card">
                              <CardHeader className="section-heading">
                                <div className={`icon-tile ${g.color}`}>
                                  <g.icon size={20} />
                                </div>
                                <div>
                                  <CardTitle>
                                    <h2>{g.name}</h2>
                                  </CardTitle>
                                  <CardDescription>
                                    {g.description}
                                  </CardDescription>
                                </div>
                                <Badge variant="outline">
                                  {list.length}{" "}
                                  {list.length === 1
                                    ? "parâmetro"
                                    : "parâmetros"}
                                </Badge>
                              </CardHeader>
                              <CardContent>
                                <div className="fields-grid">
                                  {list.map(field)}
                                </div>
                              </CardContent>
                              <div className="card-note">
                                <RotateCcw size={12} />
                                {key === "startup"
                                  ? "Parâmetros de scripts: o valor efetivo depende do modo de inicialização."
                                  : "Ao implementar o salvamento, estas alterações exigirão reinício do Bridge."}
                              </div>
                            </Card>
                          );
                        })}
                        {!matching.length && (
                          <Card>
                            <CardContent className="empty-state">
                              <Search />
                              <h2>Nenhum parâmetro encontrado</h2>
                              <p>
                                Tente buscar pelo nome, grupo ou variável de
                                ambiente.
                              </p>
                              <Button
                                variant="outline"
                                onClick={() => {
                                  setQuery("");
                                  setSection("all");
                                }}
                              >
                                Limpar filtros
                              </Button>
                            </CardContent>
                          </Card>
                        )}
                      </div>
                    )}
                  </TabsContent>
                  <TabsContent value="review">
                    <Card>
                      <CardHeader>
                        <CardTitle>
                          <h2>Revise seu rascunho</h2>
                        </CardTitle>
                        <CardDescription>
                          Confira as diferenças antes de validar. Nenhuma
                          alteração foi salva.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {changes.length ? (
                          changes.map((key) => (
                            <div className="review-row" key={key}>
                              <strong>
                                {settings.find((s) => s.key === key)?.label}
                              </strong>
                              <code>{key}</code>
                              {privateKey(key) || key === "PROJECTS_JSON" ? (
                                <p className="private-review">
                                  <LockKeyhole size={14} />
                                  Conteúdo privado oculto na revisão
                                </p>
                              ) : (
                                <div className="diff">
                                  <del>{base[key] || "(vazio)"}</del>
                                  <ArrowDown size={14} />
                                  <pre>{draft[key] || "(vazio)"}</pre>
                                </div>
                              )}
                            </div>
                          ))
                        ) : (
                          <div className="empty-state">
                            <CheckCheck />
                            <h2>Tudo como foi carregado</h2>
                            <p>As alterações que você fizer aparecerão aqui.</p>
                            <Button
                              variant="outline"
                              onClick={() => setTab("form")}
                            >
                              Editar configurações
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                  <TabsContent value="appearance">
                    <Card>
                      <CardHeader>
                        <CardTitle>
                          <h2>Escolha seu ambiente visual</h2>
                        </CardTitle>
                        <CardDescription>
                          A aparência acompanha você entre configurações e
                          painel.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="theme-grid">
                          {["light", "dark"].map((t) => (
                            <button
                              key={t}
                              className={`theme-option ${theme === t ? "chosen" : ""}`}
                              onClick={() => setTheme(t)}
                              aria-pressed={theme === t}
                            >
                              <div className={`theme-preview ${t}`}>
                                <div className="mini-sidebar" />
                                <div className="mini-content">
                                  <i />
                                  <div>
                                    <i />
                                    <i />
                                    <i />
                                  </div>
                                  <b />
                                  <b />
                                </div>
                              </div>
                              <span>
                                {t === "light" ? (
                                  <Sun size={17} />
                                ) : (
                                  <Moon size={17} />
                                )}{" "}
                                {t === "light"
                                  ? "Claro · Porcelana"
                                  : "Escuro · Grafite"}
                                {theme === t && <Check size={16} />}
                              </span>
                            </button>
                          ))}
                        </div>
                        <Separator className="my-6" />
                        <div className="palette-section">
                          <h3>Uma paleta, dois ambientes.</h3>
                          <p>
                            Verde-esmeralda para ações. Azul, violeta e âmbar
                            para orientar a leitura.
                          </p>
                          <div className="swatches">
                            {[
                              "#10b981",
                              "#60a5fa",
                              "#a78bfa",
                              "#fbbf24",
                              "#fb7185",
                            ].map((color) => (
                              <span
                                key={color}
                                style={{ background: color }}
                                title={color}
                              />
                            ))}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </div>
              <aside className="context-column">
                <Card className="privacy-card">
                  <CardHeader>
                    <span className="shield-illustration">
                      <ShieldCheck size={29} />
                    </span>
                    <CardTitle>Privacidade em primeiro lugar</CardTitle>
                    <CardDescription>
                      Apresente sua tela com mais tranquilidade.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="switch-line">
                      <label htmlFor="privacy-switch">
                        Ocultar campos privados
                      </label>
                      <Switch
                        id="privacy-switch"
                        checked={privacy}
                        onCheckedChange={(checked) => {
                          setPrivacy(checked);
                          setRevealed(false);
                        }}
                      />
                    </div>
                    <ul className="privacy-list">
                      <li>
                        <Check />
                        Token salvo fora do navegador
                      </li>
                      <li>
                        <Check />
                        Novos valores ocultos por padrão
                      </li>
                      <li>
                        <Check />
                        Proteção ao sair desta janela
                      </li>
                    </ul>
                  </CardContent>
                </Card>
                <Card className="appearance-card">
                  <CardHeader>
                    <CardTitle>
                      <Palette size={16} />
                      Aparência
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="theme-segment">
                      <Button
                        variant={theme === "light" ? "secondary" : "ghost"}
                        aria-pressed={theme === "light"}
                        onClick={() => setTheme("light")}
                      >
                        <Sun />
                        Claro
                      </Button>
                      <Button
                        variant={theme === "dark" ? "secondary" : "ghost"}
                        aria-pressed={theme === "dark"}
                        onClick={() => setTheme("dark")}
                      >
                        <Moon />
                        Escuro
                      </Button>
                    </div>
                    <div className="small-swatches">
                      <span />
                      <span />
                      <span />
                      <span />
                      <span />
                    </div>
                  </CardContent>
                </Card>
                <div className="draft-note">
                  <div>
                    <Code2 size={17} />
                    <strong>Você está editando um rascunho</strong>
                  </div>
                  <p>
                    Valide e revise seus ajustes à vontade. O salvamento no
                    servidor ainda não está disponível.
                  </p>
                  <button onClick={() => setModal("help")}>
                    Entenda como funciona <ArrowUpRight size={14} />
                  </button>
                </div>
                <div className="built-with">
                  <span className="watermelon-mark">◒</span>Componentes
                  Watermelon UI
                </div>
              </aside>
            </div>
            <div className="page-end">
              <LockKeyhole size={12} />
              Seu token salvo permanece no servidor.
              <span>Codex Bridge / Configurações</span>
            </div>
          </main>
          <footer className="action-bar">
            <div className="draft-status">
              <span className={`status-dot ${dirty ? "pending" : ""}`} />
              <div>
                <strong>
                  {dirty
                    ? `${changes.length} ${changes.length === 1 ? "alteração no rascunho" : "alterações no rascunho"}`
                    : "Nenhuma alteração pendente"}
                </strong>
                <small>
                  {validation?.valid
                    ? "Validação concluída · não salvo"
                    : "Edição local · sem gravação no servidor"}
                </small>
              </div>
            </div>
            <div className="action-buttons">
              <Button
                variant="ghost"
                disabled={!dirty}
                onClick={() => setModal("discard")}
              >
                <RotateCcw />
                Descartar
              </Button>
              <Button
                variant="outline"
                onClick={() => setTab("review")}
                disabled={loading || loadError}
              >
                Revisar<span className="tiny-count">{changes.length}</span>
              </Button>
              <Button
                onClick={() => void validate()}
                disabled={loading || loadError || busy}
              >
                <CheckCheck />
                {busy ? "Validando…" : "Validar rascunho"}
                <ChevronRight />
              </Button>
            </div>
          </footer>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              className="floating-help"
              size="icon"
              aria-label="Ajuda sobre configurações"
              onClick={() => setModal("help")}
            >
              <CircleHelp />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Uma ajuda rápida</TooltipContent>
        </Tooltip>
        {notice && (
          <div className="toast" role="status">
            <CheckCheck size={18} />
            <span>{notice}</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Fechar aviso"
              onClick={() => setNotice("")}
            >
              <X />
            </Button>
          </div>
        )}
        <Dialog open={mobile} onOpenChange={setMobile}>
          <DialogContent className="mobile-dialog">
            <DialogHeader>
              <DialogTitle>Navegação</DialogTitle>
              <DialogDescription>
                Escolha uma seção do ambiente.
              </DialogDescription>
            </DialogHeader>
            <nav>
              <Button variant="ghost" onClick={() => select("all")}>
                Todos os parâmetros
              </Button>
              {Object.entries(groups).map(([key, g]) => (
                <Button
                  key={key}
                  variant="ghost"
                  onClick={() => select(key as Group)}
                >
                  <g.icon />
                  {g.name}
                </Button>
              ))}
              <Button
                variant="ghost"
                onClick={() => {
                  setTab("appearance");
                  setMobile(false);
                }}
              >
                <Palette />
                Aparência
              </Button>
              <a href="/">Voltar ao painel</a>
            </nav>
          </DialogContent>
        </Dialog>
        <Dialog
          open={modal !== null}
          onOpenChange={(open) => {
            if (!open) setModal(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {modal === "discard"
                  ? "Descartar suas alterações?"
                  : modal === "reveal"
                    ? "Mostrar o novo token?"
                    : "Seu espaço de configurações"}
              </DialogTitle>
              <DialogDescription>
                {modal === "discard"
                  ? "Os campos voltarão aos valores carregados ao abrir esta página. O servidor não será alterado."
                  : modal === "reveal"
                    ? "Somente o valor que você digitou será exibido, por até 15 segundos. Verifique se sua tela não está sendo compartilhada."
                    : "Edite, revise e valide os parâmetros do Bridge. O rascunho fica apenas na memória desta página."}
              </DialogDescription>
            </DialogHeader>
            {modal === "help" && (
              <div className="help-content">
                <p>
                  <Search size={16} />
                  Use Ctrl/⌘ K para encontrar um parâmetro.
                </p>
                <p>
                  <ShieldCheck size={16} />
                  Privacidade oculta IDs e caminhos. O token já configurado não
                  pode ser revelado.
                </p>
                <p>
                  <CheckCheck size={16} />
                  Validar consulta o servidor, mas não salva nem reinicia
                  serviços.
                </p>
                <p>
                  <Monitor size={16} />
                  Sua preferência de tema também é usada no painel.
                </p>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setModal(null)}>
                {modal === "help" ? "Entendi" : "Cancelar"}
              </Button>
              {modal === "discard" && (
                <Button
                  variant="destructive"
                  onClick={() => {
                    revision.current++;
                    setDraft({ ...base });
                    setValidation(null);
                    setEditingSecret(false);
                    setRevealed(false);
                    setModal(null);
                    setNotice("Rascunho descartado.");
                  }}
                >
                  Descartar alterações
                </Button>
              )}
              {modal === "reveal" && (
                <Button
                  onClick={() => {
                    setPrivacy(false);
                    setRevealed(true);
                    setModal(null);
                  }}
                >
                  Mostrar por 15 segundos
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

function ModelList({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [name, setName] = useState("");
  const models = emptyList(value) as string[];
  function add() {
    const trimmed = name.trim();
    if (trimmed && !models.includes(trimmed))
      onChange(JSON.stringify([...models, trimmed]));
    setName("");
  }
  return (
    <div className="model-editor" id="CODEX_MODELS_JSON" tabIndex={-1}>
      <div className="model-chips">
        {models.map((model, i) => (
          <Badge key={`${model}-${i}`} variant="secondary">
            <Bot size={12} />
            {model}
            <button
              aria-label={`Remover modelo ${model}`}
              onClick={() =>
                onChange(
                  JSON.stringify(models.filter((_, index) => index !== i)),
                )
              }
            >
              <X size={12} />
            </button>
          </Badge>
        ))}
        {!models.length && (
          <span className="muted">Nenhum modelo cadastrado</span>
        )}
      </div>
      <div className="model-add">
        <Input
          aria-label="Nome do novo modelo"
          placeholder="Adicionar modelo…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button
          variant="outline"
          size="icon"
          aria-label="Adicionar modelo"
          disabled={!name.trim()}
          onClick={add}
        >
          <Plus />
        </Button>
      </div>
    </div>
  );
}

function ProjectEditor({
  value,
  onChange,
  privacy,
}: {
  value: string;
  onChange: (value: string) => void;
  privacy: boolean;
}) {
  const parsed = emptyList(value);
  const projects = parsed?.every(
    (p) =>
      p &&
      typeof p === "object" &&
      ["id", "name", "cwd"].every(
        (k) => typeof (p as Record<string, unknown>)[k] === "string",
      ),
  )
    ? (parsed as { id: string; name: string; cwd: string }[])
    : null;
  const [mode, setMode] = useState("cards");
  const update = (index: number, key: string, next: string) =>
    onChange(
      JSON.stringify(
        projects!.map((p, i) => (i === index ? { ...p, [key]: next } : p)),
        null,
        2,
      ),
    );
  return (
    <div id="PROJECTS_JSON" tabIndex={-1} className="project-editor">
      <Tabs value={!projects ? "json" : mode} onValueChange={setMode}>
        <div className="project-toolbar">
          <span>
            <Folder size={15} />
            {projects?.length ?? "—"} projetos no rascunho
          </span>
          <TabsList>
            <TabsTrigger value="cards" disabled={!projects}>
              Lista
            </TabsTrigger>
            <TabsTrigger value="json">JSON</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="cards">
          <div className="project-list">
            {projects?.map((p, i) => (
              <div className="project-item" key={i}>
                <span className="project-number">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="project-inputs">
                  <div>
                    <label htmlFor={`p-name-${i}`}>Nome</label>
                    <Input
                      id={`p-name-${i}`}
                      value={p.name}
                      onChange={(e) => update(i, "name", e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor={`p-id-${i}`}>Identificador</label>
                    <Input
                      id={`p-id-${i}`}
                      value={p.id}
                      onChange={(e) => update(i, "id", e.target.value)}
                    />
                  </div>
                  <div className="project-path">
                    <label htmlFor={`p-path-${i}`}>
                      Diretório de trabalho{" "}
                      {privacy && <LockKeyhole size={11} />}
                    </label>
                    <Input
                      id={`p-path-${i}`}
                      type={privacy ? "password" : "text"}
                      autoComplete="off"
                      value={p.cwd}
                      onChange={(e) => update(i, "cwd", e.target.value)}
                      onCopy={(e) => {
                        if (privacy) e.preventDefault();
                      }}
                    />
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remover projeto ${p.name || i + 1}`}
                  onClick={() =>
                    onChange(
                      JSON.stringify(
                        projects.filter((_, index) => index !== i),
                        null,
                        2,
                      ),
                    )
                  }
                >
                  <Trash2 size={15} />
                </Button>
              </div>
            ))}
          </div>
          <Button
            className="add-project"
            variant="outline"
            onClick={() =>
              onChange(
                JSON.stringify(
                  [...(projects || []), { id: "", name: "", cwd: "" }],
                  null,
                  2,
                ),
              )
            }
          >
            <Plus />
            Adicionar projeto
          </Button>
        </TabsContent>
        <TabsContent value="json">
          {privacy ? (
            <div className="json-locked">
              <LockKeyhole />
              <p>O JSON inclui caminhos privados.</p>
              <small>
                Desative a privacidade para editar o conteúdo completo.
              </small>
            </div>
          ) : (
            <Textarea
              aria-label="JSON dos projetos"
              rows={8}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              spellCheck={false}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

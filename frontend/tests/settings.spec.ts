import { test, expect } from "@playwright/test";

test("carrega componentes Watermelon reais e os 17 parâmetros sem expor token salvo", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.request.get("/api/settings");
  expect(await response.text()).not.toContain(
    "fixture-secret-must-never-reach-browser",
  );
  await page.goto("/configuracoes");
  await expect(page.locator("[data-field]")).toHaveCount(17);
  await expect(page.locator('[data-slot="card"]').first()).toBeVisible();
  await expect(page.locator("#TELEGRAM_BOT_TOKEN")).toBeDisabled();
  expect(await page.content()).not.toContain(
    "fixture-secret-must-never-reach-browser",
  );
  expect(errors).toEqual([]);
});

test("busca e sidebar preservam rascunho completo na validação", async ({
  page,
}) => {
  await page.goto("/configuracoes");
  await page.locator("#HTTP_PORT").fill("9898");
  await page
    .getByRole("textbox", { name: "Buscar parâmetros" })
    .fill("Telegram");
  await expect(page.locator("#HTTP_PORT")).toHaveCount(0);
  const requestPromise = page.waitForRequest((request) =>
    request.url().endsWith("/api/settings/validate"),
  );
  await page
    .getByRole("button", { name: "Validar rascunho", exact: true })
    .click();
  const request = await requestPromise;
  expect(request.postDataJSON().HTTP_PORT).toBe("9898");
  expect(request.postDataJSON().TELEGRAM_ALLOWED_CHAT_ID).toBe(
    "-1001234567890",
  );
  expect(request.postDataJSON()).not.toHaveProperty("TELEGRAM_BOT_TOKEN");
  await page
    .getByRole("button", { name: "Servidor & dados", exact: true })
    .click();
  await expect(page.locator("#HTTP_PORT")).toHaveValue("9898");
});

test("privacidade exige confirmação para novo segredo e reativa ao perder foco", async ({
  page,
}) => {
  await page.goto("/configuracoes");
  await page.getByRole("button", { name: "Substituir no rascunho" }).click();
  await page.locator("#TELEGRAM_BOT_TOKEN").fill("novo-segredo-teste");
  await expect(page.locator("#TELEGRAM_BOT_TOKEN")).toHaveAttribute(
    "type",
    "password",
  );
  await page.getByRole("button", { name: "Revelar novo token" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Mostrar por 15 segundos" }).click();
  await expect(page.locator("#TELEGRAM_BOT_TOKEN")).toHaveAttribute(
    "type",
    "text",
  );
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.locator("#TELEGRAM_BOT_TOKEN")).toHaveAttribute(
    "type",
    "password",
  );
  await expect(
    page.getByRole("button", { name: "Privacidade ativa" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("tab", { name: /Revisão/ }).click();
  await expect(
    page.getByText("Conteúdo privado oculto na revisão"),
  ).toBeVisible();
  expect(await page.locator("body").innerText()).not.toContain(
    "novo-segredo-teste",
  );
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    "novo-segredo-teste",
  );
});

test("expira revelação e descarta só após confirmar", async ({ page }) => {
  await page.goto("/configuracoes");
  await page.clock.install();
  await page.getByRole("button", { name: "Substituir no rascunho" }).click();
  await page.locator("#TELEGRAM_BOT_TOKEN").fill("temporario");
  await page.getByRole("button", { name: "Revelar novo token" }).click();
  await page.getByRole("button", { name: "Mostrar por 15 segundos" }).click();
  await page.clock.fastForward(15_001);
  await expect(page.locator("#TELEGRAM_BOT_TOKEN")).toHaveAttribute(
    "type",
    "password",
  );
  await page.getByRole("button", { name: "Descartar", exact: true }).click();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.locator("#TELEGRAM_BOT_TOKEN")).toHaveValue("temporario");
  await page.getByRole("button", { name: "Descartar", exact: true }).click();
  await page.getByRole("button", { name: "Descartar alterações" }).click();
  await expect(page.locator("#TELEGRAM_BOT_TOKEN")).toBeDisabled();
  await expect(page.locator("#TELEGRAM_BOT_TOKEN")).toHaveValue("");
});

test("valida porta isoladamente, preserva vazio obrigatório e aceita chat negativo", async ({
  page,
}) => {
  await page.goto("/configuracoes");
  await page.locator("#HTTP_PORT").fill("70000");
  await page
    .getByRole("button", { name: "Validar rascunho", exact: true })
    .click();
  await expect(page.locator("#HTTP_PORT-error")).toContainText("65535");
  await page.locator("#HTTP_PORT").fill("8787");
  await page.locator("#CODEX_COMMAND").fill("");
  await page
    .getByRole("button", { name: "Validar rascunho", exact: true })
    .click();
  await expect(page.locator("#CODEX_COMMAND-error")).toBeVisible();
});

test("conteúdo de configuração é renderizado como texto e não HTML", async ({
  page,
}) => {
  await page.route("**/api/settings", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.settings.find(
      (s: { key: string }) => s.key === "CODEX_COMMAND",
    ).value = '<img src=x onerror="window.__injected=true">';
    await route.fulfill({ json: data });
  });
  await page.goto("/configuracoes");
  await expect(page.locator("#CODEX_COMMAND")).toHaveValue(/<img/);
  expect(
    await page.evaluate(
      () => (window as unknown as { __injected?: boolean }).__injected,
    ),
  ).toBeUndefined();
});

test("temas e layout responsivo funcionam em desktop e celular", async ({
  page,
}) => {
  for (const width of [1440, 768, 360]) {
    await page.setViewportSize({ width, height: 960 });
    await page.goto("/configuracoes");
    await expect(page.locator("[data-field]")).toHaveCount(17);
    for (const theme of ["light", "dark"]) {
      const toggle = page.getByRole("button", {
        name: `Ativar tema ${theme === "light" ? "claro" : "escuro"}`,
        exact: true,
      });
      if (await toggle.count()) await toggle.click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.screenshot({
        path: `/tmp/bridge-settings-${width}-${theme}.png`,
        fullPage: false,
        animations: "disabled",
      });
    }
    if (width === 360) {
      await page.getByRole("button", { name: "Abrir navegação" }).click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Servidor & dados" })
        .click();
      await expect(page.locator("#HTTP_PORT")).toBeVisible();
    }
  }
});

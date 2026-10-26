import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "./helpers/test";
import { credenciaisSupabaseDeTeste } from "../../scripts/lib/env-de-teste";
import { lerCreds, loginComoAdmin } from "./helpers/login-admin";

test("conversões: um editor oficial, regras antigas preservadas e critérios independentes", async ({ page }) => {
  test.setTimeout(120_000);
  const { url, serviceRole } = credenciaisSupabaseDeTeste();
  if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)) throw new Error("Teste exige banco local");
  const db = createClient(url, serviceRole, { auth: { persistSession: false } });
  const creds = await loginComoAdmin(page, lerCreds());
  const { data: usuarios, error: erroUsuarios } = await db.auth.admin.listUsers();
  if (erroUsuarios) throw erroUsuarios;
  const usuario = usuarios.users.find((u) => u.email === creds.users.admin!.email);
  if (!usuario) throw new Error("Admin de teste ausente");
  const { data: membro, error: erroMembro } = await db.from("user_organizations").select("organization_id").eq("user_id", usuario.id).limit(1).single();
  if (erroMembro) throw erroMembro;
  const org = membro.organization_id;
  const { data: empresa, error: erroEmpresa } = await db.from("organizations").select("settings").eq("id", org).single();
  if (erroEmpresa) throw erroEmpresa;
  const funil = randomUUID(), qualificado = randomUUID(), agenda = randomUUID();
  const regras = { [qualificado]: { event_name: "QualifiedLead", requires_value: false }, [agenda]: { event_name: "Schedule", requires_value: false } };
  const marco = "2026-09-14T12:00:00Z";
  const checar = (r: { error: unknown }) => { if (r.error) throw r.error; };
  try {
    const settings = empresa.settings ?? {};
    checar(await db.from("organizations").update({ settings: { ...settings, conversions: { ...(settings.conversions ?? {}), report_via_channel: true } } }).eq("id", org));
    checar(await db.from("crm_pipelines").insert({ id: funil, organization_id: org, name: "Funil QA consolidação", slug: `qa-meta-${funil}`, settings: { meta_conversion_rules: regras, meta_conversion_activated_at: marco } }));
    checar(await db.from("crm_stages").insert([
      { id: qualificado, organization_id: org, pipeline_id: funil, name: "Qualificado QA", slug: "qualificado", position: 1 },
      { id: agenda, organization_id: org, pipeline_id: funil, name: "Agenda QA", slug: "agenda", position: 2 },
    ]));
    await page.goto("/app/settings/conversoes");
    const criterios = page.getByTestId(`criterios-funil-${funil}`);
    await expect(criterios.getByTestId("regras-meta-antigas")).toContainText("Schedule");
    await expect(criterios.getByRole("switch")).toHaveCount(0);
    await criterios.getByLabel("O que é um lead qualificado?").fill("Perfil e orçamento confirmados");
    await criterios.getByRole("button", { name: "Salvar critérios", exact: true }).click();
    await expect(page.getByText("Critérios do funil salvos.", { exact: true })).toBeVisible();
    const { data: salvo, error: erroSalvo } = await db.from("crm_pipelines").select("settings").eq("id", funil).single();
    if (erroSalvo) throw erroSalvo;
    expect(salvo.settings.meta_conversion_rules).toEqual(regras);
    expect(salvo.settings.meta_conversion_activated_at).toBe(marco);
    expect(salvo.settings.qualification_policy.qualified_description).toBe("Perfil e orçamento confirmados");
    await page.getByRole("button", { name: "Aproveitar regras antigas compatíveis", exact: true }).click();
    await expect(page.getByTestId(`regra-meta-${qualificado}`).getByRole("switch")).toBeChecked();
    await expect(page.getByTestId(`regra-meta-${agenda}`).getByRole("switch")).not.toBeChecked();
    const { count, error: erroRegras } = await db.from("meta_ads_conversion_rules").select("id", { count: "exact", head: true }).in("stage_id", [qualificado, agenda]);
    if (erroRegras) throw erroRegras;
    expect(count).toBe(0); // O rascunho não ativa envios nem grava regras.
    mkdirSync("evidence/consolidacao-meta", { recursive: true });
    await page.screenshot({ path: "evidence/consolidacao-meta/editor-unico.png", fullPage: true });
  } finally {
    checar(await db.from("crm_stages").delete().eq("pipeline_id", funil));
    checar(await db.from("crm_pipelines").delete().eq("id", funil));
    checar(await db.from("organizations").update({ settings: empresa.settings }).eq("id", org));
  }
});

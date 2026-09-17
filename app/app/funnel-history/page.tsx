import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { HistoricoClient } from "./historico-client";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Histórico do funil" };
export default async function HistoricoPage() {
  const user = await requireAuth();
  const t = (texto: string) => traduzir(texto, user.idioma);
  return (
    <div className="flex h-full flex-col gap-6 overflow-auto p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("Histórico do funil")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("Quantos leads passaram por cada etapa no período, mesmo que já tenham saído dela.")}
        </p>
      </header>
      <HistoricoClient />
    </div>
  );
}

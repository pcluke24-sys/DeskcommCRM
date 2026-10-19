"use client";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { notifySupportTransition } from "@/components/app/ImpersonateBanner";

const listaSchema = z.object({
  data: z.array(z.object({ id: z.string().uuid(), display_name: z.string() })),
});

export function AcompanharClientes() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [clientes, setClientes] = useState<z.infer<typeof listaSchema>["data"]>([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");

  async function abrir() {
    setOpen(true);
    setLoading(true);
    setError("");
    setSelected("");
    setClientes([]);
    try {
      const res = await fetch("/api/v1/acompanhamento");
      if (!res.ok)
        throw new Error(
          "Não foi possível consultar os clientes. Confira seu acesso e tente novamente.",
        );
      setClientes(listaSchema.parse(await res.json()).data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha de conexão.");
    } finally {
      setLoading(false);
    }
  }

  async function entrar() {
    setBusy(true);
    try {
      const res = await fetch("/api/v1/acompanhamento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organization_id: selected }),
      });
      const json = await res.json();
      if (!res.ok)
        throw new Error(json.error?.message ?? "Não foi possível iniciar o acompanhamento.");
      notifySupportTransition();
      window.location.assign("/app/inbox");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha de conexão.");
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          void abrir();
        }}
      >
        Acompanhar clientes
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent>
          <DialogTitle>Acompanhar cliente — somente leitura</DialogTitle>
          <DialogDescription>
            Você poderá consultar conversas e funis por até uma hora. Não poderá enviar mensagens,
            marcar conversas como lidas ou alterar dados. O acesso será registrado.
          </DialogDescription>
          {loading ? (
            <p role="status">Carregando clientes…</p>
          ) : error ? (
            <div role="alert">
              <p>{error}</p>
              <Button
                onClick={() => {
                  void abrir();
                }}
              >
                Tentar novamente
              </Button>
            </div>
          ) : (
            <>
              <label htmlFor="cliente-acompanhamento">Organização cliente</label>
              <select
                id="cliente-acompanhamento"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                disabled={busy}
                className="w-full rounded border bg-background p-2"
              >
                <option value="">Selecione uma organização</option>
                {clientes.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.display_name}
                  </option>
                ))}
              </select>
              {clientes.length === 0 && <p>Nenhum cliente ativo disponível.</p>}
              <Button
                disabled={!selected || busy}
                onClick={() => {
                  void entrar();
                }}
              >
                {busy ? "Entrando…" : "Confirmar acompanhamento somente leitura"}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

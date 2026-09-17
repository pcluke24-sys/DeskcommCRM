import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { createClient } from "@/lib/supabase/server";
import { decidirConviteDoSignup } from "@/lib/auth/convite-no-signup";
import { aplicarConvite } from "@/lib/auth/aplicar-convite";
vi.mock("@/lib/supabase/server", () => ({createClient:vi.fn()}));
vi.mock("@/lib/auth/convite-no-signup", () => ({decidirConviteDoSignup:vi.fn()}));
vi.mock("@/lib/auth/aplicar-convite", () => ({aplicarConvite:vi.fn()}));
vi.mock("@/lib/env", () => ({env:{NEXT_PUBLIC_APP_URL:"https://crm.example.com"}}));
const user={id:"u",email:"invite@example.com",email_confirmed_at:"2026-09-17",user_metadata:{invite_token:"signed-token"}};
const payload={invite_id:"i",email:user.email,organization_id:"o",role:"agent",exp:9999999999};
function setup(person: unknown=user, membership: unknown=null, error: unknown=null) {
  const query: Record<string,unknown>={};
  for(const key of ["select","eq","is","limit"]) query[key]=()=>query;
  query.maybeSingle=async()=>({data:membership,error});
  vi.mocked(createClient).mockResolvedValue({auth:{getUser:async()=>({data:{user:person}})},from:()=>query} as never);
}
async function destination(){return new URL((await GET()).headers.get("location")!).pathname;}
describe("retomar primeiro convite sem criar outra organização",()=>{
  beforeEach(()=>{vi.clearAllMocks(); setup(); vi.mocked(decidirConviteDoSignup).mockReturnValue({tipo:"convite",token:"signed-token",payload}); vi.mocked(aplicarConvite).mockResolvedValue({ok:true,membershipId:"m",mudou:true});});
  it("conclui o vínculo do usuário confirmado e entra no CRM",async()=>{expect(await destination()).toBe("/app");expect(aplicarConvite).toHaveBeenCalledWith({userId:user.id,payload});});
  it("sem sessão não concede acesso",async()=>{setup(null);expect(await destination()).toBe("/login");expect(aplicarConvite).not.toHaveBeenCalled();});
  it("não aceita e-mail sem confirmação",async()=>{setup({...user,email_confirmed_at:null});expect(await destination()).toBe("/team/accept-invite/signed-token");expect(aplicarConvite).not.toHaveBeenCalled();});
  it("revogação mantém a saída de erro",async()=>{vi.mocked(aplicarConvite).mockResolvedValue({ok:false,motivo:"invalid_or_expired"});expect(await destination()).toBe("/team/accept-invite/signed-token");});
  it("assinatura ou e-mail inválido nunca aplica convite",async()=>{vi.mocked(decidirConviteDoSignup).mockReturnValue({tipo:"recusar",motivo:"email_divergente"});expect(await destination()).toBe("/team/accept-invite/signed-token");expect(aplicarConvite).not.toHaveBeenCalled();});
  it("membro existente não depende de token antigo",async()=>{setup(user,{organization_id:"o"});expect(await destination()).toBe("/app");expect(aplicarConvite).not.toHaveBeenCalled();});
  it("erro de banco não vira ausência de organização",async()=>{setup(user,null,{code:"offline"});expect(await destination()).toBe("/503");expect(aplicarConvite).not.toHaveBeenCalled();});
  it("cadastro comum segue recuperação sem provisionar por GET",async()=>{vi.mocked(decidirConviteDoSignup).mockReturnValue({tipo:"provisionar"});expect(await destination()).toBe("/get-started");expect(aplicarConvite).not.toHaveBeenCalled();});
});

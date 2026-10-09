// eslint-disable-next-line @typescript-eslint/no-require-imports -- Programa CommonJS executado pelo runner.
const { execFileSync } = require("node:child_process");

async function baixarComTentativas(imagem, executar, esperar) {
  for (let tentativa = 1; tentativa <= 4; tentativa++) {
    try {
      executar(imagem);
      return;
    } catch (erro) {
      if (tentativa === 4) throw erro;
      await esperar(5000 * tentativa);
    }
  }
}
module.exports = { baixarComTentativas };

if (require.main === module) {
  if (process.env.RUNNER_ENVIRONMENT !== "github-hosted") {
    throw new Error("Download preventivo só em runner efêmero do GitHub");
  }
  const imagem = process.env.TEST_DB_IMAGE || "moby/buildkit:buildx-stable-1";
  if (!/^(pgvector\/pgvector:pg(15|17)|moby\/buildkit:buildx-stable-1)$/.test(imagem)) {
    throw new Error("Imagem fora das dependências públicas autorizadas da esteira");
  }
  baixarComTentativas(
    imagem,
    (alvo) => execFileSync("docker", ["pull", alvo], { stdio: "inherit", timeout: 120000 }),
    (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  ).catch(() => {
    process.stderr.write("Download da dependência falhou após quatro tentativas; gate preservado.\n");
    process.exitCode = 1;
  });
}

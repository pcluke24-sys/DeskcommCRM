// eslint-disable-next-line @typescript-eslint/no-require-imports -- Entry point CommonJS executado diretamente pelo Node do runner.
const fs = require("node:fs");
const mirror = "https://mirror.gcr.io";

function comEspelho(config) {
  const existentes = config["registry-mirrors"] ?? [];
  if (!Array.isArray(existentes) || existentes.some((item) => typeof item !== "string")) {
    throw new Error("registry-mirrors inválido; configuração não foi alterada");
  }
  return {
    ...config,
    "registry-mirrors": [mirror, ...existentes.filter((item) => item !== mirror)],
  };
}
module.exports = { comEspelho };

if (require.main === module) {
  if (process.env.RUNNER_ENVIRONMENT !== "github-hosted") {
    throw new Error("Só pode configurar Docker em runner efêmero do GitHub");
  }
  const path = "/etc/docker/daemon.json";
  const config = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, "utf8")) : {};
  const atualizado = comEspelho(config);
  fs.mkdirSync("/etc/docker", { recursive: true });
  fs.writeFileSync(path, JSON.stringify(atualizado, null, 2) + "\n");
}

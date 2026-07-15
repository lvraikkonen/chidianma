import { checkDeploymentEnvironment } from "./deploymentEnvironment.js";

try {
  console.log(checkDeploymentEnvironment());
} catch {
  console.error(JSON.stringify({ ok: false, error: "environment_invalid" }));
  process.exitCode = 1;
}

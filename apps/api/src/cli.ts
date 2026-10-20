import { runAdminCli } from "./modules/auth/infrastructure/admin-cli.js";
import { ScryptPasswordHasher } from "./modules/auth/infrastructure/scrypt-password-hasher.js";
import { loadConfig } from "./shared/config.js";
import { openDatabase } from "./shared/sqlite-database.js";

const config = loadConfig();
const db = openDatabase(config.dataDir);
const result = await runAdminCli(process.argv.slice(2), db, new ScryptPasswordHasher());
db.close();
(result.ok ? console.log : console.error)(result.message);
process.exit(result.ok ? 0 : 1);

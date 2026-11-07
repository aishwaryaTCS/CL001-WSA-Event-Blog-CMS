// Sets a new password for an admin who has forgotten theirs.
// Run on the server, in the CMS folder:  npm run reset-password
// It asks for the admin's email and the new password (typed twice, not shown on screen).
// The same rules as the Password screen apply (12+ characters). Saving the new password
// also signs that admin out everywhere, because their sign-in cookie no longer matches.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { hashPassword } from "./auth.ts";
import { adminByEmail, getPool, openDatabase, updatePassword } from "./db.ts";
import { ROOT } from "./root.ts";
import { passwordProblem } from "./schemas.ts";

async function databaseUrl(): Promise<string> {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const text = await readFile(path.join(ROOT, ".env"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);
      if (match) return match[1].replace(/^(['"])(.*)\1$/, "$2");
    }
  } catch {
    // No .env file: fall through to the message below.
  }
  return "";
}

// When the answers are piped in (not typed), read them all once, one per line.
let piped: string[] | null = null;
async function pipedLine(): Promise<string> {
  if (!piped) {
    let text = "";
    for await (const chunk of process.stdin) text += chunk;
    piped = text.split(/\r?\n/);
  }
  return piped.shift() ?? "";
}

/** One line from the keyboard. With hidden = true, nothing typed is shown (for passwords). */
function ask(question: string, hidden = false): Promise<string> {
  const input = process.stdin;
  if (!input.isTTY) {
    process.stdout.write(question + (hidden ? "\n" : ""));
    return pipedLine();
  }
  if (!hidden) {
    const rl = createInterface({ input, output: process.stdout });
    return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer); }));
  }
  return new Promise((resolve) => {
    process.stdout.write(question);
    let value = "";
    input.setRawMode(true);
    input.resume();
    input.setEncoding("utf8");
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") {
          input.setRawMode(false);
          input.pause();
          input.off("data", onData);
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (char === "\u0003") {
          // Ctrl+C
          process.stdout.write("\n");
          process.exit(130);
        }
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else value += char;
      }
    };
    input.on("data", onData);
  });
}

async function main(): Promise<void> {
  const url = await databaseUrl();
  if (!url) {
    console.error("DATABASE_URL is missing. Run this in the CMS folder, next to its .env file.");
    process.exit(1);
  }
  await openDatabase(url);
  try {
    const email = (await ask("Admin email: ")).trim().toLowerCase();
    const admin = email ? await adminByEmail(email) : null;
    if (!admin) {
      console.error("No admin with that email.");
      process.exitCode = 1;
      return;
    }
    const next = await ask("New password (12+ characters, not shown): ", true);
    const confirm = await ask("Type it again: ", true);
    const problem = passwordProblem(next, confirm, true);
    if (problem) {
      console.error(problem.replace(/^New password/, "Password"));
      process.exitCode = 1;
      return;
    }
    await updatePassword(admin.id, await hashPassword(next));
    console.log(`Password changed for ${admin.email}. Sign in at /admin with the new password.`);
    console.log("If the CMS said “wait 15 minutes” after wrong tries, restart it (pm2 restart wsa-cms) to clear that.");
  } finally {
    await getPool().end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Reset failed.";
  console.error(message.includes("://") ? "Could not reach the database." : message);
  process.exit(1);
});

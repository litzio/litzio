import { execFileSync } from "node:child_process";
export type RegistryAccount = { UserFolder?: string; UserEmail?: string; DisplayName?: string };
export type RegistryResult = { accounts: RegistryAccount[]; complete: boolean };
export function readAccounts(): RegistryResult {
  try {
    const output = execFileSync("reg.exe", ["query", "HKCU\\Software\\Microsoft\\OneDrive\\Accounts", "/s"], { encoding: "utf8", windowsHide: true, timeout: 5000, maxBuffer: 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
    return parseAccounts(output);
  } catch { return { accounts: [], complete: false }; }
}
export function parseAccounts(output: string): RegistryResult {
  const accounts: RegistryAccount[] = []; let current: RegistryAccount | undefined;
  for (const line of output.split(/\r?\n/)) {
    if (/^HKEY_/i.test(line.trim())) {
      current = /^HKEY_CURRENT_USER\\Software\\Microsoft\\OneDrive\\Accounts\\[^\\]+$/i.test(line.trim()) ? {} : undefined;
      if (current) accounts.push(current);
    } else {
      const match = /^\s+(UserFolder|UserEmail|DisplayName)\s+REG_SZ\s+(.*?)\s*$/.exec(line);
      if (current && match) current[match[1] as keyof RegistryAccount] = match[2];
    }
  }
  return { accounts, complete: true };
}

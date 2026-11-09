import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename, rm, readdir } from "node:fs/promises";
import path from "node:path";

/** Internal runtime boundary. Never expose read() through a Host operation or assistant tool. */
export interface PluginSecretStore {
  readonly supported: boolean;
  read(plugin: string, name: string): Promise<string | undefined>;
  set(plugin: string, name: string, value: string): Promise<void>;
  status(plugin: string, name: string): Promise<boolean>;
  delete(plugin: string, name?: string): Promise<void>;
}
// Constant script: secret input uses stdin, never argv, environment or a temporary plaintext file.
const script = `$ErrorActionPreference='Stop'; try {
Add-Type -AssemblyName System.Security
$r=[Console]::In.ReadToEnd() | ConvertFrom-Json
$b=[Convert]::FromBase64String($r.data)
$e=[Text.Encoding]::UTF8.GetBytes($r.entropy)
if ($r.mode -eq 'protect') { $out=[Security.Cryptography.ProtectedData]::Protect($b,$e,[Security.Cryptography.DataProtectionScope]::CurrentUser) }
else { $out=[Security.Cryptography.ProtectedData]::Unprotect($b,$e,[Security.Cryptography.DataProtectionScope]::CurrentUser) }
[Console]::Out.Write([Convert]::ToBase64String($out))
} catch { exit 1 }`;
function crypt(mode: string, data: Buffer, entropy: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    let output = ''; const fail = () => reject(new Error('Windows secret store unavailable'));
    const timer = setTimeout(() => { child.kill(); fail(); }, 15000);
    child.on('error', () => { clearTimeout(timer); fail(); });
    child.stdout.on('data', chunk => { output += chunk; if (output.length > 100000) child.kill(); });
    child.stdin.on('error', () => {});
    child.on('close', code => { clearTimeout(timer); if (code !== 0) fail(); else resolve(Buffer.from(output, 'base64')); });
    child.stdin.end(JSON.stringify({ mode, data: data.toString('base64'), entropy }));
  });
}
// DPAPI blob envelope only; checking configuration must never launch PowerShell.
function validBlob(blob: Buffer): boolean {
  try {
    if (blob.readUInt32LE(0) !== 1 || blob.subarray(4, 20).toString("hex") !== "d08c9ddf0115d1118c7a00c04fc297eb" || blob.readUInt32LE(20) !== 1) return false;
    let offset = 44;
    const field = () => { const length = blob.readUInt32LE(offset); offset += 4 + length; if (offset > blob.length) throw new Error(); };
    field(); // description
    offset += 8; // encryption algorithm and key length
    field(); field(); // salt and HMAC key
    offset += 8; // hash algorithm and length
    field(); field(); field(); // HMAC, ciphertext and signature
    return offset === blob.length;
  } catch { return false; }
}
export class WindowsPluginSecretStore implements PluginSecretStore {
  readonly supported: boolean;
  private damaged = new Map<string, string>();
  private fingerprint(blob: Buffer) { return createHash("sha256").update(blob).digest("hex"); }
  constructor(private directory: string, platform = process.platform) { this.supported = platform === 'win32'; }
  private check() { if (!this.supported) throw new Error('Plugin secrets are unsupported on this Host (Windows required)'); }
  private key(plugin: string, name?: string) {
    const hash = (s: string) => createHash('sha256').update(s).digest('hex');
    return path.join(this.directory, hash(plugin), ...(name === undefined ? [] : [hash(name)]));
  }
  private entropy(plugin: string, name: string) { return JSON.stringify([path.resolve(this.directory), plugin, name]); }
  async read(plugin: string, name: string) {
    this.check(); let blob: Buffer;
    try { blob = await readFile(this.key(plugin, name)); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw new Error('Windows secret store unavailable'); }
    const key = this.key(plugin, name);
    try {
      const value = (await crypt('unprotect', blob, this.entropy(plugin, name))).toString('utf8');
      this.damaged.delete(key); return value;
    } catch { this.damaged.set(key, this.fingerprint(blob)); throw new Error('Windows secret store unavailable'); }
  }
  async status(plugin: string, name: string) {
    this.check(); const key = this.key(plugin, name);
    let blob: Buffer;
    try { blob = await readFile(key); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') { this.damaged.delete(key); return false; } throw new Error('Windows secret store unavailable'); }
    if (!validBlob(blob) || this.damaged.get(key) === this.fingerprint(blob)) throw new Error('Windows secret store unavailable');
    this.damaged.delete(key); return true;
  }
  async set(plugin: string, name: string, value: string) {
    this.check(); const blob = await crypt('protect', Buffer.from(value), this.entropy(plugin, name));
    const file = this.key(plugin, name), temporary = `${file}.${randomUUID()}.tmp`;
    try { await mkdir(path.dirname(file), { recursive: true }); await writeFile(temporary, blob, { flag: 'wx' }); await rename(temporary, file); }
    catch { throw new Error('Windows secret store unavailable'); }
    finally { await rm(temporary, { force: true }); }
  }
  async delete(plugin: string, name?: string) {
    this.check();
    // All paths are hashes under the configured Host store; never follow user supplied paths.
    if (name !== undefined) await rm(this.key(plugin, name), { force: true });
    else { let files: string[]; try { files = await readdir(this.key(plugin)); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return; throw new Error('Windows secret store unavailable'); }
      for (const file of files) await rm(path.join(this.key(plugin), file), { force: true });
      await rm(this.key(plugin), { recursive: true, force: true }); }
  }
}

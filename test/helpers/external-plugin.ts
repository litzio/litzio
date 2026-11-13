import assert from "node:assert/strict";
import path from "node:path";
import { readFileSync, readdirSync, writeFileSync, mkdirSync, renameSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Exercise the shipped scaffold and SDK through a running Host, without a checkout dependency. */
export async function verifyExternalPlugin(url: string, parent: string, hostBundleDirectory: string, timing: (stage: string) => void = () => {}) {
  const id = "fixture.external-sdk", directory = path.join(parent, "external plugin SDK");
  const manage = async (input: Record<string, unknown>) => {
    const response = await fetch(url + "/api/plugins", { method: "POST",
      headers: { Origin: url, "Content-Type": "application/json" }, body: JSON.stringify(input) });
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    timing(`external-plugin-${input.action}`);
    if (input.action === "dependencies" && result.npm) console.log(JSON.stringify({stage:"bundled-npm-preparation",...result.npm}));
    return result;
  };
  await manage({ action: "scaffold", directory, id });
  assert.equal((await manage({ action: "validate", directory })).valid, true);
  await manage({ action: "register", directory });
  try {
    const plugins = (await (await fetch(url + "/api/plugins")).json()).plugins;
    await manage({ action: "trust", id, registrationId: plugins.find((p: any) => p.id === id).registrationId, digest: plugins.find((p: any) => p.id === id).digest });
    await manage({ action: "enable", id });
    const invoked = await manage({ action: "invoke", operation: `${id}.greet`, input: { name: "External" } });
    assert.deepEqual(invoked.result, { greeting: "Hello, External!" });
    assert.equal(invoked.receipt.outcome, "success");
    const manifestFileForCli = path.join(directory, "litzio-plugin.json");
    const manifestForCli = JSON.parse(readFileSync(manifestFileForCli, "utf8"));
    manifestForCli.operations = [PLUGIN_CLI_OPERATION];
    writeFileSync(manifestFileForCli, JSON.stringify(manifestForCli));
    writeFileSync(path.join(directory, "host.mjs"), PLUGIN_CLI_SOURCE);
    await manage({ action: "install", directory });
    await verifyPluginCli(async args => (await manage({ action: "invoke", operation: `${id}.run`, input: { args } })).result, parent);
    // The remaining probes need only private screen handlers.
    await manage({ action: "unregister", id });
    writeFileSync(manifestFileForCli, JSON.stringify({ ...manifestForCli, operations: [] }));
    await manage({ action: "install", directory });
    // Shipped compiler/npm must work outside asar with the Host's own Node/Electron.
    const packageFile = path.join(directory, "package.json");
    const pkg = existsSync(packageFile) ? JSON.parse(readFileSync(packageFile, "utf8")) : {name:id,private:true,type:"module"};
    pkg.dependencies = { "fixture-screen-library": "file:./library" };
    writeFileSync(packageFile, JSON.stringify(pkg));
    mkdirSync(path.join(directory, "library"));
    writeFileSync(path.join(directory,"library/package.json"), JSON.stringify({name:"fixture-screen-library",version:"1.0.0",main:"index.js",scripts:{postinstall:"node -e \"require('fs').writeFileSync('script-ran','bad')\""}}));
    writeFileSync(path.join(directory,"library/index.js"), 'exports.label="Offline library";');
    await manage({action:"dependencies",directory});
    assert.equal(existsSync(path.join(directory,"node_modules/fixture-screen-library/script-ran")), false);
    const manifestFile = path.join(directory,"litzio-plugin.json");
    const manifest = JSON.parse(readFileSync(manifestFile,"utf8"));
    manifest.screen="screen.jsx";
    writeFileSync(manifestFile,JSON.stringify(manifest));
    writeFileSync(path.join(directory,"screen.jsx"),'import React from "react";import {label} from "fixture-screen-library";export default function Screen(){return <output>{label}</output>}');
    const bundled=await manage({action:"bundle",directory});assert.ok(bundled.files[0].bytes>0);
    renameSync(path.join(directory,"node_modules"),path.join(parent,"authoring libraries"));
    await manage({action:"reload",id});
    const catalog=await (await fetch(url+"/api/plugin-screens",{method:"POST",headers:{Origin:url,"Content-Type":"application/json"},body:JSON.stringify({action:"screens"})})).json();
    const screen=catalog.screens.find((screen:any)=>screen.plugin===id);
    const module=await import(`data:text/javascript;base64,${Buffer.from(screen.code).toString("base64")}`);
    const React={createElement:(type:string,_props:unknown,value:string)=>({type,value})};
    assert.deepEqual(module.default(React)({}),{type:"output",value:"Offline library"});
    // A caller-selected SDK parent must grant no access to private Host files.
    // CLI-only chunks may exist; the SDK itself is built without shared chunks.
    const privateFile = path.join(hostBundleDirectory,
      readdirSync(hostBundleDirectory).find(name => /^chunk-.*\.mjs$/.test(name)) ?? "cli.mjs");
    const entry = path.join(directory, "host.mjs");
    const source = readFileSync(entry, "utf8");
    for (const prefix of [
      `import ${JSON.stringify(pathToFileURL(privateFile).href)};`,
      ...["sdkRequire.resolve", "sdkRequire"].map(call =>
        `import {createRequire} from 'node:module'; const sdkRequire = createRequire(import.meta.resolve('@litzio/plugin-sdk')); ${call}(${JSON.stringify(privateFile)});`),
    ]) {
      writeFileSync(entry, prefix + "\n" + source);
      const current = (await (await fetch(url + "/api/plugins")).json()).plugins.find((p: any) => p.id === id);
      await manage({ action: "trust", id, registrationId: current.registrationId, digest: current.digest });
      const refused = await fetch(url + "/api/plugins", { method: "POST", headers: { Origin: url, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reload", id }) });
      assert.equal(refused.status, 400, await refused.text());
      assert.equal((await (await fetch(url + "/api/plugins")).json()).plugins.find((p: any) => p.id === id).running, false);
    }
  } finally { await manage({ action: "unregister", id }); }
}

/** Shared Node plugin fixture; CLI semantics remain owned by CLI/Core tests. */
export const PLUGIN_CLI_OPERATION = { id: "run", effect: "write", inputSchema: { type: "object", properties: { args: { type: "array", items: { type: "string" } } }, required: ["args"], additionalProperties: false }, outputSchema: { type: "object" } };
export const PLUGIN_CLI_SOURCE = `import { spawnSync } from 'node:child_process';
import { PluginOperationError } from '@litzio/plugin-sdk';
export function activate(context) { return {
  operations: { run: ({args}) => {
    if (!context.cli) throw new PluginOperationError('unavailable');
    const result = spawnSync(context.cli.bin, [...context.cli.args, ...args], {encoding:'utf8', windowsHide:true});
    if (result.error) throw new PluginOperationError('failed');
    return {status:result.status, stdout:result.stdout, stderr:result.stderr};
  } },
  status: () => ({available:!!context.cli, message:context.cli ? 'CLI ready' : 'This Host has no official CLI launcher'}),
  dispose() {}
}; }
`;

export async function verifyPluginCli(invoke: (args: string[]) => Promise<any>, parent: string) {
  const file = path.join(parent, "plugin report.md"), input = path.join(parent, "authoring.json"), batch = path.join(parent, "batch.json");
  writeFileSync(input, JSON.stringify({authoring:{inputs:[{key:"result",blocks:[
    {kind:"paragraph",text:"Before"},
    {kind:"figure",imageAsset:"picture",imageAlt:"Picture",caption:"Result"}
  ]}]},images:[{key:"picture",mime:"image/png",base64:"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII="}]}));
  const created = await invoke(["create", file, "--input", input, "--format", "json"]);
  assert.equal(created.status, 0, created.stderr);
  const receipt = JSON.parse(created.stdout);
  assert.equal(readFileSync(file,"utf8"), receipt.source);
  const image = /\.\/assets\/[^\r\n]+\.png/.exec(receipt.source);
  assert.ok(image, receipt.source); assert.ok(existsSync(path.resolve(parent, image[0])));
  writeFileSync(batch, JSON.stringify([{command:"replace-text",from:"Before",to:"After"}]));
  const edited = await invoke(["apply-batch", file, "--operations", batch]);
  assert.equal(edited.status, 0, edited.stderr);
  assert.match(readFileSync(file,"utf8"), /After/);
  const checked = await invoke(["check", file, "--format", "json"]);
  assert.equal(checked.status, 0, checked.stderr);
}

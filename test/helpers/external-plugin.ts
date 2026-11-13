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
    // Shipped compiler/npm must work outside asar with the Host's own Node/Electron.
    const packageFile = path.join(directory, "package.json");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    pkg.dependencies = { "fixture-screen-library": "file:./library" };
    writeFileSync(packageFile, JSON.stringify(pkg));
    mkdirSync(path.join(directory, "library"));
    writeFileSync(path.join(directory,"library/package.json"), JSON.stringify({name:"fixture-screen-library",version:"1.0.0",main:"index.js",scripts:{postinstall:"node -e \"require('fs').writeFileSync('script-ran','bad')\""}}));
    writeFileSync(path.join(directory,"library/index.js"), 'exports.label="Offline library";');
    await manage({action:"dependencies",directory});
    assert.equal(existsSync(path.join(directory,"node_modules/fixture-screen-library/script-ran")), false);
    const manifestFile = path.join(directory,"litzio-plugin.json");
    const manifest = JSON.parse(readFileSync(manifestFile,"utf8"));
    manifest.contributes.screens=[{id:"main",title:"External chart",icon:"ChartColumn",entry:"screen.jsx"}];
    writeFileSync(manifestFile,JSON.stringify(manifest));
    writeFileSync(path.join(directory,"screen.jsx"),'import React from "react";import {label} from "fixture-screen-library";export default function Screen(){return <output>{label}</output>}');
    const bundled=await manage({action:"bundle",directory});assert.ok(bundled.files[0].bytes>0);
    renameSync(path.join(directory,"node_modules"),path.join(parent,"authoring libraries"));
    await manage({action:"reload",id});
    const catalog=await (await fetch(url+"/api/views",{method:"POST",headers:{Origin:url,"Content-Type":"application/json"},body:JSON.stringify({action:"catalog"})})).json();
    const screen=catalog.screens.find((screen:any)=>screen.plugin===id);
    const module=await import(`data:text/javascript;base64,${Buffer.from(screen.code).toString("base64")}`);
    const React={createElement:(type:string,_props:unknown,value:string)=>({type,value})};
    assert.deepEqual(module.default(React)({}),{type:"output",value:"Offline library"});
    // A caller-selected SDK parent must grant no access to private Host files.
    // CLI-only chunks may exist; the SDK itself is built without shared chunks.
    const privateFile = path.join(hostBundleDirectory,
      readdirSync(hostBundleDirectory).find(name => /^chunk-.*\.mjs$/.test(name)) ?? "cli.mjs");
    const entry = path.join(directory, "host.js");
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

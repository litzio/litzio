import { useRef, useState } from "react";
import { useScreenPathPicker } from "../views/screen-path-picker.tsx";
import type { HostClient } from "../host-client.ts";
import { Button } from "../components/ui/button.tsx";

/** Synthetic Host only. Folder removal during a read demonstrates the scope lifetime. */
export function ScreenPathExample() {
  const lifetime = useRef(new AbortController());
  const [roots, setRoots] = useState(["/example"]), [result, setResult] = useState("");
  const closeDuringRead = useRef(false);
  const [client] = useState<HostClient>(() => ({ assertCurrent() {}, url: path => path, crossOrigin: undefined, async request() {
    if (closeDuringRead.current) { closeDuringRead.current = false; setRoots([]); }
    return Response.json({path:"/example",crumbs:[{name:"Example",path:"/example"}],entries:[
      {kind:"file",path:"/example/source.pdf",name:"source.pdf"}, {kind:"document",path:"/example/report.md",name:"report.md"}]});
  } }));
  const {pickPath, dialog} = useScreenPathPicker(client, roots, lifetime);
  const choose = (kind: "pdf" | "document" | "folder", close = false) => {
    closeDuringRead.current = close;
    void pickPath({kind,initialPath:"/example"}).then(value => setResult(JSON.stringify(value))).catch(error => setResult(error.name));
  };
  return <section aria-label="Screen path selection"><h2>Screen path selection</h2>
    <p>Synthetic opened folder. Selecting returns a path without opening another sidebar folder.</p>
    <div className="ui-gallery-row"><Button variant="outline" disabled={!roots.length} onClick={() => choose("pdf")}>Choose PDF example</Button>
      <Button variant="outline" disabled={!roots.length} onClick={() => choose("document")}>Choose document example</Button>
      <Button variant="outline" disabled={!roots.length} onClick={() => choose("folder", true)}>Pick while folder closes</Button>
      {!roots.length ? <Button variant="outline" onClick={() => setRoots(["/example"])}>Restore example folder</Button> : null}</div>
    <output>{result}</output>{dialog}</section>;
}

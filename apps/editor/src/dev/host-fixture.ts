/** Browser-only fixture entry. Never included in the production client. */
import { createHostRegistry, setHostRegistry } from "../host-client.ts";
setHostRegistry(createHostRegistry([{ hostId: "local", label: "Local", origin: "/" }, { hostId: "remote", label: "Remote", origin: "/fixture/remote" }, { hostId: "off", label: "Offline", origin: "/fixture/off" }]));

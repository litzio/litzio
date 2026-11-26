import type { ScreenFileOpen } from "@litzio/plugin-sdk";
export type ViewTab={id:string;client:import("../host-client.ts").HostClient;root:string;pdf?:string;label?:string;screen?:import("./view-api.ts").ViewScreen;fileOpen?:ScreenFileOpen};

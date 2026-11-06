export type AppResetPlan = {
  operation: "app-reset";
  scope: "local-app-and-host";
  revision: string;
  targets: { path: string; kind: "file" | "directory"; contents: string }[];
  retained: readonly string[];
};

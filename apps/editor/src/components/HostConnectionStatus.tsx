import { useTranslation } from "react-i18next";
import { i18n } from "../i18n.ts";
import type { HostRuntime } from "../host-client.ts";

/** Shared presentation for Explorer, Host selection and Host settings; no connection side effects. */
export function HostConnectionStatus({ state }: { state: HostRuntime["state"] }) {
  useTranslation();
  const text = state === "connected" ? i18n.t("Connected") : state === "connecting" ? i18n.t("Connecting") : i18n.t("Unreachable");
  return <span className={`host-state host-state--${state}`} role="status">
    <span className="host-state-dot rounded-full" aria-hidden="true" />{text}
  </span>;
}

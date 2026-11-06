import { useEffect, useRef, useState } from "react";
import type { CatalogView } from "@litzio/core/views-v2";
import { Button } from "../components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu.tsx";
import { getHostClient } from "../host-client.ts";
import { viewRequest } from "./view-api.ts";
import { i18n } from "../i18n.ts";
/** Conversation entry to its own namespace. Opening never executes a data operation. */
export function ViewFavoritesMenu({
  hostId,
  onOpen,
}: {
  hostId: string;
  onOpen(view: CatalogView): void;
}) {
  const [names, setNames] = useState<string[]>([]),
    [problem, setProblem] = useState(false);
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => {
    lifetime.current = new AbortController();
    return () => lifetime.current?.abort();
  }, [hostId]);
  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) return;
        setProblem(false);
        const signal = lifetime.current!.signal;
        void viewRequest(
          getHostClient(hostId),
          { action: "list", plugin: "litzio.assistant" },
          signal,
        )
          .then((result) => setNames(result.favourites ?? []))
          .catch(() => {
            if (!signal.aborted) setProblem(true);
          });
      }}
    >
      <DropdownMenuTrigger render={<Button size="sm" variant="ghost" />}>
        {i18n.t("Favorites")}
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {problem ? (
          <DropdownMenuItem disabled>{i18n.t("Unavailable")}</DropdownMenuItem>
        ) : names.length ? (
          names.map((name) => (
            <DropdownMenuItem
              key={name}
              onClick={() => {
                const signal = lifetime.current!.signal;
                void viewRequest(
                  getHostClient(hostId),
                  { action: "open", plugin: "litzio.assistant", name },
                  signal,
                )
                  .then((result) => {
                    if (result.view && !signal.aborted) onOpen(result.view);
                  })
                  .catch(() => {
                    if (!signal.aborted) setProblem(true);
                  });
              }}
            >
              {name}
            </DropdownMenuItem>
          ))
        ) : (
          <DropdownMenuItem disabled>
            {i18n.t("No favorites yet.")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

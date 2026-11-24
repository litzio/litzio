#!/usr/bin/env bash
# Spike experiment 2: tasks 1 (edit) and 2 (plugin) x engines (copilot, pi) x repetitions, one fresh isolated Host each.
# Usage: run-exp2.sh <experiment-root outside the user's home> [reps=3] [proxy-port=11600]
# The recording proxy must already run on proxy-port and log to <root>/proxy.jsonl.
# Order interleaves engines inside each repetition so drift over time hits both engines alike.
set -u
E="$1"; REPS="${2:-3}"; PORT="${3:-11600}"
HERE="$(cd "$(dirname "$0")" && pwd)"; CHECKOUT="$(cd "$HERE/../.." && pwd)"
cd "$CHECKOUT"
for rep in $(seq 1 "$REPS"); do
  for task in edit plugin; do
    for engine in copilot pi; do
      R="$E/runs/$task-$engine-$rep"
      if [ -f "$R/result.json" ] && grep -q '"finishedAt"' "$R/result.json"; then echo "skip $R"; continue; fi
      mkdir -p "$R"
      echo "=== $(date '+%H:%M:%S') $task $engine $rep"
      if [ "$engine" = pi ]; then
        export LITZIO_SPIKE_PI_ACP="$HERE/pi-litzio-acp.mjs" PI_SPIKE_ROOT="$R/pi" PI_SPIKE_POWERSHELL=1; unset SPIKE_COPILOT_HOME
      else
        export LITZIO_SPIKE_PI_ACP="$HERE/copilot-home-wrapper.mjs" SPIKE_COPILOT_HOME="$R/copilot-home"; unset PI_SPIKE_ROOT PI_SPIKE_POWERSHELL
      fi
      SPIKE_ENGINE=$engine OLLAMA_URL="http://127.0.0.1:$PORT" PROXY_LOG="$E/proxy.jsonl" SPIKE_MODEL="${SPIKE_MODEL:-gemma4:e4b}" \
        timeout 2700 node_modules/.bin/tsx "$HERE/task-driver.ts" "$task" "$R" > "$R/driver.log" 2>&1
      echo "exit $? $(grep -E '^\[.*turn [12]' "$R/driver.log" | tr '\n' ' ')"
    done
  done
done
echo "=== done $(date '+%H:%M:%S')"

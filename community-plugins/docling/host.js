/** @param {import("@litzio/plugin-sdk").PluginContext} context */
export function activate(context) {
  const requests = new Set();
  async function checkConnection() {
    let base;
    try {
      base = new URL(String(context.settings.serverUrl ?? "http://127.0.0.1:5001"));
      if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error();
    } catch {
      return [{ server: "미설정", status: "오류", detail: "설정의 HTTP(S) URL을 확인하세요." }];
    }
    const controller = new AbortController();
    requests.add(controller);
    const timer = setTimeout(() => controller.abort(), 5000);
    const server = base.href.replace(/\/$/, "");
    const row = (status, detail) => [{ server, status, detail }];
    try {
      const response = await fetch(server + "/health", {
        headers: context.secrets?.["api-key"] ? { "X-Api-Key": context.secrets["api-key"] } : {},
        signal: controller.signal, redirect: "error",
      });
      if (!response.ok) {
        await response.body?.cancel();
        const detail = response.status === 401 ? "인증 키를 확인하세요." : response.status === 403 ? "접근 권한을 확인하세요." : response.status === 404 ? "서버 주소를 확인하세요." : "서버 응답 오류입니다.";
        return row("오류", detail + ` (HTTP ${response.status})`);
      }
      const body = await response.json();
      return body?.status === "ok" ? row("연결됨", "health 정상 · 변환 및 인증 권한은 미확인") : row("오류", "docling-serve health 응답을 확인하세요.");
    } catch {
      return row("오류", controller.signal.aborted ? "연결 시간이 초과됐습니다." : "서버 주소와 연결을 확인하세요.");
    } finally {
      clearTimeout(timer);
      requests.delete(controller);
    }
  }
  return {
    operations: { connection: async () => checkConnection() },
    status: () => ({ available: true, message: "연결 상태 화면에서 수동으로 조회하세요.", folders: [], decorations: [], accounts: [] }),
    dispose() { for (const controller of requests) controller.abort(); },
  };
}

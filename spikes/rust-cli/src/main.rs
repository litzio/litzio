// Spike: a Rust client for the Host-calling litzio CLI commands only.
// Mirrors packages/cli/src/plugins.ts (pluginCli) and the local-write-statistics
// branch of packages/cli/src/cli.ts. It never parses or edits documents.
use serde_json::{Map, Value};
use std::io::Write;
use std::process::ExitCode;
use std::time::Duration;

const DAEMON_PROTOCOL: &str = "4";

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if std::env::var_os("LITZIO_RS_PRINT_STARTED").is_some() {
        // Spike check only: compare with the PowerShell/WMI value for the same PID.
        println!("{} {}", std::process::id(), guard::process_start_ticks());
        std::thread::sleep(Duration::from_secs(3));
        return ExitCode::SUCCESS;
    }
    let code = match args.first().map(String::as_str) {
        // Not read-only in the Node CLI, so it holds the app-reset writer guard (cli.ts entry).
        Some("plugins") | Some("operation") => match guard::actor() {
            Ok(release) => { let code = plugin_cli(&args); release.release(); code }
            Err(message) => {
                eprintln!("Cannot acquire the app-reset writer guard: {message}. This write command cannot run with restricted permissions. Edit the document file directly with the editing tool, then run litzio check.");
                1
            }
        },
        Some("local-write-statistics") => local_write_statistics(&args),
        _ => {
            eprintln!("litzio-rs spike: only `plugins list`, `operation invoke` and `local-write-statistics` are implemented");
            2
        }
    };
    ExitCode::from(code)
}

/// Mirrors apps/editor/server/reset-guard.ts `actor("cli")` with the same file format.
/// The start identity is the same value daemon-state.ts `processStart` reads through
/// PowerShell/WMI (`CreationDate.ToUniversalTime().Ticks`), but read with GetProcessTimes.
mod guard {
    use std::path::PathBuf;

    #[repr(C)]
    #[derive(Default)]
    struct FileTime { low: u32, high: u32 }
    #[link(name = "kernel32")]
    extern "system" {
        fn GetCurrentProcess() -> isize;
        fn GetProcessTimes(process: isize, creation: *mut FileTime, exit: *mut FileTime, kernel: *mut FileTime, user: *mut FileTime) -> i32;
    }

    /// .NET ticks (100 ns since 0001-01-01 UTC), truncated to WMI's microsecond precision.
    pub fn process_start_ticks() -> u64 {
        let (mut creation, mut exit, mut kernel, mut user) = Default::default();
        let ok = unsafe { GetProcessTimes(GetCurrentProcess(), &mut creation, &mut exit, &mut kernel, &mut user) };
        assert!(ok != 0, "GetProcessTimes failed");
        let filetime = ((creation.high as u64) << 32) | creation.low as u64; // since 1601-01-01
        filetime / 10 * 10 + 504_911_232_000_000_000
    }

    pub struct Release(PathBuf);
    impl Release {
        pub fn release(self) { let _ = std::fs::remove_file(&self.0); }
    }

    pub fn actor() -> Result<Release, String> {
        let directory = std::env::var_os("LITZIO_RESET_DIR").map(PathBuf::from).unwrap_or_else(|| {
            PathBuf::from(std::env::var_os("USERPROFILE").unwrap_or_default()).join(".litzio-reset-guard")
        });
        std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
        let pid = std::process::id();
        let started = process_start_ticks();
        // Unique, never-reused name; the Node CLI uses a random UUID here.
        let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
        let file = directory.join(format!("actor-{pid}-{started:x}-{nanos:x}.json"));
        let body = format!(r#"{{"pid":{pid},"started":"{started}","role":"cli"}}"#);
        std::fs::OpenOptions::new().write(true).create_new(true).open(&file)
            .and_then(|mut handle| std::io::Write::write_all(&mut handle, body.as_bytes()))
            .map_err(|error| error.to_string())?;
        // Publish THEN check, as the Node guard does.
        if directory.join("exclusive.json").exists() {
            Release(file).release();
            return Err("App reset is in progress. Retry after it finishes.".into());
        }
        Ok(Release(file))
    }
}

/// Same acceptance as `new URL(x)` + the CLI's origin checks, for http only.
/// Returns the serialized origin (`URL.origin`).
fn origin(target: &str, message: &str) -> Result<String, String> {
    let lower = target.to_ascii_lowercase();
    if lower.starts_with("https://") {
        return Err("Error: https is not implemented in this spike".into());
    }
    let rest = lower.strip_prefix("http://").ok_or_else(|| message.to_string())?;
    let authority = rest.strip_suffix('/').unwrap_or(rest);
    if authority.is_empty() || authority.contains(['/', '?', '#', '@']) {
        return Err(message.to_string());
    }
    let authority = authority.strip_suffix(":80").unwrap_or(authority);
    Ok(format!("http://{authority}"))
}

fn agent(timeout: Option<Duration>) -> ureq::Agent {
    let mut builder = ureq::AgentBuilder::new().redirects(0);
    if let Some(timeout) = timeout {
        builder = builder.timeout(timeout);
    }
    builder.build()
}

/// ureq reports 4xx/5xx as Err(Status); the Node CLI reads those bodies as well.
fn response(result: Result<ureq::Response, ureq::Error>) -> Result<(u16, String), String> {
    let response = match result {
        Ok(response) => response,
        Err(ureq::Error::Status(_, response)) => response,
        // Node prints only the TypeError message for network failures.
        Err(_) => return Err("TypeError: fetch failed".into()),
    };
    let status = response.status();
    let body = response.into_string().map_err(|error| format!("Error: {error}"))?;
    Ok((status, body))
}

fn plugin_request(tokens: &[&str]) -> Result<Value, String> {
    let usage = "Error: plugins list|... (spike implements list and operation invoke only)";
    match (tokens.first().copied(), tokens.get(1).copied()) {
        (Some("operation"), Some("invoke")) => {
            if tokens.len() != 5 || tokens[3] != "--input" {
                return Err("Error: operation invoke <id> --input <json-file>".into());
            }
            let text = std::fs::read_to_string(tokens[4]).map_err(|error| format!("Error: {error}"))?;
            let input: Value = serde_json::from_str(&text).map_err(|error| format!("SyntaxError: {error}"))?;
            let mut body = Map::new();
            body.insert("action".into(), "invoke".into());
            body.insert("operation".into(), tokens[2].into());
            body.insert("input".into(), input);
            Ok(Value::Object(body))
        }
        (Some("plugins"), Some("list")) if tokens.len() == 2 => Ok(serde_json::json!({ "action": "list" })),
        _ => Err(usage.into()),
    }
}

fn plugin_cli(args: &[String]) -> u8 {
    let mut dispatched = false;
    let result = (|| -> Result<u8, String> {
        let index = args.iter().position(|arg| arg == "--host");
        let target = index.and_then(|i| args.get(i + 1)).ok_or("Error: An explicit --host <http(s) origin> is required")?;
        let origin = origin(target, "Error: Expected Host origin")?;
        let tokens: Vec<&str> = args.iter().enumerate()
            .filter(|(i, arg)| Some(*i) != index && Some(*i) != index.map(|i| i + 1) && arg.as_str() != "--json")
            .map(|(_, arg)| arg.as_str()).collect();
        let body = plugin_request(&tokens)?;
        let (status, health) = response(agent(Some(Duration::from_secs(5)))
            .get(&format!("{origin}/daemon/health")).set("X-Litzio-Protocol", DAEMON_PROTOCOL).call())?;
        let health: Value = serde_json::from_str(&health).map_err(|error| format!("SyntaxError: {error}"))?;
        if !(200..300).contains(&status) || health.get("protocolVersion") != Some(&Value::from(DAEMON_PROTOCOL)) {
            return Err("Error: Host protocol check failed".into());
        }
        dispatched = true;
        let waits = body.get("action").and_then(Value::as_str) == Some("invoke");
        let (status, text) = response(agent(if waits { None } else { Some(Duration::from_secs(30)) })
            .post(&format!("{origin}/api/plugins"))
            .set("Content-Type", "application/json").set("Origin", &origin)
            .send_string(&body.to_string()))?;
        let value: Value = serde_json::from_str(&text).map_err(|error| format!("SyntaxError: {error}"))?;
        let mut output = Map::new();
        output.insert("target".into(), origin.clone().into());
        if let Value::Object(fields) = &value {
            for (key, field) in fields { output.insert(key.clone(), field.clone()); }
        }
        let json = args.iter().any(|arg| arg == "--json");
        let error = value.get("error").filter(|e| !e.is_null() && *e != &Value::Bool(false) && *e != &Value::from(""));
        let line = if json || tokens[0] != "operation" || error.is_none() {
            Value::Object(output).to_string()
        } else {
            let code = value.get("code").and_then(Value::as_str).map(|c| format!("{c}: ")).unwrap_or_default();
            let message = value.get("message").and_then(Value::as_str).map(str::to_string)
                .unwrap_or_else(|| error.map(|e| e.as_str().map(str::to_string).unwrap_or_else(|| e.to_string())).unwrap_or_default());
            format!("{code}{message}")
        };
        println!("{line}");
        let outcome = value.get("receipt").and_then(|r| r.get("outcome"));
        Ok(if (200..300).contains(&status) && outcome.map_or(true, |o| o == "success") { 0 } else { 1 })
    })();
    match result {
        Ok(code) => code,
        Err(reason) => {
            let outcome = if dispatched { "uncertain" } else { "failure" };
            println!("{}", serde_json::json!({ "outcome": outcome, "reason": reason }));
            1
        }
    }
}

fn local_write_statistics(args: &[String]) -> u8 {
    let result = (|| -> Result<(), String> {
        if args.len() != 4 || args[1] != "--host" || args[3] != "--json" {
            return Err("Usage: litzio local-write-statistics --host <origin> --json".into());
        }
        let origin = origin(&args[2], "Expected a Host origin.")?;
        let (status, text) = response(agent(Some(Duration::from_secs(10)))
            .get(&format!("{origin}/api/local-write-statistics")).set("X-Litzio-Protocol", DAEMON_PROTOCOL).call())
            .map_err(|error| error.trim_start_matches("TypeError: ").to_string())?;
        if !(200..300).contains(&status) {
            return Err(format!("Could not read fast Save statistics (HTTP {status})."));
        }
        let value: Value = serde_json::from_str(&text).map_err(|error| error.to_string())?;
        let mut out = std::io::stdout().lock();
        writeln!(out, "{value}").map_err(|error| error.to_string())
    })();
    match result {
        Ok(()) => 0,
        Err(reason) => { eprintln!("{reason}"); 1 }
    }
}

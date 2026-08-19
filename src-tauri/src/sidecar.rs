use serde::Serialize;
use std::fs;
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

pub const SIDECAR_STATUS_EVENT: &str = "sidecar-status";

#[derive(Serialize, Clone, PartialEq)]
pub enum SidecarPhase {
    Starting,
    Running,
    Crashed,
    Stopped,
}

#[derive(Serialize, Clone)]
pub struct SidecarStatus {
    pub port: u16,
    pub running: bool,
    pub phase: String,
    pub restarts: u32,
}

#[derive(Serialize, Clone)]
pub struct SidecarConfig {
    pub port: u16,
    pub terminal_port: u16,
}

pub struct SidecarState {
    pub config: Mutex<Option<SidecarConfig>>,
    child: Mutex<Option<CommandChild>>,
    restarts: Mutex<u32>,
    last_crash: Mutex<Option<Instant>>,
    app: AppHandle,
    stopped: Mutex<bool>,
}

impl SidecarState {
    pub fn new(app: AppHandle) -> Self {
        Self {
            config: Mutex::new(None),
            child: Mutex::new(None),
            restarts: Mutex::new(0),
            last_crash: Mutex::new(None),
            app,
            stopped: Mutex::new(false),
        }
    }

    fn emit(&self, phase: SidecarPhase, port: u16) {
        let restarts = self.restarts.lock().map(|g| *g).unwrap_or(0);
        let status = SidecarStatus {
            port,
            running: phase == SidecarPhase::Running,
            phase: match phase {
                SidecarPhase::Starting => "starting".into(),
                SidecarPhase::Running => "running".into(),
                SidecarPhase::Crashed => "crashed".into(),
                SidecarPhase::Stopped => "stopped".into(),
            },
            restarts,
        };
        let _ = self.app.emit(SIDECAR_STATUS_EVENT, status);
    }

    pub fn stop(&self) {
        *self.stopped.lock().unwrap() = true;
        if let Ok(mut guard) = self.child.lock() {
            if let Some(child) = guard.take() {
                let _ = child.kill();
            }
        }
        let port = self.config.lock().unwrap().as_ref().map(|c| c.port).unwrap_or(0);
        self.emit(SidecarPhase::Stopped, port);
    }

    /// Kill current child and spawn a fresh one. Keeps the same ports.
    pub fn restart(&self) -> anyhow::Result<SidecarStatus> {
        self.stop_child_only();
        let cfg = self.config.lock().unwrap().as_ref().cloned();
        if let Some(cfg) = cfg {
            let status = self.spawn(cfg.port, cfg.terminal_port)?;
            return Ok(status);
        }
        Err(anyhow::anyhow!("sidecar not initialized"))
    }

    fn stop_child_only(&self) {
        if let Ok(mut guard) = self.child.lock() {
            if let Some(child) = guard.take() {
                let _ = child.kill();
            }
        }
    }

    /// Spawn the compiled server on the given ports and health-poll it.
    fn spawn(&self, port: u16, terminal_port: u16) -> anyhow::Result<SidecarStatus> {
        // Kill any stale onesist-server / terminal-server processes left over
        // from a previous (force-quit / crashed) session. Otherwise they hold
        // ports 4321/4331/4323, the fresh sidecar conflicts or crash-loops,
        // and the WebView ends up loading a dead page → memory leak.
        kill_stale_processes();

        let app_data = self.app.path().app_data_dir()?;
        fs::create_dir_all(&app_data)?;
        let logs_dir = app_data.join("logs");
        fs::create_dir_all(&logs_dir)?;
        let resources = self.app.path().resource_dir()?;

        let server_dir = ensure_server_dir(&app_data, &resources)?;
        let skills_dir = ensure_skills_dir(&app_data, &resources)?;

        let db_path = app_data.join("data.db");
        let client_dir = server_dir.join("client");
        let migrations_dir = server_dir.join("server").join("assets").join("migrations");
        let log_out = fs::File::create(logs_dir.join("server.log"))?;
        let log_err = fs::File::create(logs_dir.join("server.err.log"))?;

        self.emit(SidecarPhase::Starting, port);

        // Compiled server executable — resolved from src-tauri/binaries/onesist-server-<triple>
        let server = self.app.shell().sidecar("onesist-server")?;
        let (mut rx, child) = server
            .env("PORT", port.to_string())
            .env("TERMINAL_PORT", terminal_port.to_string())
            .env("SA_DB_PATH", db_path.to_string_lossy().to_string())
            .env("SA_CLIENT_DIR", client_dir.to_string_lossy().to_string())
            .env(
                "SA_MIGRATIONS_DIR",
                migrations_dir.to_string_lossy().to_string(),
            )
            .env("SA_VENDOR_SKILLS_DIR", skills_dir.to_string_lossy().to_string())
            .env("NODE_ENV", "production")
            .env("SA_DESKTOP", "1")
            // Default project root for the sidecar: the user's home directory
            // (macOS `open` launches with CWD=/ which would otherwise make
            // all process.cwd()-relative defaults resolve to "/").
            .env("SA_ROOT", dirs::home_dir().map(|p| p.to_string_lossy().to_string()).unwrap_or_default())
            // Full user PATH so installed CLIs (opencode etc.) are found.
            .env("PATH", resolve_user_path())
            .spawn()?;

        let pid = child.pid();
        #[cfg(target_os = "windows")]
        assign_pid_to_job(pid);

        *self.child.lock().unwrap() = Some(child);

        // Drain output + watch for termination in the background.
        let app = self.app.clone();
        std::thread::spawn(move || {
            use std::io::Write;
            let mut out_log = log_out;
            let mut err_log = log_err;
            while let Some(event) = tauri::async_runtime::block_on(rx.recv()) {
                match event {
                    CommandEvent::Stdout(bytes) => {
                        let _ = out_log.write_all(&bytes);
                        let _ = out_log.flush();
                    }
                    CommandEvent::Stderr(bytes) => {
                        let _ = err_log.write_all(&bytes);
                        let _ = err_log.flush();
                    }
                    CommandEvent::Terminated(payload) => {
                        eprintln!("[sidecar] server exited: {:?}", payload);
                        // Notify the app so crash recovery can run.
                        let _ = app.emit("sidecar-terminated", payload.code);
                    }
                    _ => {}
                }
            }
        });

        let healthy = wait_healthy(port);
        let status = SidecarStatus {
            port,
            running: healthy,
            phase: if healthy { "running".into() } else { "crashed".into() },
            restarts: *self.restarts.lock().unwrap(),
        };
        if healthy {
            self.emit(SidecarPhase::Running, port);
        }
        Ok(status)
    }

    /// Full startup used once at app launch. Returns (state, status).
    pub fn start(&self) -> anyhow::Result<SidecarStatus> {
        let port = pick_free_port(4321);
        // Terminal port independent of the HTTP port, in a stable low range —
        // port+10 could exceed the ephemeral port range when the HTTP port is
        // forced high by conflicts, and pick_free_port would return 0.
        let terminal_port = pick_free_port(4331);
        *self.config.lock().unwrap() = Some(SidecarConfig { port, terminal_port });
        *self.stopped.lock().unwrap() = false;
        let status = self.spawn(port, terminal_port)?;
        Ok(status)
    }

    /// Crash recovery policy: max 3 restarts in 60s. Returns true if respawned.
    pub fn on_terminated(&self) -> bool {
        eprintln!("[sidecar] on_terminated called");
        if *self.stopped.lock().unwrap() {
            eprintln!("[sidecar] stopped flag set — no restart");
            return false; // deliberate stop — do not respawn
        }
        let mut restarts = self.restarts.lock().unwrap();
        let mut last = self.last_crash.lock().unwrap();
        let now = Instant::now();
        if let Some(prev) = *last {
            if now.duration_since(prev) > Duration::from_secs(60) {
                *restarts = 0; // window expired — reset counter
            }
        }
        if *restarts >= 3 {
            eprintln!("[sidecar] crash limit reached — not restarting");
            let port = self.config.lock().unwrap().as_ref().map(|c| c.port).unwrap_or(0);
            self.emit(SidecarPhase::Crashed, port);
            return false;
        }
        *restarts += 1;
        *last = Some(now);
        drop(last);
        drop(restarts);
        eprintln!("[sidecar] restarting (attempt {})", *self.restarts.lock().unwrap());
        if let Ok(cfg) = self.config.lock().unwrap().as_ref().cloned().ok_or(()) {
            let _ = self.spawn(cfg.port, cfg.terminal_port);
        }
        true
    }
}

impl Drop for SidecarState {
    fn drop(&mut self) {
        self.stop();
    }
}

#[cfg(target_os = "windows")]
fn assign_pid_to_job(pid: u32) {
    use windows_sys::Win32::Foundation::*;
    use windows_sys::Win32::System::JobObjects::*;
    use windows_sys::Win32::System::Threading::*;

    unsafe {
        let process_handle = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, 0, pid);
        if process_handle != 0 {
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if job != 0 {
                let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
                info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                SetInformationJobObject(
                    job,
                    JobObjectExtendedLimitInformation,
                    &info as *const _ as *const _,
                    std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                );
                AssignProcessToJobObject(job, process_handle);
            }
            CloseHandle(process_handle);
        }
    }
}

/// Kill stale onesist-server / terminal-server / opencode processes from previous
/// sessions (crashed / force-quit). On Windows, uses taskkill to terminate process trees.
fn kill_stale_processes() {
    #[cfg(target_os = "windows")]
    {
        for img in ["onesist-server.exe", "opencode.exe"] {
            let _ = std::process::Command::new("taskkill")
                .args(["/F", "/T", "/IM", img])
                .status();
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        for pattern in ["onesist-server", "terminal-server.ts"] {
            let _ = std::process::Command::new("pkill")
                .arg("-9")
                .arg("-f")
                .arg(pattern)
                .status();
        }
    }

    // Give the kernel a moment to release ports before we bind.
    std::thread::sleep(std::time::Duration::from_millis(500));
}

fn pick_free_port(start: u16) -> u16 {
    use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
    for port in start..(start + 50) {
        // Check BOTH address families: Bun.serve with hostname "localhost"
        // binds IPv6-only (::1), so testing only 127.0.0.1 would miss an
        // existing dev server on the same port → two servers share one port
        // and the WebView (IPv4) hits the wrong one. If either family is
        // taken, skip the port.
        let v4_addr = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port);
        let v6_addr = SocketAddr::new(IpAddr::V6(Ipv6Addr::LOCALHOST), port);
        let v4_free = TcpListener::bind(v4_addr).is_ok();
        let v6_free = TcpListener::bind(v6_addr).is_ok();
        if v4_free && v6_free {
            return port;
        }
    }
    0
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    if !dst.exists() {
        fs::create_dir_all(dst)?;
    }
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_recursive(&from, &to)?;
        } else {
            fs::copy(&from, &to)?;
        }
    }
    Ok(())
}

fn ensure_server_dir(app_data: &Path, resources: &Path) -> std::io::Result<PathBuf> {
    let server_dir = app_data.join("server");
    // Always refresh the web assets on every launch. A newly bundled
    // executable's HTML manifest references hashed JS/CSS files; if appData
    // still holds assets from a previous install, those hashes 404 → React
    // never boots → UI stuck on "Loading..." with no interactivity.
    if server_dir.exists() {
        fs::remove_dir_all(&server_dir)?;
    }
    fs::create_dir_all(&server_dir)?;
    let dist_dir = resources.join("web-dist");
    if dist_dir.exists() {
        copy_dir_recursive(&dist_dir, &server_dir)?;
    } else {
        eprintln!("[sidecar] resources/web-dist not found at {}", dist_dir.display());
    }
    Ok(server_dir)
}

/// Copy the vendored project skills (vendor/skills) from resources to appData
/// on first run so `SA_VENDOR_SKILLS_DIR` has real files to copy into projects.
fn ensure_skills_dir(app_data: &Path, resources: &Path) -> std::io::Result<PathBuf> {
    let skills_dir = app_data.join("vendor-skills");
    if !skills_dir.join("fsd-analyzer").join("SKILL.md").exists() {
        if skills_dir.exists() {
            fs::remove_dir_all(&skills_dir)?;
        }
        fs::create_dir_all(&skills_dir)?;
        let src = resources.join("vendor-skills");
        if src.exists() {
            copy_dir_recursive(&src, &skills_dir)?;
        } else {
            eprintln!("[sidecar] resources/vendor-skills not found at {}", src.display());
        }
    }
    Ok(skills_dir)
}

/// macOS GUI apps (launched via Finder/`open`) inherit a minimal launchd PATH
/// (/usr/bin:/bin:/usr/sbin:/sbin) that misses homebrew, bun, nvm, proto, etc.
/// Spawn a login shell to resolve the user's complete PATH so the sidecar can
/// find installed CLIs (opencode, claude, codex).
fn resolve_user_path() -> String {
    std::env::var("SHELL")
        .ok()
        .filter(|sh| !sh.is_empty())
        .and_then(|sh| {
            std::process::Command::new(&sh)
                .arg("-l")
                .arg("-c")
                .arg("echo $PATH")
                .output()
                .ok()
                .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        })
        .filter(|p| !p.is_empty())
        .unwrap_or_else(|| std::env::var("PATH").unwrap_or_default())
}

fn wait_healthy(port: u16) -> bool {
    let url = format!("http://127.0.0.1:{}/api/health", port);
    for _ in 0..50 {
        if let Ok(resp) = reqwest::blocking::get(&url) {
            if resp.status().is_success() {
                return true;
            }
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    false
}

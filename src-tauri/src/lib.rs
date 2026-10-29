mod memory;
mod quit_observer;
mod sidecar;
mod tray;

use tauri::{Emitter, Listener, Manager, RunEvent, WebviewUrl};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_window_state::{StateFlags, WindowExt};

/// Native folder picker for the "Open Project" flow. Returns the selected
/// directory path or null when cancelled.
///
/// Uses the non-blocking callback API (runs the dialog on the main thread,
/// parented to the WebView window) instead of blocking_pick_folder, which is
/// reported to deadlock with the WebView2 event loop on Windows and loses the
/// parent window context. The command awaits the callback result asynchronously.
#[tauri::command]
async fn pick_folder(window: tauri::WebviewWindow) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = std::sync::mpsc::channel::<Option<String>>();
    let builder = window
        .dialog()
        .file()
        .set_title("Select Project Folder");
    builder.pick_folder(move |path| {
        let _ = tx.send(path.map(|p| p.to_string()));
    });
    rx.recv().map_err(|e| e.to_string())
}

const MAX_WINDOWS: usize = 5;
const PANE_TABS: [&str; 5] = ["erd", "spec", "tasks", "fsd", "review"];

/// The origin new windows load from: the main window's own origin. A debug build's main
/// window loads the Vite dev server, not the sidecar, so the sidecar port alone is wrong there.
fn app_origin(app: &tauri::AppHandle) -> String {
    if let Some(url) = app.get_webview_window("main").and_then(|w| w.url().ok()) {
        let origin = url.origin().ascii_serialization();
        if origin.starts_with("http://") {
            return origin;
        }
    }
    let port = app
        .try_state::<sidecar::SidecarState>()
        .and_then(|s| s.get_port())
        .unwrap_or(4321);
    log::warn!("[window] app_origin fell back to sidecar port {port} (main window url unavailable)");
    format!("http://127.0.0.1:{}", port)
}

/// The URL of a pane window (Fase 5E). Only a plain project id and a known tab get through;
/// the origin never comes from the page.
fn pane_window_url(origin: &str, project_id: &str, tab: &str) -> Result<String, String> {
    let plain = !project_id.is_empty()
        && project_id.len() <= 64
        && project_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if !plain {
        return Err("project id tidak valid".into());
    }
    if !PANE_TABS.contains(&tab) {
        return Err("tab tidak bisa dibuka di window terpisah".into());
    }
    Ok(format!("{}/pane/{}/{}", origin, project_id, tab))
}

/// Async on purpose: on Windows, building a webview window inside a synchronous
/// command deadlocks the main thread (WebviewWindowBuilder "Known issues",
/// wry#583, tauri#13092) — the new window stays blank white and the frozen
/// event loop ignores the close button. An async command runs off the main
/// thread, so build() can dispatch to it and wait safely.
#[tauri::command]
async fn open_pane_window(
    app: tauri::AppHandle,
    project_id: String,
    tab: String,
) -> Result<String, String> {
    if app.webview_windows().len() >= MAX_WINDOWS {
        return Err(format!("Limit {} window tercapai", MAX_WINDOWS));
    }
    let url = pane_window_url(&app_origin(&app), &project_id, &tab)?;
    let label = format!("pane-{}", uuid::Uuid::new_v4().simple());
    let built = tauri::WebviewWindowBuilder::new(
        &app,
        &label,
        WebviewUrl::External(url.parse::<url::Url>().map_err(|e| e.to_string())?),
    )
    .title("Onesist")
    .inner_size(1100.0, 800.0)
    .min_inner_size(600.0, 400.0)
    // HTML5 file drops, not Tauri's — same as the other windows.
    .disable_drag_drop_handler()
    .build();
    match &built {
        Ok(_) => log::info!("[window] pane window {label} opened -> {url}"),
        Err(e) => log::error!("[window] pane window {label} FAILED ({url}): {e}"),
    }
    built.map_err(|e| e.to_string())?;
    Ok(label)
}

/// Async for the same Windows reason as open_pane_window: a synchronous
/// command building a webview window deadlocks the main thread there.
#[tauri::command]
async fn open_project_window(
    app: tauri::AppHandle,
    path: Option<String>,
) -> Result<String, String> {
    let count = app.webview_windows().len();
    if count >= MAX_WINDOWS {
        return Err(format!("Limit {} window tercapai", MAX_WINDOWS));
    }
    let target = path.unwrap_or_else(|| "/".to_string());
    if !target.starts_with('/') {
        return Err("path harus mulai dengan /".into());
    }
    let url = format!("{}{}", app_origin(&app), target);
    let label = format!("win-{}", uuid::Uuid::new_v4().simple());
    let built = tauri::WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(url.parse::<url::Url>().map_err(|e| e.to_string())?))
        .title("Onesist")
        .inner_size(1440.0, 900.0)
        .min_inner_size(800.0, 600.0)
        // HTML5 file drops (composer attachments) instead of Tauri's own
        // drag-drop events — see the note on the main window.
        .disable_drag_drop_handler()
        .build();
    match &built {
        Ok(_) => log::info!("[window] project window {label} opened -> {url}"),
        Err(e) => log::error!("[window] project window {label} FAILED ({url}): {e}"),
    }
    let window = built.map_err(|e| e.to_string())?;
    // Only main window uses close-to-tray; other windows close normally
    let label_clone = label.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { .. } = event {
            // Allow win-* to close; main is handled separately in tray.rs
            if label_clone == "main" {
                // handled by tray.rs
            }
        }
    });
    Ok(label)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_opener::init())
    // Only the main window's place is remembered: other windows have random labels, which
    // would pile up in the state file, and must never come back hidden (AGENTS.md).
    .plugin(tauri_plugin_window_state::Builder::default().with_filter(|label| label == "main").build())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_process::init())
    // Native notifications for finished / approval-blocked agent runs (FR-B16).
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .invoke_handler(tauri::generate_handler![pick_folder, open_project_window, open_pane_window])
    .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
      if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
      }
    }))
    .setup(|app| {
      // Log plugin on ALL builds: a release build has no console to catch
      // eprintln!/log output, so a Windows-only bug we cannot reproduce on
      // macOS can still be diagnosed from the shipped app's log dir
      // (Windows: %APPDATA%/com.rogasper.onesist/logs, macOS: ~/Library/Logs/
      // com.rogasper.onesist). Stdout keeps dev behavior unchanged; the file
      // is capped and rotated so it cannot grow without bound.
      app.handle().plugin(
        tauri_plugin_log::Builder::default()
          .level(log::LevelFilter::Info)
          .targets([
            tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
            tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
              file_name: Some("shell".into()),
            }),
          ])
          .max_file_size(512_000)
          .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepOne)
          .build(),
      )?;

      // On Windows, cap WebView2 (Chromium) V8 heap and enable timer throttling when hidden
      // to keep RAM consumption low under intense TUI ANSI streams (xterm.js).
      #[cfg(target_os = "windows")]
      {
        std::env::set_var(
          "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
          "--js-flags=\"--max-old-space-size=512\" --disable-background-timer-throttling=0",
        );
      }

      // Watch our own RSS (Tauri shell + WebView) — the sidecar has its own
      // watchdog, but nothing guarded the main process against a leaking
      // WebView (observed 80 GB during update install/relaunch on macOS).
      memory::spawn_memory_watchdog();
      // macOS: Dock right-click Quit / Cmd+Q do not reliably fire
      // ExitRequested (tauri#9198) — without this hook the close-to-tray
      // handler would hide the window instead of exiting, leaving a hidden
      // WebView leaking memory forever.
      #[cfg(target_os = "macos")]
      quit_observer::install();

      // Launch splash (pure CSS, centered logo + ONESIST + by rogasper.com) — shown on
      // EVERY launch: it covers the wait for the sidecar to become healthy and closes
      // once the main window is ready (with a minimum display time so a fast start
      // doesn't just flash it). It is created before the sidecar on purpose.
      // The splash keeps Tauri's drag-drop handler on purpose: it has no
      // page-side drop target, so swallowing a stray drop is safer there
      // than letting WebKit navigate the window to a dropped file.
      // App URLs resolve differently per build: against the Vite dev server in dev,
      // where the splash lives at the public root (/splash.html), and against
      // dist/client in production builds (dist/client/splash.html). One hard-coded
      // path 404'd the other side — the dev splash rendered as a blank white window.
      let mut splash_window: Option<tauri::WebviewWindow> = None;
      // The setup closure blocks the event loop while the sidecar boots, so the splash's
      // webview can only actually load its page AFTER setup returns — a close timer
      // started at creation would fire first and the user would only ever see the
      // webview's default white. The close is therefore gated on the page-load-finished
      // signal (with a hard timeout fallback), plus a beat of visible content.
      let (page_loaded_tx, page_loaded_rx) = std::sync::mpsc::channel::<()>();
      // In dev, build the splash URL explicitly against the dev server, exactly the way
      // the main window builds its URL — that External path is the proven-working one.
      // In production the bundled asset path applies (dist/client/splash.html).
      let splash_url = if cfg!(debug_assertions) {
        let dev = std::env::var("SA_DEV_SERVER_URL")
          .unwrap_or_else(|_| "http://localhost:4321".to_string());
        let base = match dev.parse::<url::Url>() {
          Ok(u) if u.scheme() == "http" || u.scheme() == "https" => u,
          _ => url::Url::parse("http://localhost:4321").expect("static fallback url"),
        };
        WebviewUrl::External(base.join("splash.html").map_err(|e| e.to_string())?)
      } else {
        WebviewUrl::App("client/splash.html".into())
      };
      match tauri::WebviewWindowBuilder::new(app, "splash", splash_url)
        .title("Onesist")
        .inner_size(480.0, 320.0)
        .min_inner_size(480.0, 320.0)
        .max_inner_size(480.0, 320.0)
        .decorations(false)
        .center()
        .resizable(false)
        .visible(true)
        .always_on_top(true)
        // Pre-paint matches the app's light background (#fcfcfa, WINDOW_BG.light): the
        // splash page reads the stored theme and repaints dark users within its first
        // frame, and the app's own default is light. The webview's pre-page background
        // must never be the white of an unloaded document.
        .background_color(tauri::webview::Color(252, 252, 250, 255))
        .on_page_load(move |_webview, payload| match payload.event() {
          tauri::webview::PageLoadEvent::Started => {
            log::info!("[splash] page load started: {}", payload.url());
          }
          tauri::webview::PageLoadEvent::Finished => {
            log::info!("[splash] page load finished: {}", payload.url());
            let _ = page_loaded_tx.send(());
          }
        })
        .build() {
        Ok(win) => {
          let url = win.url().map(|u| u.to_string()).unwrap_or_else(|_| "<unknown>".into());
          log::info!("[splash] window created, navigating to {url}");
          splash_window = Some(win);
        }
        Err(e) => eprintln!("[splash] failed to create window: {}", e),
      }

      // Start the sidecar and wait for the web server to become healthy.
      let sc = sidecar::SidecarState::new(app.handle().clone());
      let status = sc.start()?;
      app.manage(sc);

      tray::watch_sidecar_status(app.handle());

      // Crash recovery: when the compiled server exits unexpectedly, respawn
      // it (max 3 attempts in 60s, handled inside SidecarState::on_terminated).
      let recovery_app = app.handle().clone();
      app.listen("sidecar-terminated", move |_event| {
        if let Some(state) = recovery_app.try_state::<sidecar::SidecarState>() {
          state.on_terminated();
        }
      });

      if status.running {
        // Dev builds must load the Vite dev server (tauri.conf.json → build.devUrl),
        // not the sidecar's static copy. The sidecar serves the last PRODUCTION build,
        // and its asset hashes never line up with the live dev tree — which is why
        // `bunx tauri dev` showed an unstyled page (CSS 404: the sidecar had an older
        // index-*.css than the HTML it was serving) while `bunx tauri build` worked.
        // `localhost`, not `127.0.0.1`: the Bun-backed Vite server listens on `[::1]`
        // only, so an IPv4 literal never connects (blank window).
        // Release builds keep the sidecar URL, which is the app's real server.
        let dev_server = if cfg!(debug_assertions) {
            let candidate = std::env::var("SA_DEV_SERVER_URL")
                .unwrap_or_else(|_| "http://localhost:4321".to_string());
            // This string becomes a webview URL — accept only http(s), and fall
            // back to the default rather than letting a stray scheme through.
            match candidate.parse::<url::Url>() {
                Ok(u) if u.scheme() == "http" || u.scheme() == "https" => Some(candidate),
                _ => {
                    eprintln!("[window] SA_DEV_SERVER_URL ignored (only http/https allowed): {candidate}");
                    Some("http://localhost:4321".to_string())
                }
            }
        } else {
            None
        };
        let base = dev_server.unwrap_or_else(|| format!("http://127.0.0.1:{}", status.port));
        let url = format!("{}/", base.trim_end_matches('/'));
        eprintln!("[window] main webview url = {url} (sidecar port {})", status.port);
        let builder = tauri::WebviewWindowBuilder::new(
          app,
          "main",
          WebviewUrl::External(url.parse().expect("valid url")),
        )
        .title("Onesist")
        .inner_size(1440.0, 900.0)
        .min_inner_size(800.0, 600.0)
        // Let the WEB PAGE handle OS file drags. By default Tauri installs its
        // own drag-drop handler, which consumes the drop and emits
        // `tauri://drag-drop` instead — so the DOM never sees `drop`, and
        // dragging a file from Finder onto the chat composer did nothing
        // (reported 2026-09-18, UJI-MANUAL C5). With the handler disabled wry
        // falls through to the platform default, WebKit/WebView2 deliver a
        // normal HTML5 drop, and the page gets a real `File` to upload. The
        // page-side guard against a stray drop navigating the WebView lives in
        // `src/lib/file-drop.ts` (`useGlobalDropGuard`).
        .disable_drag_drop_handler();
        // macOS: overlay title bar — the traffic lights stay native, the rest of
        // the strip is the web page, where the sidebar toggle lives (the page
        // reserves --onesist-titlebar for it and marks the strip as drag region).
        #[cfg(target_os = "macos")]
        let builder = builder
          .title_bar_style(tauri::TitleBarStyle::Overlay)
          .hidden_title(true);
        let window = builder.build()?;
        // Restore position/size/maximized, but NEVER restore a hidden
        // (visible:false) state: a hidden-but-rendering WebView at full
        // resolution leaks memory rapidly (observed 3.7 GB while idle).
        let _ = window.restore_state(
          StateFlags::POSITION | StateFlags::SIZE | StateFlags::MAXIMIZED,
        );
        let _ = window.show();
        let _ = window.set_focus();
        // Close the splash once its page has actually loaded (see the channel above),
        // then keep it on screen one more beat so the logo animation is seen.
        if let Some(splash) = splash_window {
          std::thread::spawn(move || {
            // Hard timeout: if the page never loads, the splash must not stick around.
            let _ = page_loaded_rx.recv_timeout(std::time::Duration::from_secs(15));
            std::thread::sleep(std::time::Duration::from_millis(600));
            let _ = splash.close();
          });
        }
      } else if let Some(splash) = splash_window {
        // Sidecar failed — keep splash briefly then close to avoid stuck screen
        std::thread::sleep(std::time::Duration::from_millis(800));
        let _ = splash.close();
      }

      tray::setup_close_to_tray(app.handle());
      let _ = tray::setup_tray(app.handle());

      // macOS application menu — required for Cmd+Q and dock "Quit" to work.
      // Without a menu with a Quit role, the app ignores quit requests and
      // the process lingers (WebView keeps leaking memory).
      setup_app_menu(app.handle())?;

      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while running tauri application")
    .run(|app, event| {
      match event {
        RunEvent::Exit => {
          // Terminating (Dock Quit / Cmd+Q land here — ExitRequested does not
          // fire reliably on macOS). Mark quitting so the close-to-tray handler
          // can't hide the window instead of letting it close, and stop the
          // sidecar WITHOUT emitting: the status event is delivered to a
          // WebView macOS is already tearing down, and that delivery blocks the
          // main thread on a semaphore inside the terminate callback — measured
          // as a 123-second quit. The sidecar still dies here (and has a PPID
          // watchdog via SA_DESKTOP=1).
          tray::mark_quitting();
          if let Some(state) = app.try_state::<sidecar::SidecarState>() {
            state.stop_quiet();
          }
        }
        // Clicking the Dock icon while the window is hidden-to-tray fires
        // applicationShouldHandleReopen, and without this arm nothing answers
        // it — the icon looks dead. Mirror the tray "Show Onesist" item.
        // (unminimize first: a Dock-minimized window reports visible, so
        // show()+set_focus alone would leave it in the Dock).
        #[cfg(target_os = "macos")]
        RunEvent::Reopen { has_visible_windows, .. } => {
          if !has_visible_windows {
            if let Some(win) = app.get_webview_window("main") {
              let _ = win.unminimize();
              let _ = win.show();
              let _ = win.set_focus();
            }
          }
        }
        // Dock Quit / Cmd+Q trigger ExitRequested on macOS. Mark quitting so
        // the close-to-tray handler lets the window close. Stop the sidecar
        // and hard-exit — Tauri's app.exit() can hang with a tray icon
        // present, leaking WebView memory.
        //
        // EXCEPTION: relaunch() (plugin-process) requests exit with code
        // i32::MAX to signal "restart on exit". Tauri consumes that flag in
        // the Exit event and spawns a new instance (process::restart). The
        // hard-exit below must NOT run for that code, or the app would die on
        // macOS without ever reopening after an update install.
        RunEvent::ExitRequested { code, .. } => {
          const RESTART_EXIT_CODE: i32 = i32::MAX;
          if code != Some(RESTART_EXIT_CODE) {
            tray::mark_quitting();
            // Hard-exit FIRST (in a detached thread) so a hang in sidecar stop
            // or event emission can never prevent termination.
            std::thread::spawn(|| {
              std::thread::sleep(std::time::Duration::from_millis(150));
              std::process::exit(0);
            });
          } else {
            // Restart path (update relaunch): tell the macOS quit observer to
            // stand down — Tauri's Exit handler will spawn the new instance.
            #[cfg(target_os = "macos")]
            quit_observer::mark_restarting();
          }
          // Destroy the window FIRST so the WebView releases its memory
          // instead of lingering until process exit (a live WebView during
          // update install/relaunch teardown was the 80 GB leak source).
          if let Some(win) = app.get_webview_window("main") {
            let _ = win.destroy();
          }
          if let Some(state) = app.try_state::<sidecar::SidecarState>() {
            state.stop_quiet();
          }
        }
        RunEvent::WindowEvent { .. } => {}
        _ => {}
      }
    });
}

/// Build the application menu on ALL platforms.
///
/// macOS: global app menu "Onesist" (About, Check for Update, Changelog, Quit)
/// + Edit + Window. Windows/Linux: window menu bar with the same items (About
/// shows a dialog since PredefinedMenuItem::about is macOS-only).
///
/// "Check for Update" emits a Tauri event the frontend UpdateBanner listens
/// for — it reuses the existing check+install flow. "Changelog" opens the
/// GitHub Releases page in the default browser.
fn setup_app_menu(app: &tauri::AppHandle) -> tauri::Result<()> {
    use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};

    let check_update = MenuItem::with_id(app, "check-update", "Check for Update", true, Some("u"))?;
    let changelog = MenuItem::with_id(app, "changelog", "Changelog", true, None::<&str>)?;

    let onesist_menu = if cfg!(target_os = "macos") {
        Submenu::with_items(
            app,
            "Onesist",
            true,
            &[
                &PredefinedMenuItem::about(app, Some("Onesist"), Some(AboutMetadata::default()))?,
                &PredefinedMenuItem::separator(app)?,
                &check_update,
                &changelog,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::quit(app, Some("Quit Onesist"))?,
            ],
        )?
    } else {
        Submenu::with_items(
            app,
            "Onesist",
            true,
            &[
                &MenuItem::with_id(app, "about", "About Onesist", true, None::<&str>)?,
                &PredefinedMenuItem::separator(app)?,
                &check_update,
                &changelog,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::quit(app, Some("Quit Onesist"))?,
            ],
        )?
    };

    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;

    let new_window = MenuItem::with_id(app, "new-window", "New Window", true, Some("CmdOrCtrl+N"))?;
    let window_menu = Submenu::with_items(
        app,
        "Window",
        true,
        &[&new_window, &PredefinedMenuItem::minimize(app, None)?],
    )?;

    let menu = Menu::with_items(
        app,
        &[
            &onesist_menu as &dyn tauri::menu::IsMenuItem<tauri::Wry>,
            &edit_menu as &dyn tauri::menu::IsMenuItem<tauri::Wry>,
            &window_menu as &dyn tauri::menu::IsMenuItem<tauri::Wry>,
        ],
    )?;

    app.on_menu_event(|app: &tauri::AppHandle<tauri::Wry>, event: tauri::menu::MenuEvent| match event.id().as_ref() {
        "check-update" => {
            // The frontend UpdateBanner listens for this and runs its existing
            // update check (which shows the install banner when an update is
            // available).
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.emit("onesist:check-update", ());
            }
        }
        "changelog" => {
            let _ = app.opener().open_url("https://github.com/rogasper/onesist/releases", None::<&str>);
        }
        "about" => {
            let version = app.package_info().version.to_string();
            let _ = app
                .dialog()
                .message(format!("Onesist {version}\n\nSA Dashboard — System Analyst desktop shell"))
                .title("About Onesist")
                .kind(tauri_plugin_dialog::MessageDialogKind::Info)
                .show(|_| {});
        }
        "new-window" => {
            let app = app.clone();
            // Never build the window inside the menu event handler: on Windows
            // that deadlocks the main thread the same way a synchronous command
            // does (wry#583) — blank window, close button ignored.
            std::thread::spawn(move || {
                if app.webview_windows().len() >= MAX_WINDOWS {
                    let _ = app.dialog().message(format!("Limit {} window tercapai", MAX_WINDOWS)).title("Onesist").kind(tauri_plugin_dialog::MessageDialogKind::Info).show(|_| {});
                    return;
                }
                let url = format!("{}/", app_origin(&app));
                let label = format!("win-{}", uuid::Uuid::new_v4().simple());
                let built = tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::External(url.parse().unwrap()))
                    .title("Onesist")
                    .inner_size(1440.0, 900.0)
                    .min_inner_size(800.0, 600.0)
                    // Same reason as the main window: HTML5 drops, not Tauri's.
                    .disable_drag_drop_handler()
                    .build();
                match &built {
                    Ok(_) => log::info!("[window] menu window {label} opened -> {url}"),
                    Err(e) => log::error!("[window] menu window {label} FAILED ({url}): {e}"),
                }
            });
        }
        _ => {}
    });

    #[cfg(target_os = "macos")]
    app.set_menu(menu)?;
    #[cfg(not(target_os = "macos"))]
    if let Some(win) = app.get_webview_window("main") {
        win.set_menu(menu)?;
    }

    Ok(())
}

#[cfg(test)]
mod pane_window_tests {
    use super::pane_window_url;

    #[test]
    fn builds_the_bare_pane_url_from_the_main_origin() {
        assert_eq!(
            pane_window_url("http://127.0.0.1:4321", "1731f89e-ac8e-4d25-88fe-a1baa9fc5efa", "erd").unwrap(),
            "http://127.0.0.1:4321/pane/1731f89e-ac8e-4d25-88fe-a1baa9fc5efa/erd"
        );
        assert_eq!(pane_window_url("http://localhost:4321", "p_1", "fsd").unwrap(), "http://localhost:4321/pane/p_1/fsd");
    }

    #[test]
    fn refuses_anything_but_a_plain_id_and_a_known_tab() {
        let too_long = "x".repeat(65);
        for id in ["", "../x", "a/b", "a b", "http://evil", too_long.as_str()] {
            assert!(pane_window_url("http://127.0.0.1:4321", id, "erd").is_err(), "id {id:?} must be refused");
        }
        for tab in ["", "settings", "erd/../x", "ERD"] {
            assert!(pane_window_url("http://127.0.0.1:4321", "p1", tab).is_err(), "tab {tab:?} must be refused");
        }
    }
}

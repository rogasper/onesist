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

#[tauri::command]
fn open_project_window(
    app: tauri::AppHandle,
    path: Option<String>,
) -> Result<String, String> {
    const MAX_WINDOWS: usize = 5;
    let count = app.webview_windows().len();
    if count >= MAX_WINDOWS {
        return Err(format!("Limit {} window tercapai", MAX_WINDOWS));
    }
    let port = app
        .try_state::<sidecar::SidecarState>()
        .and_then(|s| s.get_port())
        .unwrap_or(4321);
    let target = path.unwrap_or_else(|| "/".to_string());
    if !target.starts_with('/') {
        return Err("path harus mulai dengan /".into());
    }
    let url = format!("http://127.0.0.1:{}{}", port, target);
    let label = format!("win-{}", uuid::Uuid::new_v4().simple());
    let window = tauri::WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(url.parse::<url::Url>().map_err(|e| e.to_string())?))
        .title("Onesist")
        .inner_size(1440.0, 900.0)
        .min_inner_size(800.0, 600.0)
        .build()
        .map_err(|e| e.to_string())?;
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
    .plugin(tauri_plugin_window_state::Builder::default().build())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .invoke_handler(tauri::generate_handler![pick_folder, open_project_window])
    .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
      if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
      }
    }))
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

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
        let url = format!("http://127.0.0.1:{}", status.port);
        let window = tauri::WebviewWindowBuilder::new(
          app,
          "main",
          WebviewUrl::External(url.parse().expect("valid url")),
        )
        .title("Onesist")
        .inner_size(1440.0, 900.0)
        .min_inner_size(800.0, 600.0)
        .build()?;
        // Restore position/size/maximized, but NEVER restore a hidden
        // (visible:false) state: a hidden-but-rendering WebView at full
        // resolution leaks memory rapidly (observed 3.7 GB while idle).
        let _ = window.restore_state(
          StateFlags::POSITION | StateFlags::SIZE | StateFlags::MAXIMIZED,
        );
        let _ = window.show();
        let _ = window.set_focus();
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
          if let Some(state) = app.try_state::<sidecar::SidecarState>() {
            state.stop();
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
            state.stop();
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
            const MAX_WINDOWS: usize = 5;
            if app.webview_windows().len() >= MAX_WINDOWS {
                let _ = app.dialog().message(format!("Limit {} window tercapai", MAX_WINDOWS)).title("Onesist").kind(tauri_plugin_dialog::MessageDialogKind::Info).show(|_| {});
                return;
            }
            let port = app.try_state::<sidecar::SidecarState>().and_then(|s| s.get_port()).unwrap_or(4321);
            let url = format!("http://127.0.0.1:{}/", port);
            let label = format!("win-{}", uuid::Uuid::new_v4().simple());
            let _ = tauri::WebviewWindowBuilder::new(app, &label, tauri::WebviewUrl::External(url.parse().unwrap()))
                .title("Onesist")
                .inner_size(1440.0, 900.0)
                .min_inner_size(800.0, 600.0)
                .build();
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

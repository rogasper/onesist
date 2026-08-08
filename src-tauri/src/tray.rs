use std::sync::atomic::{AtomicBool, Ordering};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Listener, Manager};

use crate::sidecar::{SidecarState, SIDECAR_STATUS_EVENT};

/// Set to true when the app is quitting (dock Quit / Cmd+Q / tray Quit) so
/// the close-to-tray handler stops hiding the window and lets it close.
pub static QUITTING: AtomicBool = AtomicBool::new(false);

pub fn mark_quitting() {
    QUITTING.store(true, Ordering::SeqCst);
}

/// Build the system tray: Show / Restart Server / Quit.
/// Window close hides to tray; only "Quit" (or Cmd+Q) exits the app.
pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show Onesist", true, None::<&str>)?;
    let restart = MenuItem::with_id(app, "restart", "Restart Server", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show, &restart, &sep, &quit])?;

    let tray = TrayIconBuilder::with_id("main-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
            "restart" => {
                if let Some(state) = app.try_state::<SidecarState>() {
                    let _ = state.restart();
                }
            }
            "quit" => {
                // Mark quitting BEFORE exit so the close-to-tray handler
                // lets the window close instead of hiding it again.
                mark_quitting();
                // Hard-exit FIRST (detached thread) — if sidecar stop or event
                // emission hangs, the process still terminates. This avoids the
                // macOS hang where app.exit() + tray icon leaves the WebView
                // rendering forever (leaking GBs).
                std::thread::spawn(|| {
                    std::thread::sleep(std::time::Duration::from_millis(150));
                    std::process::exit(0);
                });
                if let Some(state) = app.try_state::<SidecarState>() {
                    state.stop();
                }
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
        })
        .build(app)?;

    // Keep the tray alive for the app's lifetime.
    app.manage(tray);

    Ok(())
}

/// Wire the "close to tray" behavior: intercept close-requested on the main
/// window and hide instead of destroying — UNLESS the app is quitting
/// (dock Quit / Cmd+Q / tray Quit), in which case the close is allowed so the
/// app actually terminates.
pub fn setup_close_to_tray(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        win.clone().on_window_event(move |event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if QUITTING.load(Ordering::SeqCst) {
                    // App is quitting — allow the window to close.
                    return;
                }
                // Regular close button — hide to tray instead.
                api.prevent_close();
                let _ = win.hide();
            }
        });
    }
}

/// Listen to sidecar lifecycle events and forward them to the webview so the
/// UI can reflect server state (green/yellow/red status).
pub fn watch_sidecar_status(app: &AppHandle) {
    let app = app.clone();
    app.clone().listen(SIDECAR_STATUS_EVENT, move |event| {
        if let Some(win) = app.get_webview_window("main") {
            let _ = win.emit("sidecar-status", event.payload());
        }
    });
}

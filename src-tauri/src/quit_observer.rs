//! macOS quit observer — makes Dock right-click "Quit" / Cmd+Q actually exit.
//!
//! Tauri does not reliably fire `RunEvent::ExitRequested` on macOS for
//! Cmd+Q / Dock Quit (tauri-apps/tauri#9198, #13778). When that happens, our
//! close-to-tray handler sees QUITTING=false and HIDES the window instead of
//! exiting — the app keeps running with a hidden WebView that leaks memory
//! unchecked (observed 80-100 GB on user machines). This module observes
//! `NSApplicationWillTerminateNotification` and hard-exits when macOS itself
//! is terminating the app, so a quit request can never silently hide the app.

#![cfg(target_os = "macos")]

use std::sync::atomic::{AtomicBool, Ordering};

use objc2::rc::Retained;
use objc2::{define_class, msg_send, sel, ClassType};
use objc2_foundation::{NSNotification, NSNotificationCenter, NSObject, NSString};

/// Set while a self-initiated relaunch (update install) is in progress — the
/// observer must NOT hard-exit then, or Tauri's restart path never gets to
/// spawn the new instance (the macOS "app doesn't reopen after update" bug).
pub static RESTARTING: AtomicBool = AtomicBool::new(false);

pub fn mark_restarting() {
    RESTARTING.store(true, Ordering::SeqCst);
}

define_class!(
    #[unsafe(super(NSObject))]
    struct QuitObserver;

    impl QuitObserver {
        #[unsafe(method(applicationWillTerminate:))]
        fn application_will_terminate(&self, _notification: &NSNotification) {
            // macOS is terminating us (Dock Quit / Cmd+Q / system shutdown).
            // If a relaunch is in progress, let Tauri spawn the new instance;
            // otherwise exit NOW — the close-to-tray handler would otherwise
            // hide the window and the app would linger with a leaking WebView.
            if !RESTARTING.load(Ordering::SeqCst) {
                eprintln!("[onesist] macOS terminating app — hard exit (dock quit / Cmd+Q)");
                std::process::exit(0);
            }
        }
    }
);

/// Register the observer; must be called once from setup.
pub fn install() {
    let observer: Retained<QuitObserver> = unsafe { msg_send![QuitObserver::class(), new] };
    let center = NSNotificationCenter::defaultCenter();
    let name = NSString::from_str("NSApplicationWillTerminateNotification");
    unsafe {
        let _: () = msg_send![
            &*center,
            addObserver: &*observer,
            selector: sel!(applicationWillTerminate:),
            name: &*name,
            object: Option::<&NSObject>::None
        ];
    }
    // Keep the observer alive for the app's lifetime (the notification center
    // holds a weak reference, so dropping it would unregister the hook).
    std::mem::forget(observer);
}

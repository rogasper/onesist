//! Main-process memory watchdog.
//!
//! The Bun sidecar already watches its own RSS (`SA_MAX_RSS_MB`), but the
//! Tauri shell + WebView process ("Onesist") had NO watchdog — a leaking
//! WebView could grow unchecked (observed 80 GB during an update install /
//! relaunch on macOS). This thread samples our own RSS every 10s and
//! hard-exits past the threshold so a leak can never balloon again.
//! Threshold: `SA_MAX_MAIN_RSS_MB` (default 6000 MB). The sidecar dies with
//! us via its PPID watchdog; the app can simply be reopened.

use std::time::Duration;

const DEFAULT_MAX_RSS_MB: u64 = 6000;
const SAMPLE_INTERVAL: Duration = Duration::from_secs(10);

pub fn spawn_memory_watchdog() {
    std::thread::spawn(|| {
        let max_mb = std::env::var("SA_MAX_MAIN_RSS_MB")
            .ok()
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(DEFAULT_MAX_RSS_MB);
        loop {
            std::thread::sleep(SAMPLE_INTERVAL);
            let Some(rss) = current_process_rss_bytes() else { continue };
            if rss > max_mb * 1024 * 1024 {
                eprintln!(
                    "[onesist] main process RSS {:.2} GB exceeds SA_MAX_MAIN_RSS_MB={} MB — exiting to stop the leak",
                    rss as f64 / (1024.0 * 1024.0 * 1024.0),
                    max_mb
                );
                std::process::exit(1);
            }
        }
    });
}

#[cfg(target_os = "macos")]
// libc::mach_task_self is deprecated in favor of the mach2 crate, but mach2
// lacks the task_info bindings we need — the libc functions link and work.
#[allow(deprecated)]
fn current_process_rss_bytes() -> Option<u64> {
    // mach_task_basic_info.resident_size = physical footprint of this process.
    let mut info = std::mem::MaybeUninit::<libc::mach_task_basic_info>::uninit();
    let mut count = (std::mem::size_of::<libc::mach_task_basic_info>()
        / std::mem::size_of::<u32>()) as u32;
    let kr = unsafe {
        libc::task_info(
            libc::mach_task_self(),
            libc::MACH_TASK_BASIC_INFO,
            info.as_mut_ptr() as *mut libc::c_int,
            &mut count,
        )
    };
    if kr != 0 { return None; }
    Some(unsafe { info.assume_init() }.resident_size)
}

#[cfg(target_os = "windows")]
fn current_process_rss_bytes() -> Option<u64> {
    use windows_sys::Win32::System::ProcessStatus::{GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS};
    use windows_sys::Win32::System::Threading::GetCurrentProcess;
    // windows-sys structs have no Default impl — zeroed is the documented init.
    let mut counters: PROCESS_MEMORY_COUNTERS = unsafe { std::mem::zeroed() };
    let ok = unsafe {
        GetProcessMemoryInfo(
            GetCurrentProcess(),
            &mut counters,
            std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32,
        )
    };
    if ok == 0 { return None; }
    Some(counters.WorkingSetSize as u64)
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn current_process_rss_bytes() -> Option<u64> {
    None
}

#[cfg(test)]
mod tests {
    #[test]
    fn rss_is_readable() {
        let rss = super::current_process_rss_bytes();
        assert!(rss.is_some(), "RSS should be readable on this platform");
        assert!(rss.unwrap() > 0);
    }
}

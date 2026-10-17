fn main() {
  // App commands must be listed here: once a window has a capability, Tauri v2 refuses any
  // command that is not allowed ("Command … not allowed by ACL"). This generates `allow-*`
  // permissions for them, which capabilities/default.json and capabilities/windows.json grant.
  tauri_build::try_build(
    tauri_build::Attributes::new().app_manifest(
      tauri_build::AppManifest::new().commands(&["pick_folder", "open_project_window", "open_pane_window"]),
    ),
  )
  .expect("failed to run tauri-build");
}

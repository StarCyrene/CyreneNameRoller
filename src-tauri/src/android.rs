use super::*;
use jni::objects::JValue;

/// Keep the screen on only while the scanner's WebView is visible.
#[tauri::command]
async fn set_scan_awake(window: tauri::WebviewWindow, enabled: bool) -> Result<(), String> {
    if window.label() != "main" {
        return Err("扫码仅可在主窗口使用".into());
    }
    let (reply, result) = tokio::sync::oneshot::channel();
    window
        .with_webview(move |webview| {
            webview.jni_handle().exec(move |env, _, view| {
                let applied = env
                    .call_method(
                        view,
                        "setKeepScreenOn",
                        "(Z)V",
                        &[JValue::Bool(enabled.into())],
                    )
                    .map(|_| ())
                    .map_err(|e| e.to_string());
                let _ = reply.send(applied);
            });
        })
        .map_err(|e| e.to_string())?;
    tokio::time::timeout(Duration::from_secs(2), result)
        .await
        .map_err(|_| "无法设置扫码时屏幕常亮".to_string())?
        .map_err(|e| e.to_string())?
}

#[tauri::mobile_entry_point]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let config = app.path().app_config_dir()?.join("safemode.json");
            app.manage(SafeModeState {
                status: Mutex::new(read_safe_mode_status(&config)),
            });
            // Android cannot write alongside the APK. Use its persistent app-private directory.
            let store = EncryptedStore::load(app_data_path(&app.path().app_data_dir()?));
            manage_core_store(app, store);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            storage_get,
            storage_set,
            storage_delete,
            storage_clear,
            safe_mode_status,
            core_grant_token,
            core_revoke_principal,
            core_state_set,
            core_draw_execute,
            core_prize_execute,
            core_card_commit,
            core_maintenance_execute,
            export_encrypted_data,
            import_encrypted_data,
            load_names,
            load_changelog,
            system_accent,
            set_scan_awake
        ])
        .run(tauri::generate_context!())
        .expect("error while running Android application");
}

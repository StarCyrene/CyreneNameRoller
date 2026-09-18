use aes_gcm::aead::{rand_core::RngCore, Aead, OsRng};
use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use base64::Engine;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::ffi::OsStr;
use std::collections::HashMap;
use std::fs;
use std::fs::OpenOptions;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{Ipv4Addr, SocketAddrV4, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Emitter, EventTarget, Manager, PhysicalPosition, State};
use tauri_plugin_dialog::DialogExt;

mod core_state;
mod core_algorithm;

#[cfg(target_os = "windows")]
use std::os::windows::{ffi::OsStrExt, process::CommandExt};
#[cfg(target_os = "windows")]
use windows_sys::Win32::Graphics::Gdi::{
    ClientToScreen, CreateRectRgn, CreateRoundRectRgn, DeleteObject, SetWindowRgn,
};
#[cfg(target_os = "windows")]
use windows_sys::Win32::UI::Shell::{IsUserAnAdmin, ShellExecuteW};
#[cfg(target_os = "windows")]
use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetClientRect, GetWindowLongPtrW, GetWindowRect, SetWindowLongPtrW, SetWindowPos, GWL_STYLE,
    SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, SW_SHOWNORMAL,
    WS_CAPTION, WS_MAXIMIZEBOX, WS_MINIMIZEBOX, WS_SYSMENU, WS_THICKFRAME,
};

const UPDATE_PROXY_BASE: &str = "https://gh.xn--8hvv1o.cn/";
const UPDATE_URL_PREFIX: &str = "https://github.com/StarCyrene/CyreneNameRoller/releases/download/";
const MIN_INSTALLER_SIZE: usize = 1024 * 1024;
const DATA_MAGIC: &[u8] = b"CYRENE1\0";
const DATA_NONCE_LENGTH: usize = 12;
const DATA_TAG_LENGTH: usize = 16;
const PORTABLE_MODE_MARKER: &str = "portable.mode";
#[cfg(target_os = "windows")]
const STARTUP_TASK_NAME: &str = "CyreneNameRollerAutoStart";
const FLOATING_WINDOW_SIZE: i32 = 64;
const MIN_FLOATING_WINDOW_SIZE: i32 = 40;
const MAX_FLOATING_WINDOW_SIZE: i32 = 256;
const FLOATING_WINDOW_SIZE_STEP: i32 = 4;

fn normalize_floating_window_size(value: Option<f64>) -> i32 {
    let Some(value) = value.filter(|value| value.is_finite()) else {
        return FLOATING_WINDOW_SIZE;
    };
    let rounded =
        (value / FLOATING_WINDOW_SIZE_STEP as f64).round() as i32 * FLOATING_WINDOW_SIZE_STEP;
    rounded.clamp(MIN_FLOATING_WINDOW_SIZE, MAX_FLOATING_WINDOW_SIZE)
}

#[cfg(target_os = "windows")]
const STARTUP_REGISTRY_VALUE: &str = "CyreneNameRoller";
const INSTANCE_PORT: u16 = 47618;
const INSTANCE_MESSAGE: &[u8] = b"CYRENE_SHOW_MAIN_V1\n";
const INSTANCE_ACK: &[u8] = b"CYRENE_SHOW_ACK_V1\n";
const INSTANCE_REPLACE_MESSAGE: &[u8] = b"CYRENE_REPLACE_INSTANCE_V1\n";
const INSTANCE_REPLACE_ACK: &[u8] = b"CYRENE_REPLACE_ACK_V1\n";
const INSTANCE_URI_PREFIX: &str = "CYRENE_OPEN_URI_V1 ";
const INSTANCE_URI_ACK: &[u8] = b"CYRENE_OPEN_URI_ACK_V1\n";
const URI_SCHEME: &str = "cyrenenr";
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn background_command<S: AsRef<OsStr>>(program: S) -> Command {
    let mut command = Command::new(program);
    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);
    command
}

#[cfg(target_os = "windows")]
fn wide(value: &OsStr) -> Vec<u16> {
    value.encode_wide().chain(std::iter::once(0)).collect()
}

#[cfg(target_os = "windows")]
fn shell_execute(operation: &str, file: &OsStr, parameters: Option<&str>) -> Result<(), String> {
    let operation = wide(OsStr::new(operation));
    let file = wide(file);
    let parameters = parameters.map(|value| wide(OsStr::new(value)));
    let result = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            operation.as_ptr(),
            file.as_ptr(),
            parameters
                .as_ref()
                .map_or(std::ptr::null(), |value| value.as_ptr()),
            std::ptr::null(),
            SW_SHOWNORMAL,
        )
    } as isize;
    if result > 32 {
        Ok(())
    } else {
        Err(format!("Windows 启动操作失败 ({})", result))
    }
}

fn instance_address() -> SocketAddrV4 {
    SocketAddrV4::new(Ipv4Addr::LOCALHOST, INSTANCE_PORT)
}

fn notify_instance(message: &[u8], expected_ack: &[u8]) -> bool {
    let Ok(mut stream) =
        TcpStream::connect_timeout(&instance_address().into(), Duration::from_millis(800))
    else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(800)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(800)));
    if stream.write_all(message).is_err() {
        return false;
    }
    let mut acknowledgement = vec![0u8; expected_ack.len()];
    stream.read_exact(&mut acknowledgement).is_ok() && acknowledgement == expected_ack
}

fn notify_existing_instance() -> bool {
    notify_instance(INSTANCE_MESSAGE, INSTANCE_ACK)
}

fn is_cyrene_uri(value: &str) -> bool {
    value.get(..URI_SCHEME.len()).is_some_and(|scheme| {
        scheme.eq_ignore_ascii_case(URI_SCHEME)
            && value
                .get(URI_SCHEME.len()..URI_SCHEME.len() + 3)
                .is_some_and(|separator| separator == "://")
    })
}

fn launch_uri_from_arguments(arguments: &[String]) -> Option<String> {
    arguments
        .iter()
        .find(|argument| is_cyrene_uri(argument))
        .cloned()
}

fn notify_existing_instance_with_uri(uri: &str) -> bool {
    if !is_cyrene_uri(uri) || uri.contains(['\r', '\n']) {
        return false;
    }
    let message = format!("{}{}\n", INSTANCE_URI_PREFIX, uri);
    notify_instance(message.as_bytes(), INSTANCE_URI_ACK)
}

fn request_existing_instance_exit() -> bool {
    notify_instance(INSTANCE_REPLACE_MESSAGE, INSTANCE_REPLACE_ACK)
}

fn acquire_instance_listener(
    wait_for_replaced_instance: bool,
    launch_uri: Option<&str>,
) -> TcpListener {
    let deadline = Instant::now()
        + if wait_for_replaced_instance {
            Duration::from_secs(12)
        } else {
            Duration::from_millis(1200)
        };
    loop {
        match TcpListener::bind(instance_address()) {
            Ok(listener) => return listener,
            Err(error) => {
                let notified = launch_uri
                    .map(notify_existing_instance_with_uri)
                    .unwrap_or_else(notify_existing_instance);
                if !wait_for_replaced_instance && notified {
                    std::process::exit(0);
                }
                if Instant::now() >= deadline {
                    let notified = launch_uri
                        .map(notify_existing_instance_with_uri)
                        .unwrap_or_else(notify_existing_instance);
                    if notified {
                        std::process::exit(0);
                    }
                    eprintln!("[single-instance] 无法绑定本机 IPC：{}", error);
                    std::process::exit(3);
                }
                std::thread::sleep(Duration::from_millis(120));
            }
        }
    }
}

fn start_instance_listener(listener: TcpListener, app: tauri::AppHandle) {
    std::thread::spawn(move || {
        for incoming in listener.incoming() {
            let Ok(mut stream) = incoming else { continue };
            let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
            let mut message = String::new();
            let read_result = {
                let mut reader = BufReader::new(&mut stream);
                reader.read_line(&mut message)
            };
            if read_result.is_err() {
                continue;
            }
            if message.as_bytes() == INSTANCE_MESSAGE {
                let _ = stream.write_all(INSTANCE_ACK);
                let _ = request_reveal_main_window(&app);
            } else if message.as_bytes() == INSTANCE_REPLACE_MESSAGE {
                let _ = stream.write_all(INSTANCE_REPLACE_ACK);
                let exit_handle = app.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_millis(100));
                    exit_handle.exit(0);
                });
            } else if let Some(uri) = message
                .trim_end_matches(['\r', '\n'])
                .strip_prefix(INSTANCE_URI_PREFIX)
                .filter(|uri| is_cyrene_uri(uri))
            {
                let _ = stream.write_all(INSTANCE_URI_ACK);
                let _ = request_open_uri(&app, uri.to_string());
            }
        }
    });
}

struct MainWindowRevealState {
    frontend_ready: AtomicBool,
    pending: AtomicBool,
}

impl MainWindowRevealState {
    fn new() -> Self {
        Self {
            frontend_ready: AtomicBool::new(false),
            pending: AtomicBool::new(false),
        }
    }
}

struct EncryptedStore {
    path: Mutex<PathBuf>,
    values: Mutex<serde_json::Value>,
    integrity_error: Mutex<Option<String>>,
}

fn floating_window_corner_radius(style: &str, radius: Option<f64>) -> i32 {
    match style {
        "text" => radius
            .filter(|value| value.is_finite())
            .map(|value| value.round() as i32)
            .unwrap_or(50)
            .clamp(0, 50),
        "custom" => radius
            .filter(|value| value.is_finite())
            .map(|value| value.round() as i32)
            .unwrap_or(0)
            .clamp(0, 50),
        _ => 0,
    }
}

fn floating_window_region_geometry(
    width: i32,
    height: i32,
    corner_radius: i32,
    antialias_margin: i32,
) -> (i32, i32, i32, i32, i32) {
    let side = width.min(height).max(1);
    let left = (width - side) / 2;
    let top = (height - side) / 2;
    let corner_radius = corner_radius.clamp(0, 50);
    let antialias_margin = if corner_radius == 0 {
        0
    } else {
        antialias_margin.max(1)
    };
    let diameter = ((side as f64) * corner_radius as f64 / 50.0).round() as i32;
    (
        left - antialias_margin,
        top - antialias_margin,
        left + side + antialias_margin,
        top + side + antialias_margin,
        diameter + antialias_margin * 2,
    )
}

#[cfg(target_os = "windows")]
fn floating_window_undecorated_style(style: isize) -> isize {
    style & !((WS_CAPTION | WS_THICKFRAME | WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_SYSMENU) as isize)
}

#[cfg(target_os = "windows")]
fn remove_floating_window_decorations<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
) -> Result<(), String> {
    let hwnd = window.hwnd().map_err(|error| error.to_string())?;
    let native_hwnd = hwnd.0 as windows_sys::Win32::Foundation::HWND;
    let style = unsafe { GetWindowLongPtrW(native_hwnd, GWL_STYLE) };
    let undecorated_style = floating_window_undecorated_style(style);
    if style == undecorated_style {
        return Ok(());
    }

    unsafe {
        SetWindowLongPtrW(native_hwnd, GWL_STYLE, undecorated_style);
        SetWindowPos(
            native_hwnd,
            std::ptr::null_mut(),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
        );
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn remove_floating_window_decorations<R: tauri::Runtime>(
    _window: &tauri::WebviewWindow<R>,
) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "windows")]
fn floating_window_client_bounds(
    hwnd: windows_sys::Win32::Foundation::HWND,
) -> Result<(i32, i32, i32, i32), String> {
    let mut client_rect: windows_sys::Win32::Foundation::RECT = unsafe { std::mem::zeroed() };
    let mut window_rect: windows_sys::Win32::Foundation::RECT = unsafe { std::mem::zeroed() };
    let mut client_origin: windows_sys::Win32::Foundation::POINT = unsafe { std::mem::zeroed() };
    unsafe {
        if GetClientRect(hwnd, &mut client_rect) == 0
            || GetWindowRect(hwnd, &mut window_rect) == 0
            || ClientToScreen(hwnd, &mut client_origin) == 0
        {
            return Err("读取悬浮窗客户区失败".to_string());
        }
    }
    Ok((
        client_origin.x - window_rect.left,
        client_origin.y - window_rect.top,
        client_rect.right - client_rect.left,
        client_rect.bottom - client_rect.top,
    ))
}

#[cfg(target_os = "windows")]
fn set_floating_window_physical_size<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
    width: u32,
    height: u32,
) -> Result<(), String> {
    let hwnd = window.hwnd().map_err(|error| error.to_string())?;
    let native_hwnd = hwnd.0 as windows_sys::Win32::Foundation::HWND;
    let width = i32::try_from(width).map_err(|_| "悬浮窗宽度无效".to_string())?;
    let height = i32::try_from(height).map_err(|_| "悬浮窗高度无效".to_string())?;
    let success = unsafe {
        SetWindowPos(
            native_hwnd,
            std::ptr::null_mut(),
            0,
            0,
            width,
            height,
            SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE,
        )
    };
    if success == 0 {
        return Err("调整悬浮窗原生尺寸失败".to_string());
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn set_floating_window_physical_size<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
    width: u32,
    height: u32,
) -> Result<(), String> {
    window
        .set_size(tauri::PhysicalSize::new(width, height))
        .map_err(|error| error.to_string())
}

fn set_floating_window_square_size<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
    logical_size: i32,
) -> Result<u32, String> {
    let scale_factor = window.scale_factor().map_err(|error| error.to_string())?;
    let physical_size = (logical_size as f64 * scale_factor).round().max(1.0) as u32;
    set_floating_window_physical_size(window, physical_size, physical_size)?;
    Ok(physical_size)
}

fn floating_window_style_and_radius(app: &tauri::AppHandle) -> (String, Option<f64>) {
    let store = app.state::<EncryptedStore>();
    let Ok(values) = store.values.lock() else {
        return ("text".to_string(), None);
    };
    let style = values["settings"]["floatingWindowStyle"]
        .as_str()
        .unwrap_or("text")
        .to_string();
    let radius = values["settings"]["floatingWindowRadius"]
        .as_f64()
        .or_else(|| values["settings"]["floatingWindowRadius"].as_i64().map(|value| value as f64));
    (style, radius)
}

#[cfg(target_os = "windows")]
fn apply_floating_window_region<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
    style: &str,
    radius: Option<f64>,
) -> Result<(), String> {
    let hwnd = window.hwnd().map_err(|error| error.to_string())?;
    let native_hwnd = hwnd.0 as windows_sys::Win32::Foundation::HWND;
    let (client_left, client_top, width, height) = floating_window_client_bounds(native_hwnd)?;
    let corner_radius = floating_window_corner_radius(style, radius);
    let antialias_margin = window
        .scale_factor()
        .map_err(|error| error.to_string())?
        .ceil() as i32;
    let (left, top, right, bottom, diameter) = floating_window_region_geometry(
        width,
        height,
        corner_radius,
        antialias_margin,
    );
    let left = left + client_left;
    let top = top + client_top;
    let right = right + client_left;
    let bottom = bottom + client_top;

    unsafe {
        let region = if corner_radius == 0 {
            CreateRectRgn(left, top, right, bottom)
        } else {
            CreateRoundRectRgn(left, top, right, bottom, diameter, diameter)
        };
        if region.is_null() {
            return Err("创建悬浮窗命中区域失败".to_string());
        }
        if SetWindowRgn(native_hwnd, region, 1) == 0 {
            DeleteObject(region as _);
            return Err("应用悬浮窗命中区域失败".to_string());
        }
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn apply_floating_window_region<R: tauri::Runtime>(
    _window: &tauri::WebviewWindow<R>,
    _style: &str,
    _radius: Option<f64>,
) -> Result<(), String> {
    Ok(())
}

struct SafeModeState {
    status: Mutex<serde_json::Value>,
}

struct CoreAuthorityState {
    grants: Mutex<HashMap<String, String>>,
    transaction: Mutex<()>,
    readonly: AtomicBool,
}

impl CoreAuthorityState {
    fn new(readonly: bool) -> Self {
        Self {
            grants: Mutex::new(HashMap::new()),
            transaction: Mutex::new(()),
            readonly: AtomicBool::new(readonly),
        }
    }

    fn issue(&self, principal: &str) -> Result<String, String> {
        if !valid_core_principal(principal) { return Err("PLUGIN_PERMISSION_DENIED".into()); }
        let mut bytes = [0u8; 32];
        OsRng.fill_bytes(&mut bytes);
        let token = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes);
        self.grants.lock().map_err(|_| "PLUGIN_PERMISSION_DENIED".to_string())?.insert(principal.to_string(), token.clone());
        Ok(token)
    }

    fn authorize(&self, token: &str, principal: &str) -> Result<(), String> {
        if self.readonly.load(Ordering::Acquire) {
            return Err("CORE_INTEGRITY_CHECK_FAILED".into());
        }
        if principal.is_empty() {
            return Err("PLUGIN_PERMISSION_DENIED".into());
        }
        let grants = self.grants.lock().map_err(|_| "PLUGIN_PERMISSION_DENIED".to_string())?;
        if grants.get(principal).is_some_and(|expected| expected == token) { Ok(()) } else { Err("PLUGIN_PERMISSION_DENIED".into()) }
    }

    fn revoke(&self, principal: &str) -> Result<(), String> {
        self.grants.lock().map_err(|_| "PLUGIN_PERMISSION_DENIED".to_string())?.remove(principal);
        Ok(())
    }
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RustDrawInput {
    list_id: String,
    #[serde(default)]
    target: String,
    #[serde(default = "default_count")]
    count: u32,
    #[serde(default)]
    allow_duplicates: bool,
    #[serde(default)]
    gender: String,
}

fn default_count() -> u32 { 1 }

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RustDrawRequest {
    grant_token: String,
    principal: String,
    caller_kind: String,
    plugin_id: String,
    operation_id: String,
    #[serde(default = "default_true")]
    count_statistics: bool,
    input: RustDrawInput,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RustCardInput {
    list_id: String,
    person_ids: Vec<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RustCardCommitRequest {
    grant_token: String,
    principal: String,
    caller_kind: String,
    plugin_id: String,
    operation_id: String,
    input: RustCardInput,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CoreMaintenanceRequest {
    grant_token: String,
    principal: String,
    action: String,
    #[serde(default)]
    list_id: String,
    #[serde(default)]
    person_id: String,
    #[serde(default)]
    mode: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CoreStateSetRequest {
    grant_token: String,
    principal: String,
    key: String,
    value: serde_json::Value,
}

fn default_true() -> bool { true }

fn valid_core_principal(principal: &str) -> bool {
    if principal == "core-ui" { return true; }
    principal.strip_prefix("plugin:").is_some_and(|plugin_id| {
        !plugin_id.is_empty()
            && plugin_id.len() <= 128
            && plugin_id.chars().all(|character| character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_'))
    })
}

fn validate_core_caller(request: &RustDrawRequest) -> Result<(), String> {
    match request.caller_kind.as_str() {
        "core-ui" if request.principal == "core-ui" && (request.plugin_id.is_empty() || request.plugin_id == "core") => Ok(()),
        "plugin" if !request.plugin_id.is_empty() && request.principal == format!("plugin:{}", request.plugin_id) => Ok(()),
        _ => Err("PLUGIN_PERMISSION_DENIED".into()),
    }
}

fn validate_core_card_caller(request: &RustCardCommitRequest) -> Result<(), String> {
    if request.caller_kind == "core-ui"
        && request.principal == "core-ui"
        && (request.plugin_id.is_empty() || request.plugin_id == "core")
    {
        Ok(())
    } else {
        Err("PLUGIN_PERMISSION_DENIED".into())
    }
}

fn validate_core_maintenance_request(request: &CoreMaintenanceRequest) -> Result<(), String> {
    if request.principal != "core-ui" {
        return Err("PLUGIN_PERMISSION_DENIED".into());
    }
    match request.action.as_str() {
        "clear-records" | "reset-all"
            if request.list_id.is_empty() && request.person_id.is_empty() && request.mode.is_empty() => Ok(()),
        "initialize-person-count"
            if !request.list_id.is_empty()
                && !request.person_id.is_empty()
                && (request.mode == "zero" || request.mode == "midpoint") => Ok(()),
        _ => Err("CORE_TRANSACTION_REJECTED".into()),
    }
}

fn apply_core_state_update(
    old_values: &Value,
    state_key: &str,
    value: Value,
    mac_key: &[u8; 32],
) -> Result<Value, String> {
    let mut next_values = old_values.clone();
    let mut envelope = core_state::parse(old_values, mac_key)?;
    match state_key {
        "lists" => {
            if !value.is_object() { return Err("CORE_TRANSACTION_REJECTED".into()); }
            next_values["lists"] = value.clone();
            envelope.state.names["lists"] = value;
        }
        "currentListId" => {
            if value.as_str().map_or(true, str::is_empty) { return Err("CORE_TRANSACTION_REJECTED".into()); }
            next_values["currentListId"] = value.clone();
            envelope.state.names["currentListId"] = value;
        }
        "balance" => {
            let object = value.as_object().ok_or_else(|| "CORE_TRANSACTION_REJECTED".to_string())?;
            if object.keys().any(|key| key != "enabled" && key != "algorithm")
                || object.get("enabled").is_some_and(|value| !value.is_boolean())
                || object.get("algorithm").is_some_and(|value| value.as_str() != Some(core_state::ALGORITHM_NAME))
            {
                return Err("CORE_TRANSACTION_REJECTED".into());
            }
            let balance = json!({
                "enabled": object.get("enabled").and_then(Value::as_bool).unwrap_or(true),
                "algorithm": core_state::ALGORITHM_NAME
            });
            next_values["balance"] = balance.clone();
            envelope.state.balance = balance;
        }
        _ => return Err("PLUGIN_PERMISSION_DENIED".into()),
    }
    let envelope = core_state::seal(envelope, mac_key)?;
    next_values[core_state::CORE_STATE_KEY] = core_state::to_value(&envelope)?;
    next_values["statistics"] = envelope.state.statistics.clone();
    next_values["records"] = envelope.state.records.clone();
    Ok(next_values)
}

#[tauri::command]
fn core_grant_token(state: State<'_, CoreAuthorityState>, principal: String) -> Result<String, String> {
    if state.readonly.load(Ordering::Acquire) {
        return Err("CORE_INTEGRITY_CHECK_FAILED".into());
    }
    state.issue(&principal)
}

#[tauri::command]
fn core_revoke_principal(state: State<'_, CoreAuthorityState>, principal: String) -> Result<(), String> {
    state.revoke(&principal)
}

#[tauri::command]
fn core_state_set(
    store: State<'_, EncryptedStore>,
    authority: State<'_, CoreAuthorityState>,
    request: CoreStateSetRequest,
) -> Result<bool, String> {
    if request.principal != "core-ui" { return Err("PLUGIN_PERMISSION_DENIED".into()); }
    authority.authorize(&request.grant_token, &request.principal)?;
    let _transaction = authority.transaction.lock().map_err(|_| "CORE_TRANSACTION_REJECTED".to_string())?;
    let key = core_data_key()?;
    let old_values = store.values.lock().map_err(|_| "CORE_TRANSACTION_REJECTED".to_string())?.clone();
    let next_values = apply_core_state_update(&old_values, &request.key, request.value, &key)?;
    *store.values.lock().map_err(|_| "CORE_TRANSACTION_REJECTED".to_string())? = next_values;
    if let Err(error) = store.persist() {
        *store.values.lock().map_err(|_| "CORE_TRANSACTION_ROLLED_BACK".to_string())? = old_values;
        let _ = store.persist();
        return Err(format!("CORE_TRANSACTION_ROLLED_BACK: {}", error));
    }
    Ok(true)
}

#[tauri::command]
fn core_draw_execute(
    store: State<'_, EncryptedStore>,
    authority: State<'_, CoreAuthorityState>,
    request: RustDrawRequest,
) -> Result<serde_json::Value, String> {
    validate_core_caller(&request)?;
    authority.authorize(&request.grant_token, &request.principal)?;
    let _transaction = authority.transaction.lock().map_err(|_| "CORE_TRANSACTION_REJECTED".to_string())?;
    let key = core_data_key()?;
    let old_values = store.values.lock().map_err(|_| "CORE_TRANSACTION_REJECTED".to_string())?.clone();
    let mut envelope = match core_state::parse(&old_values, &key) {
        Ok(envelope) => envelope,
        Err(error) => {
            authority.readonly.store(true, Ordering::Release);
            return Err(error);
        }
    };
    envelope.state.names = json!({
        "currentListId": old_values.get("currentListId").cloned().unwrap_or_else(|| json!("default")),
        "lists": old_values.get("lists").cloned().unwrap_or_else(|| json!({}))
    });
    envelope.state.balance = old_values.get("balance").cloned().unwrap_or_else(|| json!({ "enabled": true }));
    let list_id = if request.input.list_id.is_empty() {
        envelope.state.names.get("currentListId").and_then(serde_json::Value::as_str).unwrap_or("default").to_string()
    } else { request.input.list_id.clone() };
    let list = envelope.state.names.get("lists").and_then(|lists| lists.get(&list_id)).ok_or_else(|| "CORE_TRANSACTION_REJECTED".to_string())?;
    let target = if request.input.target == "groups" { "groups" } else { "people" };
    let count = request.input.count.clamp(1, 100) as usize;
    let gender = if request.input.gender == "male" || request.input.gender == "female" { request.input.gender.as_str() } else { "all" };
    let mut candidates = Vec::new();
    if target == "groups" {
        if let Some(groups) = list.get("groups").and_then(serde_json::Value::as_array) {
            candidates.extend(groups.iter().map(|group| json!({ "id": group["id"], "name": group["name"], "englishName": group["enName"], "isGroup": true, "isWhiteList": false })));
        }
        if list.get("names").and_then(serde_json::Value::as_array).is_some_and(|names| names.iter().any(|person| person["groupId"].as_str().unwrap_or("").is_empty())) {
            candidates.push(json!({ "id": "__unassigned__", "name": "未分组", "englishName": "Unassigned", "isGroup": true, "isWhiteList": false }));
        }
    } else if let Some(names) = list.get("names").and_then(serde_json::Value::as_array) {
        candidates.extend(names.iter().filter(|person| person["cn"].as_str().is_some_and(|name| !name.is_empty() && name != "再来一次") && (gender == "all" || person["gender"].as_str() == Some(gender))).cloned());
    }
    if candidates.is_empty() { return Err("CORE_TRANSACTION_REJECTED".into()); }
    let limit = if request.input.allow_duplicates { count } else { count.min(candidates.len()) };
    let selected = if target == "people" {
        let white_list: Vec<Value> = candidates.iter().filter(|person| person["isWhiteList"].as_bool().unwrap_or(false)).cloned().collect();
        core_algorithm::pick_cyrene_batch(&candidates, &white_list, &envelope.state.statistics["counts"], envelope.state.balance["enabled"].as_bool().unwrap_or(true), limit, request.input.allow_duplicates, || {
            let mut random = [0u8; 8];
            OsRng.fill_bytes(&mut random);
            u64::from_le_bytes(random) as f64 / (u64::MAX as f64 + 1.0)
        })
    } else {
        let mut available = candidates.clone();
        let mut selected = Vec::new();
        for _ in 0..limit {
            let pool_len = if request.input.allow_duplicates { candidates.len() } else { available.len() };
            let mut random = [0u8; 8];
            OsRng.fill_bytes(&mut random);
            let index = (u64::from_le_bytes(random) as usize) % pool_len;
            selected.push(if request.input.allow_duplicates { candidates[index].clone() } else { available.remove(index) });
        }
        selected
    };
    let mut results = Vec::new();
    for selected in selected {
        results.push(json!({ "id": selected["id"], "name": selected["cn"].as_str().or_else(|| selected["name"].as_str()).unwrap_or(""), "englishName": selected["en"].as_str().or_else(|| selected["englishName"].as_str()).unwrap_or(""), "isGroup": target == "groups", "isWhiteList": selected["isWhiteList"].as_bool().unwrap_or(false) }));
    }
    let operation_id = if request.operation_id.is_empty() { format!("draw-{}", envelope.state.sequence + 1) } else { request.operation_id.clone() };
    let committed_at = chrono_like_now();
    let plugin_id = if request.caller_kind == "plugin" { request.plugin_id.clone() } else { "core".into() };
    let mut receipt = json!({ "operationId": operation_id, "pluginId": plugin_id, "listId": list_id, "target": target, "count": results.len(), "allowDuplicates": request.input.allow_duplicates, "gender": gender, "algorithm": if target == "people" { core_state::ALGORITHM_NAME } else { "host-random/groups" }, "algorithmVersion": if target == "people" { core_state::ALGORITHM_VERSION } else { "1" }, "committedAt": committed_at, "results": results });
    let previous_hash = core_state::hash_state(&envelope)?;
    receipt["sequence"] = json!(envelope.state.sequence + 1);
    receipt["previousHash"] = json!(previous_hash.clone());
    let receipt_hash = core_state::receipt_hash(&receipt)?;
    let mut statistics = envelope.state.statistics.clone();
    let mut records = envelope.state.records.as_array().cloned().unwrap_or_default();
    if request.count_statistics && target == "people" {
        let mut total = statistics["totalCount"].as_u64().unwrap_or(0);
        let counts = statistics.as_object_mut().and_then(|value| value.get_mut("counts")).and_then(serde_json::Value::as_object_mut).ok_or_else(|| "CORE_TRANSACTION_REJECTED".to_string())?;
        for result in receipt["results"].as_array().unwrap_or(&Vec::new()) {
            if result["isWhiteList"].as_bool().unwrap_or(false) { continue; }
            let key = result["id"].as_str().unwrap_or("");
            if key.is_empty() { continue; }
            let next_count = counts.get(key).and_then(Value::as_u64).unwrap_or(0) + 1;
            counts.insert(key.to_string(), json!(next_count));
            total += 1;
        }
        statistics["totalCount"] = json!(total);
    }
    for result in receipt["results"].as_array().unwrap_or(&Vec::new()) {
        records.insert(0, json!({ "personId": if result["isGroup"].as_bool().unwrap_or(false) { Value::Null } else { result["id"].clone() }, "listId": receipt["listId"], "groupId": if result["isGroup"].as_bool().unwrap_or(false) { result["id"].clone() } else { Value::Null }, "source": if request.caller_kind == "plugin" { format!("plugin:{}", request.plugin_id) } else { "roller".into() }, "pluginId": if request.caller_kind == "plugin" { request.plugin_id.clone() } else { String::new() }, "operationId": receipt["operationId"], "time": committed_at }));
    }
    records.truncate(500);
    let next_state = core_state::CoreState { schema_version: core_state::CORE_SCHEMA_VERSION, sequence: envelope.state.sequence + 1, previous_hash, receipt_hash: receipt_hash.clone(), algorithm: core_state::ALGORITHM_NAME.into(), algorithm_version: core_state::ALGORITHM_VERSION.into(), names: envelope.state.names.clone(), balance: envelope.state.balance.clone(), statistics: statistics.clone(), records: Value::Array(records.clone()) };
    let next_envelope = core_state::seal(core_state::CoreStateEnvelope { schema_version: core_state::CORE_SCHEMA_VERSION, state: next_state, state_mac: String::new() }, &key)?;
    receipt["receiptHash"] = json!(receipt_hash);
    let mut next_values = old_values.clone();
    next_values.as_object_mut().ok_or_else(|| "CORE_TRANSACTION_REJECTED".to_string())?.insert(core_state::CORE_STATE_KEY.into(), core_state::to_value(&next_envelope)?);
    next_values["statistics"] = statistics.clone();
    next_values["records"] = Value::Array(records.clone());
    {
        let mut values = store.values.lock().map_err(|_| "CORE_TRANSACTION_REJECTED".to_string())?;
        *values = next_values;
    }
    if let Err(error) = store.persist() {
        if let Ok(mut values) = store.values.lock() {
            *values = old_values;
        }
        let _ = store.persist();
        return Err(format!("CORE_TRANSACTION_ROLLED_BACK: {}", error));
    }
    Ok(json!({ "receipt": receipt, "statistics": statistics, "records": records, "sequence": next_envelope.state.sequence }))
}

#[tauri::command]
fn core_card_commit(
    store: State<'_, EncryptedStore>,
    authority: State<'_, CoreAuthorityState>,
    request: RustCardCommitRequest,
) -> Result<serde_json::Value, String> {
    validate_core_card_caller(&request)?;
    authority.authorize(&request.grant_token, &request.principal)?;
    if request.input.person_ids.is_empty() || request.input.person_ids.len() > 100 {
        return Err("CORE_TRANSACTION_REJECTED".into());
    }
    let mut unique_ids = Vec::new();
    for person_id in &request.input.person_ids {
        if person_id.is_empty() || unique_ids.contains(person_id) {
            return Err("CORE_TRANSACTION_REJECTED".into());
        }
        unique_ids.push(person_id.clone());
    }
    let _transaction = authority.transaction.lock().map_err(|_| "CORE_TRANSACTION_REJECTED".to_string())?;
    let key = core_data_key()?;
    let old_values = store.values.lock().map_err(|_| "CORE_TRANSACTION_REJECTED".to_string())?.clone();
    let mut envelope = match core_state::parse(&old_values, &key) {
        Ok(envelope) => envelope,
        Err(error) => {
            authority.readonly.store(true, Ordering::Release);
            return Err(error);
        }
    };
    envelope.state.names = json!({
        "currentListId": old_values.get("currentListId").cloned().unwrap_or_else(|| json!("default")),
        "lists": old_values.get("lists").cloned().unwrap_or_else(|| json!({}))
    });
    envelope.state.balance = old_values.get("balance").cloned().unwrap_or_else(|| json!({ "enabled": true }));
    let list_id = if request.input.list_id.is_empty() {
        envelope.state.names.get("currentListId").and_then(Value::as_str).unwrap_or("default").to_string()
    } else {
        request.input.list_id.clone()
    };
    let names = envelope.state.names.get("lists")
        .and_then(|lists| lists.get(&list_id))
        .and_then(|list| list.get("names"))
        .and_then(Value::as_array)
        .ok_or_else(|| "CORE_TRANSACTION_REJECTED".to_string())?;
    let mut results = Vec::new();
    for person_id in &unique_ids {
        let person = names.iter().find(|person| person.get("id").and_then(Value::as_str) == Some(person_id.as_str()))
            .ok_or_else(|| "CORE_TRANSACTION_REJECTED".to_string())?;
        if person.get("isWhiteList").and_then(Value::as_bool).unwrap_or(false) {
            return Err("CORE_TRANSACTION_REJECTED".into());
        }
        results.push(json!({
            "id": person_id,
            "name": person.get("cn").and_then(Value::as_str).unwrap_or(""),
            "englishName": person.get("en").and_then(Value::as_str).unwrap_or("")
        }));
    }
    let operation_id = if request.operation_id.is_empty() {
        format!("card-{}", envelope.state.sequence + 1)
    } else {
        request.operation_id.clone()
    };
    let committed_at = chrono_like_now();
    let mut receipt = json!({
        "kind": "card",
        "operationId": operation_id,
        "pluginId": "core",
        "listId": list_id,
        "count": results.len(),
        "committedAt": committed_at,
        "results": results
    });
    let previous_hash = core_state::hash_state(&envelope)?;
    receipt["sequence"] = json!(envelope.state.sequence + 1);
    receipt["previousHash"] = json!(previous_hash.clone());
    let receipt_hash = core_state::receipt_hash(&receipt)?;
    let mut records = envelope.state.records.as_array().cloned().unwrap_or_default();
    for result in receipt["results"].as_array().unwrap_or(&Vec::new()) {
        records.insert(0, json!({
            "personId": result["id"],
            "listId": receipt["listId"],
            "groupId": Value::Null,
            "source": "card",
            "pluginId": "",
            "operationId": receipt["operationId"],
            "time": committed_at
        }));
    }
    records.truncate(500);
    let next_state = core_state::CoreState {
        schema_version: core_state::CORE_SCHEMA_VERSION,
        sequence: envelope.state.sequence + 1,
        previous_hash,
        receipt_hash: receipt_hash.clone(),
        algorithm: core_state::ALGORITHM_NAME.into(),
        algorithm_version: core_state::ALGORITHM_VERSION.into(),
        names: envelope.state.names.clone(),
        balance: envelope.state.balance.clone(),
        statistics: envelope.state.statistics.clone(),
        records: Value::Array(records.clone()),
    };
    let next_envelope = core_state::seal(core_state::CoreStateEnvelope {
        schema_version: core_state::CORE_SCHEMA_VERSION,
        state: next_state,
        state_mac: String::new(),
    }, &key)?;
    receipt["receiptHash"] = json!(receipt_hash);
    let mut next_values = old_values.clone();
    next_values.as_object_mut().ok_or_else(|| "CORE_TRANSACTION_REJECTED".to_string())?
        .insert(core_state::CORE_STATE_KEY.into(), core_state::to_value(&next_envelope)?);
    next_values["statistics"] = next_envelope.state.statistics.clone();
    next_values["records"] = Value::Array(records.clone());
    *store.values.lock().map_err(|_| "CORE_TRANSACTION_REJECTED".to_string())? = next_values;
    if let Err(error) = store.persist() {
        if let Ok(mut values) = store.values.lock() {
            *values = old_values;
        }
        let _ = store.persist();
        return Err(format!("CORE_TRANSACTION_ROLLED_BACK: {}", error));
    }
    Ok(json!({
        "receipt": receipt,
        "statistics": next_envelope.state.statistics,
        "records": records,
        "sequence": next_envelope.state.sequence
    }))
}

fn apply_core_maintenance(
    old_values: &Value,
    request: &CoreMaintenanceRequest,
    key: &[u8; 32],
    committed_at: u64,
) -> Result<(Value, Value), String> {
    validate_core_maintenance_request(&request)?;
    let mut envelope = core_state::parse(old_values, key)?;
    let reset_all = request.action == "reset-all";
    let initialize_person = request.action == "initialize-person-count";
    let names = if reset_all {
        json!({ "currentListId": "default", "lists": {} })
    } else {
        json!({
            "currentListId": old_values.get("currentListId").cloned().unwrap_or_else(|| json!("default")),
            "lists": old_values.get("lists").cloned().unwrap_or_else(|| json!({}))
        })
    };
    let balance = if reset_all {
        json!({ "enabled": true, "algorithm": core_state::ALGORITHM_NAME })
    } else {
        old_values.get("balance").cloned().unwrap_or_else(|| json!({ "enabled": true, "algorithm": core_state::ALGORITHM_NAME }))
    };
    let mut statistics = if reset_all {
        json!({ "counts": {}, "totalCount": 0 })
    } else {
        envelope.state.statistics.clone()
    };
    let records = if reset_all || request.action == "clear-records" {
        Vec::<Value>::new()
    } else {
        envelope.state.records.as_array().cloned().unwrap_or_default()
    };
    if initialize_person {
        let people = names.get("lists")
            .and_then(|lists| lists.get(&request.list_id))
            .and_then(|list| list.get("names"))
            .and_then(Value::as_array)
            .ok_or_else(|| "CORE_TRANSACTION_REJECTED".to_string())?;
        let person = people.iter()
            .find(|person| person.get("id").and_then(Value::as_str) == Some(request.person_id.as_str()))
            .ok_or_else(|| "CORE_TRANSACTION_REJECTED".to_string())?;
        if person.get("isWhiteList").and_then(Value::as_bool).unwrap_or(false) {
            return Err("CORE_TRANSACTION_REJECTED".into());
        }
        let counts = statistics.as_object_mut()
            .and_then(|value| value.get_mut("counts"))
            .and_then(Value::as_object_mut)
            .ok_or_else(|| "CORE_TRANSACTION_REJECTED".to_string())?;
        if !counts.contains_key(&request.person_id) {
            let existing_counts: Vec<u64> = people.iter()
                .filter(|candidate| {
                    candidate.get("id").and_then(Value::as_str) != Some(request.person_id.as_str())
                        && !candidate.get("isWhiteList").and_then(Value::as_bool).unwrap_or(false)
                        && candidate.get("cn").and_then(Value::as_str).is_some_and(|name| !name.is_empty())
                })
                .map(|candidate| candidate.get("id").and_then(Value::as_str)
                    .and_then(|id| counts.get(id))
                    .and_then(Value::as_u64)
                    .unwrap_or(0))
                .collect();
            let initial_count = if request.mode == "zero" || existing_counts.is_empty() {
                0
            } else {
                let minimum = *existing_counts.iter().min().unwrap_or(&0);
                let maximum = *existing_counts.iter().max().unwrap_or(&0);
                (minimum + maximum + 1) / 2
            };
            counts.insert(request.person_id.clone(), json!(initial_count));
            let total = statistics.get("totalCount").and_then(Value::as_u64).unwrap_or(0);
            statistics["totalCount"] = json!(total + initial_count);
        }
    }
    envelope.state.names = names.clone();
    envelope.state.balance = balance.clone();
    let previous_hash = core_state::hash_state(&envelope)?;
    let mut receipt = json!({
        "kind": "maintenance",
        "action": request.action,
        "operationId": format!("maintenance-{}", envelope.state.sequence + 1),
        "pluginId": "core",
        "committedAt": committed_at,
        "sequence": envelope.state.sequence + 1,
        "previousHash": previous_hash
    });
    let receipt_hash = core_state::receipt_hash(&receipt)?;
    let next_state = core_state::CoreState {
        schema_version: core_state::CORE_SCHEMA_VERSION,
        sequence: envelope.state.sequence + 1,
        previous_hash: receipt["previousHash"].as_str().unwrap_or("").to_string(),
        receipt_hash: receipt_hash.clone(),
        algorithm: core_state::ALGORITHM_NAME.into(),
        algorithm_version: core_state::ALGORITHM_VERSION.into(),
        names: names.clone(),
        balance: balance.clone(),
        statistics: statistics.clone(),
        records: Value::Array(records.clone()),
    };
    let next_envelope = core_state::seal(core_state::CoreStateEnvelope {
        schema_version: core_state::CORE_SCHEMA_VERSION,
        state: next_state,
        state_mac: String::new(),
    }, key)?;
    receipt["receiptHash"] = json!(receipt_hash);
    let mut next_values = old_values.clone();
    if reset_all && !clear_non_core_values(&mut next_values) {
        return Err("CORE_TRANSACTION_REJECTED".into());
    }
    next_values.as_object_mut().ok_or_else(|| "CORE_TRANSACTION_REJECTED".to_string())?
        .insert(core_state::CORE_STATE_KEY.into(), core_state::to_value(&next_envelope)?);
    next_values["lists"] = names["lists"].clone();
    next_values["currentListId"] = names["currentListId"].clone();
    next_values["balance"] = balance;
    next_values["statistics"] = statistics.clone();
    next_values["records"] = Value::Array(records.clone());
    let response = json!({
        "receipt": receipt,
        "statistics": statistics,
        "records": records,
        "sequence": next_envelope.state.sequence
    });
    Ok((next_values, response))
}

#[tauri::command]
fn core_maintenance_execute(
    store: State<'_, EncryptedStore>,
    authority: State<'_, CoreAuthorityState>,
    request: CoreMaintenanceRequest,
) -> Result<serde_json::Value, String> {
    validate_core_maintenance_request(&request)?;
    authority.authorize(&request.grant_token, &request.principal)?;
    let _transaction = authority.transaction.lock().map_err(|_| "CORE_TRANSACTION_REJECTED".to_string())?;
    let key = core_data_key()?;
    let old_values = store.values.lock().map_err(|_| "CORE_TRANSACTION_REJECTED".to_string())?.clone();
    let (next_values, response) = match apply_core_maintenance(&old_values, &request, &key, chrono_like_now()) {
        Ok(value) => value,
        Err(error) => {
            if error == "CORE_INTEGRITY_CHECK_FAILED" {
                authority.readonly.store(true, Ordering::Release);
            }
            return Err(error);
        }
    };
    *store.values.lock().map_err(|_| "CORE_TRANSACTION_REJECTED".to_string())? = next_values;
    if let Err(error) = store.persist() {
        if let Ok(mut values) = store.values.lock() {
            *values = old_values;
        }
        let _ = store.persist();
        return Err(format!("CORE_TRANSACTION_ROLLED_BACK: {}", error));
    }
    Ok(response)
}

fn chrono_like_now() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|duration| duration.as_millis() as u64).unwrap_or(0)
}

fn read_safe_mode_status(path: &Path) -> serde_json::Value {
    let path_text = path.to_string_lossy().to_string();
    let raw = match fs::read_to_string(path) {
        Ok(raw) => raw,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            let created = path.parent().map(fs::create_dir_all).transpose()
                .and_then(|_| fs::write(path, "{\n  \"enable\": false\n}\n"));
            return serde_json::json!({
                "enabled": false,
                "source": "missing",
                "stale": false,
                "errorCode": if created.is_ok() { "" } else { "SAFE_MODE_CONFIG_UNAVAILABLE" },
                "diagnostic": if created.is_ok() { "safemode.json 不存在，已创建默认配置".to_string() } else { format!("safemode.json 不存在且默认配置创建失败：{}", created.unwrap_err()) },
                "path": path_text
            });
        }
        Err(error) => {
            return serde_json::json!({
                "enabled": true,
                "source": "unavailable",
                "stale": false,
                "errorCode": "SAFE_MODE_CONFIG_UNAVAILABLE",
                "diagnostic": error.to_string(),
                "path": path_text
            });
        }
    };
    let value = match serde_json::from_str::<serde_json::Value>(&raw) {
        Ok(value) => value,
        Err(error) => return serde_json::json!({
            "enabled": true,
            "source": "invalid",
            "stale": false,
            "errorCode": "SAFE_MODE_CONFIG_INVALID",
            "diagnostic": error.to_string(),
            "path": path_text
        }),
    };
    let object = match value.as_object() {
        Some(object) => object,
        None => return serde_json::json!({
            "enabled": true,
            "source": "invalid",
            "stale": false,
            "errorCode": "SAFE_MODE_CONFIG_INVALID",
            "diagnostic": "safemode.json 必须是对象",
            "path": path_text
        }),
    };
    let enabled = match object.get("enable").and_then(serde_json::Value::as_bool) {
        Some(enabled) => enabled,
        None => return serde_json::json!({
            "enabled": true,
            "source": "invalid",
            "stale": false,
            "errorCode": "SAFE_MODE_CONFIG_INVALID",
            "diagnostic": "safemode.json 必须包含布尔值 enable",
            "path": path_text
        }),
    };
    if object.get("schemaVersion").is_some_and(|version| version.as_u64().map_or(true, |version| version == 0)) {
        return serde_json::json!({
            "enabled": true,
            "source": "invalid",
            "stale": false,
            "errorCode": "SAFE_MODE_CONFIG_INVALID",
            "diagnostic": "safemode.json 的 schemaVersion 必须是正整数",
            "path": path_text
        });
    }
    let unknown: Vec<_> = object.keys().filter(|key| *key != "enable" && *key != "schemaVersion").cloned().collect();
    serde_json::json!({
        "enabled": enabled,
        "source": "file",
        "stale": false,
        "errorCode": "",
        "diagnostic": if unknown.is_empty() { String::new() } else { format!("safemode.json 已忽略未知字段：{}", unknown.join(", ")) },
        "path": path_text
    })
}

#[tauri::command]
fn safe_mode_status(state: State<'_, SafeModeState>) -> serde_json::Value {
    state.status.lock().map(|status| status.clone()).unwrap_or_else(|_| serde_json::json!({
        "enabled": true,
        "source": "invalid",
        "stale": false,
        "errorCode": "SAFE_MODE_CONFIG_INVALID",
        "diagnostic": "安全模式状态锁定失败"
    }))
}

impl EncryptedStore {
    fn load(path: PathBuf) -> Self {
        let directory_error = path
            .parent()
            .and_then(|parent| fs::create_dir_all(parent).err())
            .map(|error| error.to_string());
        let (values, integrity_error) = if let Some(error) = directory_error {
            (serde_json::json!({}), Some(error))
        } else {
            let candidates = [
                path.clone(),
                path.with_extension("cyrene.tmp"),
                path.with_extension("cyrene.bak"),
            ];
            let mut valid = Vec::new();
            let mut last_error = None;
            for candidate in candidates {
                match fs::read(&candidate) {
                    Ok(bytes) => match decrypt_data(&bytes) {
                        Ok(mut values) => {
                            if values.get(core_state::CORE_STATE_KEY).is_some() {
                                let key = match core_data_key() {
                                    Ok(key) => key,
                                    Err(error) => { last_error = Some(error); continue; }
                                };
                                values = match core_state::normalize_values(&values, &key) {
                                    Ok(values) => values,
                                    Err(_) => {
                                        last_error = Some("CORE_INTEGRITY_CHECK_FAILED".into());
                                        continue;
                                    }
                                };
                                if core_state::parse(&values, &key).is_err() {
                                    last_error = Some("CORE_INTEGRITY_CHECK_FAILED".into());
                                    continue;
                                }
                            }
                            let sequence = values
                                .get(core_state::CORE_STATE_KEY)
                                .and_then(|value| value.get("state"))
                                .and_then(|value| value.get("sequence"))
                                .and_then(serde_json::Value::as_u64)
                                .unwrap_or(0);
                            valid.push((sequence, candidate, values));
                        }
                        Err(error) => last_error = Some(error),
                    },
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                    Err(error) => last_error = Some(error.to_string()),
                }
            }
            if let Some((_, selected_path, values)) = valid.into_iter().max_by_key(|item| item.0) {
                if selected_path != path {
                    let _ = fs::copy(&selected_path, &path);
                }
                (values, None)
            } else if last_error.is_some() {
                (serde_json::json!({}), last_error)
            } else {
                (serde_json::json!({}), None)
            }
        };
        Self {
            path: Mutex::new(path),
            values: Mutex::new(values),
            integrity_error: Mutex::new(integrity_error),
        }
    }

    fn is_healthy(&self) -> Result<(), String> {
        self.integrity_error
            .lock()
            .map_err(|_| "数据锁定失败".to_string())?
            .clone()
            .map_or(Ok(()), Err)
    }

    fn persist(&self) -> Result<(), String> {
        self.persist_with_fault(None)
    }

    fn persist_with_fault(&self, fail_stage: Option<&str>) -> Result<(), String> {
        self.is_healthy()?;
        let path = self
            .path
            .lock()
            .map_err(|_| "数据路径锁定失败".to_string())?
            .clone();
        let values = self
            .values
            .lock()
            .map_err(|_| "数据锁定失败".to_string())?
            .clone();
        let temporary_path = path.with_extension("cyrene.tmp");
        let bytes = encrypt_data(&values)?;
        let mut temporary = OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .open(&temporary_path)
            .map_err(|error| error.to_string())?;
        temporary.write_all(&bytes).map_err(|error| error.to_string())?;
        if fail_stage == Some("temporary-write") { return Err("injected temporary-write failure".into()); }
        temporary.sync_all().map_err(|error| error.to_string())?;
        if fail_stage == Some("temporary-sync") { return Err("injected temporary-sync failure".into()); }
        drop(temporary);
        let backup_path = path.with_extension("cyrene.bak");
        let _ = fs::remove_file(&backup_path);
        if path.exists() {
            fs::rename(&path, &backup_path).map_err(|error| error.to_string())?;
        }
        if fail_stage == Some("backup") { return Err("injected backup failure".into()); }
        match fs::rename(&temporary_path, &path) {
            Ok(_) => {
                if fail_stage == Some("replace") { return Err("injected replace failure".into()); }
                let _ = fs::remove_file(backup_path);
                if let Some(parent) = path.parent() {
                    if let Ok(directory) = fs::File::open(parent) {
                        let _ = directory.sync_all();
                    }
                }
                Ok(())
            }
            Err(error) => {
                if backup_path.exists() {
                    let _ = fs::rename(&backup_path, &path);
                }
                Err(error.to_string())
            }
        }
    }
}

fn installation_dir() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(Path::to_path_buf))
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
}

fn legacy_installation_data_dir() -> PathBuf {
    installation_dir().join("data")
}

fn portable_marker_path(root: &Path) -> PathBuf {
    root.join(PORTABLE_MODE_MARKER)
}

fn portable_data_path(root: &Path) -> PathBuf {
    root.join("data").join("cyrene-data.cyrene")
}

fn data_path_for_mode(app_data_dir: &Path, root: &Path, portable: bool) -> PathBuf {
    if portable {
        portable_data_path(root)
    } else {
        app_data_dir.join("data").join("cyrene-data.cyrene")
    }
}

fn configured_data_path(app_data_dir: &Path, root: &Path) -> PathBuf {
    data_path_for_mode(app_data_dir, root, portable_marker_path(root).is_file())
}

fn set_portable_marker(root: &Path, enabled: bool) -> Result<(), String> {
    let marker = portable_marker_path(root);
    if enabled {
        fs::write(marker, b"portable\n").map_err(|error| error.to_string())
    } else if marker.exists() {
        fs::remove_file(marker).map_err(|error| error.to_string())
    } else {
        Ok(())
    }
}

fn portable_program_dir_error(root: &Path, enabled: bool, error: impl std::fmt::Display) -> String {
    let action = if enabled { "写入便携数据或 portable.mode 标记" } else { "删除 portable.mode 标记" };
    let unchanged = if enabled { "当前仍使用 AppData。" } else { "当前仍保持便携模式。" };
    format!(
        "无法{}便携模式：程序目录“{}”可能受系统保护（例如 C:\\Program Files），应用无法{}。{}请将程序移至非受保护且可写的目录后重试；确需保留当前位置时，请以管理员身份运行。原始错误：{}",
        if enabled { "开启" } else { "关闭" },
        root.to_string_lossy(),
        action,
        unchanged,
        error
    )
}

fn portable_target_error(root: &Path, enabled: bool, error: impl std::fmt::Display) -> String {
    if enabled {
        portable_program_dir_error(root, true, error)
    } else {
        format!("无法关闭便携模式：数据无法迁移到 AppData，当前仍保持便携模式。原始错误：{}", error)
    }
}

fn get_resource_dir(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .resource_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
}

fn data_key() -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(b"CyreneNameRoller:encrypted-data:v1:cn.cyrene2008.nameroller");
    hasher.finalize().into()
}

fn encrypt_data(values: &serde_json::Value) -> Result<Vec<u8>, String> {
    let key = core_data_key()?;
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|error| error.to_string())?;
    let mut nonce = [0u8; DATA_NONCE_LENGTH];
    OsRng.fill_bytes(&mut nonce);
    let plain = serde_json::to_vec(values).map_err(|error| error.to_string())?;
    let encrypted = cipher
        .encrypt(Nonce::from_slice(&nonce), plain.as_ref())
        .map_err(|error| error.to_string())?;
    let mut output = Vec::with_capacity(DATA_MAGIC.len() + nonce.len() + encrypted.len());
    output.extend_from_slice(DATA_MAGIC);
    output.extend_from_slice(&nonce);
    output.extend_from_slice(&encrypted);
    Ok(output)
}

fn decrypt_data(bytes: &[u8]) -> Result<serde_json::Value, String> {
    if bytes.len() <= DATA_MAGIC.len() + DATA_NONCE_LENGTH + DATA_TAG_LENGTH {
        return Err("数据文件格式无效".into());
    }
    if !bytes.starts_with(DATA_MAGIC) {
        return Err("数据文件标识无效".into());
    }
    let nonce_start = DATA_MAGIC.len();
    let nonce_end = nonce_start + DATA_NONCE_LENGTH;
    let key = data_key();
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|error| error.to_string())?;
    let plain = cipher
        .decrypt(
            Nonce::from_slice(&bytes[nonce_start..nonce_end]),
            &bytes[nonce_end..],
        )
        .map_err(|_| "数据完整性校验失败，文件可能已被篡改".to_string())?;
    let values: serde_json::Value =
        serde_json::from_slice(&plain).map_err(|_| "数据内容无效".to_string())?;
    if !values.is_object() {
        return Err("数据内容无效".into());
    }
    Ok(values)
}

// 保存主窗口的尺寸、位置与最大化状态，供下次启动恢复
fn save_window_state(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if let Ok(size) = window.outer_size() {
            let store = app.state::<EncryptedStore>();
            if store.is_healthy().is_ok() {
                if let Ok(mut values) = store.values.lock() {
                    values["windowState"] = serde_json::json!({
                        "width": size.width,
                        "height": size.height,
                        "isMaximized": window.is_maximized().unwrap_or(false),
                    });
                }
                let _ = store.persist();
            }
        }
    }
}

// 恢复尺寸后重新居中，并限制在当前显示器内，避免高 DPI 下窗口被挤到屏幕边缘。
fn restore_window_state(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let store = app.state::<EncryptedStore>();
        let state = store
            .values
            .lock()
            .ok()
            .and_then(|values| values.get("windowState").cloned());
        if state
            .as_ref()
            .and_then(|value| value["isMaximized"].as_bool())
            == Some(true)
        {
            let _ = window.maximize();
            return;
        }

        let saved_size = state.as_ref().and_then(|value| {
            Some((
                value["width"].as_u64()? as u32,
                value["height"].as_u64()? as u32,
            ))
        });
        let current_size = window
            .outer_size()
            .ok()
            .map(|size| (size.width, size.height));
        if let Some((mut width, mut height)) = saved_size.or(current_size) {
            if let Ok(Some(monitor)) = window.current_monitor() {
                let monitor_size = monitor.size();
                width = width.min((monitor_size.width as f64 * 0.9) as u32);
                height = height.min((monitor_size.height as f64 * 0.86) as u32);
            }
            let _ = window.set_size(tauri::PhysicalSize::new(width, height));
        }
        let _ = window.center();
    }
}

fn center_floating_window(
    work_x: i32,
    work_y: i32,
    work_width: u32,
    work_height: u32,
    scale_factor: f64,
    logical_size: i32,
) -> (i32, i32) {
    let physical_size = logical_size as f64 * scale_factor;
    let x = work_x as f64 + (work_width as f64 - physical_size) / 2.0;
    let y = work_y as f64 + (work_height as f64 - physical_size) / 2.0;
    (x.round() as i32, y.round() as i32)
}

fn floating_window_position_visible(
    x: i32,
    y: i32,
    work_areas: &[(i32, i32, u32, u32, f64)],
    logical_size: i32,
) -> bool {
    let left = x as i64;
    let top = y as i64;

    work_areas
        .iter()
        .any(|(work_x, work_y, work_width, work_height, scale_factor)| {
            let physical_size = (logical_size as f64 * scale_factor).round() as i64;
            let right = left + physical_size;
            let bottom = top + physical_size;
            let work_left = *work_x as i64;
            let work_top = *work_y as i64;
            let work_right = work_left + *work_width as i64;
            let work_bottom = work_top + *work_height as i64;
            left < work_right && right > work_left && top < work_bottom && bottom > work_top
        })
}

fn resize_floating_window_position(x: i32, y: i32, old_size: i32, new_size: i32) -> (i32, i32) {
    let delta = (old_size - new_size) as f64 / 2.0;
    (
        (x as f64 + delta).round() as i32,
        (y as f64 + delta).round() as i32,
    )
}

fn constrain_floating_window_position(
    x: i32,
    y: i32,
    physical_size: i32,
    work_x: i32,
    work_y: i32,
    work_width: u32,
    work_height: u32,
) -> (i32, i32) {
    let max_x = work_x
        .saturating_add(work_width as i32)
        .saturating_sub(physical_size);
    let max_y = work_y
        .saturating_add(work_height as i32)
        .saturating_sub(physical_size);
    (
        x.clamp(work_x, max_x.max(work_x)),
        y.clamp(work_y, max_y.max(work_y)),
    )
}

fn floating_work_areas(app: &tauri::AppHandle) -> Result<Vec<(i32, i32, u32, u32, f64)>, String> {
    app.available_monitors()
        .map_err(|error| error.to_string())
        .map(|monitors| {
            monitors
                .into_iter()
                .map(|monitor| {
                    let area = monitor.work_area();
                    (
                        area.position.x,
                        area.position.y,
                        area.size.width,
                        area.size.height,
                        monitor.scale_factor(),
                    )
                })
                .collect()
        })
}

fn floating_window_size(app: &tauri::AppHandle) -> i32 {
    let store = app.state::<EncryptedStore>();
    let value = store.values.lock().ok().and_then(|values| {
        values["settings"]["floatingWindowSize"]
            .as_f64()
            .or_else(|| {
                values["settings"]["floatingWindowSize"]
                    .as_i64()
                    .map(|value| value as f64)
            })
    });
    normalize_floating_window_size(value)
}

fn primary_floating_position(
    app: &tauri::AppHandle,
    logical_size: i32,
) -> Result<(i32, i32), String> {
    let monitor = app
        .primary_monitor()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "无法获取主屏幕信息".to_string())?;
    let area = monitor.work_area();
    Ok(center_floating_window(
        area.position.x,
        area.position.y,
        area.size.width,
        area.size.height,
        monitor.scale_factor(),
        logical_size,
    ))
}

fn stored_tauri_floating_position(app: &tauri::AppHandle) -> Option<(i32, i32)> {
    let store = app.state::<EncryptedStore>();
    let values = store.values.lock().ok()?;
    let position = &values["floatingWindowPosition"]["tauri"];
    let x = i32::try_from(position["x"].as_i64()?).ok()?;
    let y = i32::try_from(position["y"].as_i64()?).ok()?;
    Some((x, y))
}

fn resolve_tauri_floating_position(
    app: &tauri::AppHandle,
    logical_size: i32,
) -> Result<((i32, i32), bool), String> {
    let work_areas = floating_work_areas(app)?;
    if let Some((x, y)) = stored_tauri_floating_position(app) {
        if floating_window_position_visible(x, y, &work_areas, logical_size) {
            return Ok(((x, y), false));
        }
    }
    Ok((primary_floating_position(app, logical_size)?, true))
}

fn floating_work_area_for_center(
    work_areas: &[(i32, i32, u32, u32, f64)],
    center_x: i32,
    center_y: i32,
) -> Option<(i32, i32, u32, u32, f64)> {
    work_areas.iter().copied().find(|(x, y, width, height, _)| {
        center_x >= *x
            && center_x < x.saturating_add(*width as i32)
            && center_y >= *y
            && center_y < y.saturating_add(*height as i32)
    })
}

fn persist_tauri_floating_position(app: &tauri::AppHandle, x: i32, y: i32) -> Result<(), String> {
    let store = app.state::<EncryptedStore>();
    store.is_healthy()?;
    let previous_position_value;
    {
        let mut values = store
            .values
            .lock()
            .map_err(|_| "数据锁定失败".to_string())?;
        let root = values
            .as_object_mut()
            .ok_or_else(|| "数据内容无效".to_string())?;
        previous_position_value = root.get("floatingWindowPosition").cloned();
        let positions = root
            .entry("floatingWindowPosition".to_string())
            .or_insert_with(|| serde_json::json!({}));
        if !positions.is_object() {
            *positions = serde_json::json!({});
        }
        positions
            .as_object_mut()
            .expect("floatingWindowPosition was normalized to an object")
            .insert("tauri".to_string(), serde_json::json!({ "x": x, "y": y }));
    }

    if let Err(error) = store.persist() {
        if let Ok(mut values) = store.values.lock() {
            if let Some(root) = values.as_object_mut() {
                if let Some(previous) = previous_position_value {
                    root.insert("floatingWindowPosition".to_string(), previous);
                } else {
                    root.remove("floatingWindowPosition");
                }
            }
        }
        return Err(error);
    }
    Ok(())
}

async fn download_installer_bytes(
    app: &tauri::AppHandle,
    url: &str,
    expected_size: u64,
    source: &str,
) -> Result<Vec<u8>, String> {
    if !url.starts_with(UPDATE_URL_PREFIX) {
        return Err("更新地址不属于 CyreneNameRoller 官方发布源".into());
    }
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(15))
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())?;
    let urls = if source == "github" {
        vec![url.to_string()]
    } else if source == "ghproxy" {
        vec![format!("https://v4.gh-proxy.com/{}", url)]
    } else {
        vec![format!("{}{}", UPDATE_PROXY_BASE, url)]
    };
    let mut failures = Vec::new();

    for candidate_url in urls {
        match client
            .get(&candidate_url)
            .header("User-Agent", "CyreneNameRoller")
            .header("Accept", "application/octet-stream")
            .send()
            .await
        {
            Ok(mut resp) if resp.status().is_success() => {
                let content_type = resp
                    .headers()
                    .get(reqwest::header::CONTENT_TYPE)
                    .and_then(|value| value.to_str().ok())
                    .unwrap_or("")
                    .to_ascii_lowercase();
                if content_type.contains("text/html") || content_type.contains("application/json") {
                    failures.push(format!("服务器返回了非安装程序内容 ({})", content_type));
                    continue;
                }

                let total_size = if expected_size > 0 {
                    expected_size
                } else {
                    resp.content_length().unwrap_or(0)
                };
                let mut bytes = Vec::with_capacity(total_size.min(usize::MAX as u64) as usize);
                let mut last_progress = 0u8;
                let mut download_error = None;
                let _ = app.emit("update-download-progress", 0u8);

                loop {
                    match resp.chunk().await {
                        Ok(Some(chunk)) => {
                            bytes.extend_from_slice(&chunk);
                            if total_size > 0 {
                                let progress =
                                    ((bytes.len() as u64 * 99) / total_size).min(99) as u8;
                                if progress > last_progress {
                                    last_progress = progress;
                                    let _ = app.emit("update-download-progress", progress);
                                }
                            }
                        }
                        Ok(None) => break,
                        Err(error) => {
                            download_error = Some(error.to_string());
                            break;
                        }
                    }
                }

                if let Some(error) = download_error {
                    failures.push(error);
                    continue;
                }

                let actual_size = bytes.len() as u64;
                if expected_size > 0 && actual_size != expected_size {
                    failures.push(format!(
                        "安装程序不完整：应为 {} 字节，实际为 {} 字节",
                        expected_size, actual_size
                    ));
                    continue;
                }
                if bytes.len() < MIN_INSTALLER_SIZE {
                    failures.push(format!("安装程序体积异常：仅 {} 字节", bytes.len()));
                    continue;
                }
                if !bytes.starts_with(b"MZ") {
                    failures.push("安装程序文件头无效，不是 Windows PE 文件".into());
                    continue;
                }
                return Ok(bytes);
            }
            Ok(resp) => failures.push(format!("更新服务器返回 HTTP {}", resp.status())),
            Err(error) => failures.push(error.to_string()),
        }
    }
    Err(if failures.is_empty() {
        "下载失败，请检查网络或稍后重试".into()
    } else {
        failures.join("；")
    })
}

fn installer_temp_path(file_name: &str) -> Result<PathBuf, String> {
    let safe_name = Path::new(file_name)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| name.to_ascii_lowercase().ends_with(".exe"))
        .ok_or_else(|| "安装程序文件名无效".to_string())?;
    let update_dir = std::env::temp_dir().join("CyreneNameRoller-Update");
    fs::create_dir_all(&update_dir).map_err(|error| error.to_string())?;
    Ok(update_dir.join(safe_name))
}

fn launch_installer(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new(path)
            .spawn()
            .map(|_| ())
            .map_err(|error| error.to_string())
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(path)
            .spawn()
            .map(|_| ())
            .map_err(|error| error.to_string())
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map(|_| ())
            .map_err(|error| error.to_string())
    }
}

#[tauri::command]
fn storage_get(store: State<'_, EncryptedStore>, key: String) -> Option<serde_json::Value> {
    if store.is_healthy().is_err() {
        return None;
    }
    store
        .values
        .lock()
        .ok()
        .and_then(|values| values.get(&key).cloned())
}

fn is_core_storage_key(key: &str) -> bool {
    matches!(key, "lists" | "currentListId" | "balance" | "statistics" | "records" | core_state::CORE_STATE_KEY)
}

fn clear_non_core_values(values: &mut Value) -> bool {
    let Some(object) = values.as_object_mut() else { return false; };
    object.retain(|key, _| is_core_storage_key(key));
    true
}

fn migrate_legacy_data(app: &tauri::AppHandle) {
    let store = app.state::<EncryptedStore>();
    let Ok(store_path) = store.path.lock().map(|path| path.clone()) else {
        return;
    };
    if store_path.exists() || store.is_healthy().is_err() {
        return;
    }

    // 26.0.5 曾把数据写在安装目录。普通用户通常无权写 Program Files，
    // 因此只读取并迁移到当前用户的 AppData，保留原文件作为回退备份。
    let installed_data = legacy_installation_data_dir().join("cyrene-data.cyrene");
    if installed_data != store_path {
        if let Ok(bytes) = fs::read(&installed_data) {
            if let Ok(values) = decrypt_data(&bytes) {
                if let Ok(mut current_values) = store.values.lock() {
                    *current_values = values;
                }
                if store.persist().is_ok() {
                    return;
                }
            }
        }
    }

    let legacy_dir = match app.path().app_data_dir() {
        Ok(path) => path.join("data"),
        Err(_) => return,
    };
    let mut values = serde_json::Map::new();
    let mut legacy_paths = Vec::new();
    if let Ok(entries) = fs::read_dir(&legacy_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|extension| extension.to_str()) != Some("json") {
                continue;
            }
            let Ok(raw) = fs::read_to_string(&path) else {
                continue;
            };
            let Ok(value) = serde_json::from_str::<serde_json::Value>(&raw) else {
                continue;
            };
            let Some(stem) = path.file_stem().and_then(|stem| stem.to_str()) else {
                continue;
            };
            if stem == "window-state" {
                values.insert(
                    "windowState".into(),
                    serde_json::json!({
                        "width": value["width"],
                        "height": value["height"],
                        "isMaximized": value["maximized"].as_bool().unwrap_or(false),
                    }),
                );
            } else {
                values.insert(stem.to_string(), value);
            }
            legacy_paths.push(path);
        }
    }
    if values.is_empty() {
        return;
    }
    if let Ok(mut current_values) = store.values.lock() {
        *current_values = serde_json::Value::Object(values);
    } else {
        return;
    }
    if store.persist().is_ok() {
        legacy_paths.into_iter().for_each(|path| {
            let _ = fs::remove_file(path);
        });
    }
}

#[tauri::command]
fn portable_mode_status(store: State<'_, EncryptedStore>) -> Result<serde_json::Value, String> {
    let path = store
        .path
        .lock()
        .map_err(|_| "数据路径锁定失败".to_string())?
        .clone();
    let enabled = path == portable_data_path(&installation_dir());
    Ok(serde_json::json!({
        "enabled": enabled,
        "dataPath": path.to_string_lossy()
    }))
}

#[tauri::command]
fn set_portable_mode(
    app: tauri::AppHandle,
    store: State<'_, EncryptedStore>,
    enabled: bool,
) -> Result<serde_json::Value, String> {
    store.is_healthy()?;
    let root = installation_dir();
    let app_data_dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    let target_path = data_path_for_mode(&app_data_dir, &root, enabled);
    let mut active_path = store
        .path
        .lock()
        .map_err(|_| "数据路径锁定失败".to_string())?;
    if *active_path != target_path {
        if let Some(parent) = target_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| portable_target_error(&root, enabled, error))?;
        }
        let values = store
            .values
            .lock()
            .map_err(|_| "数据锁定失败".to_string())?
            .clone();
        EncryptedStore {
            path: Mutex::new(target_path.clone()),
            values: Mutex::new(values),
            integrity_error: Mutex::new(None),
        }
        .persist()
        .map_err(|error| portable_target_error(&root, enabled, error))?;
        set_portable_marker(&root, enabled)
            .map_err(|error| portable_program_dir_error(&root, enabled, error))?;
        *active_path = target_path.clone();
    } else {
        set_portable_marker(&root, enabled)
            .map_err(|error| portable_program_dir_error(&root, enabled, error))?;
    }
    Ok(serde_json::json!({
        "success": true,
        "enabled": enabled,
        "dataPath": target_path.to_string_lossy()
    }))
}

#[tauri::command]
fn storage_set(
    store: State<'_, EncryptedStore>,
    key: String,
    value: serde_json::Value,
) -> serde_json::Value {
    if is_core_storage_key(&key) {
        return serde_json::json!({ "success": false, "code": "PLUGIN_PERMISSION_DENIED", "error": "核心名单、算法设置、统计和记录必须通过权威事务写入" });
    }
    if store.is_healthy().is_err() {
        return serde_json::json!({ "success": false, "error": "数据文件完整性检查失败" });
    }
    if let Ok(mut values) = store.values.lock() {
        if let Some(object) = values.as_object_mut() {
            object.insert(key, value);
        } else {
            return serde_json::json!({ "success": false, "error": "数据内容无效" });
        }
    } else {
        return serde_json::json!({ "success": false, "error": "数据锁定失败" });
    }
    match store.persist() {
        Ok(_) => serde_json::json!({
            "success": true,
            "filePath": store.path.lock().ok().map(|path| path.to_string_lossy().into_owned()).unwrap_or_default()
        }),
        Err(error) => serde_json::json!({ "success": false, "error": error }),
    }
}

#[tauri::command]
fn storage_delete(store: State<'_, EncryptedStore>, key: String) -> bool {
    if is_core_storage_key(&key) {
        return false;
    }
    if store.is_healthy().is_err() {
        return false;
    }
    if let Ok(mut values) = store.values.lock() {
        if let Some(object) = values.as_object_mut() {
            object.remove(&key);
        } else {
            return false;
        }
    } else {
        return false;
    }
    store.persist().is_ok()
}

#[tauri::command]
fn storage_clear(store: State<'_, EncryptedStore>) -> bool {
    if store.is_healthy().is_err() {
        return false;
    }
    if let Ok(mut values) = store.values.lock() {
        if !clear_non_core_values(&mut values) {
            return false;
        }
    } else {
        return false;
    }
    store.persist().is_ok()
}

#[tauri::command]
fn export_encrypted_data(store: State<'_, EncryptedStore>) -> Result<String, String> {
    store.persist()?;
    let path = store.path.lock().map_err(|_| "数据路径锁定失败".to_string())?.clone();
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

#[tauri::command]
fn import_encrypted_data(
    store: State<'_, EncryptedStore>,
    encoded_data: String,
) -> Result<bool, String> {
    store.is_healthy()?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded_data)
        .map_err(|_| "导入文件编码无效".to_string())?;
    let values = core_state::normalize_values(&decrypt_data(&bytes)?, &core_data_key()?)?;
    let old_values = store.values.lock().map_err(|_| "数据锁定失败".to_string())?.clone();
    if let Ok(mut current_values) = store.values.lock() {
        *current_values = values;
    } else {
        return Err("数据锁定失败".into());
    }
    if let Err(error) = store.persist() {
        *store.values.lock().map_err(|_| "数据锁定失败".to_string())? = old_values;
        let _ = store.persist();
        return Err(format!("CORE_TRANSACTION_ROLLED_BACK: {}", error));
    }
    Ok(true)
}

#[tauri::command]
async fn save_text_file(
    app: tauri::AppHandle,
    content: String,
    default_name: String,
    extension: String,
) -> Result<serde_json::Value, String> {
    let safe_extension: String = extension
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .collect();
    let safe_extension = if safe_extension.is_empty() {
        "json".to_string()
    } else {
        safe_extension
    };
    let selected = app
        .dialog()
        .file()
        .set_title("保存文件")
        .set_file_name(default_name)
        .add_filter(
            format!("{} 文件", safe_extension.to_uppercase()),
            &[safe_extension.as_str()],
        )
        .blocking_save_file();
    let Some(selected) = selected else {
        return Ok(serde_json::json!({ "success": false, "cancelled": true }));
    };
    let path = selected.into_path().map_err(|error| error.to_string())?;
    fs::write(&path, content).map_err(|error| error.to_string())?;
    Ok(serde_json::json!({ "success": true, "filePath": path.to_string_lossy() }))
}

#[tauri::command]
async fn open_text_file(
    app: tauri::AppHandle,
    extension: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let raw_extensions: Vec<String> = match extension {
        serde_json::Value::Array(values) => values
            .into_iter()
            .filter_map(|value| value.as_str().map(ToOwned::to_owned))
            .collect(),
        serde_json::Value::String(value) => vec![value],
        _ => Vec::new(),
    };
    let mut safe_extensions: Vec<String> = raw_extensions
        .into_iter()
        .map(|value| {
            value
                .chars()
                .filter(|character| character.is_ascii_alphanumeric())
                .collect::<String>()
                .to_lowercase()
        })
        .filter(|value| !value.is_empty())
        .collect();
    safe_extensions.sort();
    safe_extensions.dedup();
    if safe_extensions.is_empty() {
        safe_extensions.push("json".to_string());
    }
    let filter_name = format!(
        "{} 文件",
        safe_extensions
            .iter()
            .map(|value| value.to_uppercase())
            .collect::<Vec<_>>()
            .join(" / ")
    );
    let filter_extensions: Vec<&str> = safe_extensions.iter().map(String::as_str).collect();
    let selected = app
        .dialog()
        .file()
        .set_title("打开文件")
        .add_filter(filter_name, &filter_extensions)
        .blocking_pick_file();
    let Some(selected) = selected else {
        return Ok(serde_json::json!({ "success": false, "cancelled": true }));
    };
    let path = selected.into_path().map_err(|error| error.to_string())?;
    let content = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    Ok(
        serde_json::json!({ "success": true, "content": content, "filePath": path.to_string_lossy() }),
    )
}

struct UriRequestState {
    frontend_ready: AtomicBool,
    pending: Mutex<Vec<String>>,
}

impl UriRequestState {
    fn new() -> Self {
        Self {
            frontend_ready: AtomicBool::new(false),
            pending: Mutex::new(Vec::new()),
        }
    }
}

fn request_open_uri(app: &tauri::AppHandle, uri: String) -> Result<(), String> {
    if !is_cyrene_uri(&uri) {
        return Err("不支持的 URI 协议".into());
    }
    let state = app.state::<UriRequestState>();
    if state.frontend_ready.load(Ordering::Acquire) {
        app.emit("uri-open-requested", uri)
            .map_err(|error| error.to_string())?;
    } else {
        state
            .pending
            .lock()
            .map_err(|_| "URI 请求队列锁定失败".to_string())?
            .push(uri);
    }
    Ok(())
}

#[tauri::command]
async fn plugin_select_file(
    app: tauri::AppHandle,
    extensions: Vec<String>,
) -> Result<serde_json::Value, String> {
    let mut safe_extensions: Vec<String> = extensions
        .into_iter()
        .map(|value| {
            value
                .chars()
                .filter(|character| character.is_ascii_alphanumeric())
                .collect::<String>()
                .to_lowercase()
        })
        .filter(|value| !value.is_empty() && value.len() <= 12)
        .take(24)
        .collect();
    safe_extensions.sort();
    safe_extensions.dedup();
    let mut picker = app.dialog().file().set_title("插件选择文件");
    if !safe_extensions.is_empty() {
        let filter_extensions: Vec<&str> = safe_extensions.iter().map(String::as_str).collect();
        picker = picker.add_filter("允许的文件", &filter_extensions);
    }
    let Some(selected) = picker.blocking_pick_file() else {
        return Ok(serde_json::json!({ "success": false, "cancelled": true }));
    };
    let path = selected.into_path().map_err(|error| error.to_string())?;
    let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
    if !metadata.is_file() {
        return Err("插件只能选择普通文件".into());
    }
    if metadata.len() > 32 * 1024 * 1024 {
        return Err("插件选择的文件不能超过 32 MB".into());
    }
    let bytes = fs::read(&path).map_err(|error| error.to_string())?;
    Ok(serde_json::json!({
        "success": true,
        "name": path.file_name().and_then(OsStr::to_str).unwrap_or("file"),
        "path": path.to_string_lossy(),
        "size": metadata.len(),
        "base64": base64::engine::general_purpose::STANDARD.encode(bytes)
    }))
}

#[tauri::command]
async fn plugin_select_directory(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let Some(selected) = app
        .dialog()
        .file()
        .set_title("插件选择目录")
        .blocking_pick_folder()
    else {
        return Ok(serde_json::json!({ "success": false, "cancelled": true }));
    };
    let path = selected.into_path().map_err(|error| error.to_string())?;
    Ok(serde_json::json!({
        "success": true,
        "name": path.file_name().and_then(OsStr::to_str).unwrap_or("directory"),
        "path": path.to_string_lossy()
    }))
}

#[tauri::command]
async fn plugin_execute_operation(
    program: String,
    args: Vec<String>,
    timeout_ms: u64,
) -> Result<serde_json::Value, String> {
    if program.is_empty()
        || program.len() > 128
        || !program
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "_.-".contains(character))
    {
        return Err("插件系统操作的程序名无效".into());
    }
    if args.len() > 32
        || args
            .iter()
            .any(|argument| argument.contains('\0') || argument.len() > 2048)
    {
        return Err("插件系统操作的固定参数无效".into());
    }
    let timeout_ms = timeout_ms.clamp(1000, 30000);
    tauri::async_runtime::spawn_blocking(move || {
        let mut command = background_command(&program);
        command
            .args(&args)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        let mut child = command.spawn().map_err(|error| error.to_string())?;
        let deadline = Instant::now() + Duration::from_millis(timeout_ms);
        loop {
            if let Some(status) = child.try_wait().map_err(|error| error.to_string())? {
                return Ok(serde_json::json!({
                    "success": status.success(),
                    "exitCode": status.code(),
                    "timedOut": false,
                    "error": if status.success() { "" } else { "系统操作返回非零退出状态" }
                }));
            }
            if Instant::now() >= deadline {
                let _ = child.kill();
                let _ = child.wait();
                return Ok(serde_json::json!({
                    "success": false,
                    "timedOut": true,
                    "error": "系统操作执行超时"
                }));
            }
            std::thread::sleep(Duration::from_millis(25));
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn export_data_file(
    app: tauri::AppHandle,
    store: State<'_, EncryptedStore>,
) -> Result<serde_json::Value, String> {
    store.persist()?;
    let selected = app
        .dialog()
        .file()
        .set_title("导出程序数据")
        .set_file_name("cyrene-data.cyrene")
        .add_filter("Cyrene Data", &["cyrene"])
        .blocking_save_file();
    let Some(selected) = selected else {
        return Ok(serde_json::json!({ "success": false, "cancelled": true }));
    };
    let path = selected.into_path().map_err(|error| error.to_string())?;
    let store_path = store.path.lock().map_err(|_| "数据路径锁定失败".to_string())?.clone();
    fs::copy(store_path, &path).map_err(|error| error.to_string())?;
    Ok(serde_json::json!({ "success": true, "filePath": path.to_string_lossy() }))
}

#[tauri::command]
async fn import_data_file(
    app: tauri::AppHandle,
    store: State<'_, EncryptedStore>,
) -> Result<serde_json::Value, String> {
    let selected = app
        .dialog()
        .file()
        .set_title("导入程序数据")
        .add_filter("Cyrene Data", &["cyrene"])
        .blocking_pick_file();
    let Some(selected) = selected else {
        return Ok(serde_json::json!({ "success": false, "cancelled": true }));
    };
    let path = selected.into_path().map_err(|error| error.to_string())?;
    let bytes = fs::read(&path).map_err(|error| error.to_string())?;
    store.is_healthy()?;
    let values = core_state::normalize_values(&decrypt_data(&bytes)?, &core_data_key()?)?;
    let old_values = store.values.lock().map_err(|_| "数据锁定失败".to_string())?.clone();
    *store.values.lock().map_err(|_| "数据锁定失败".to_string())? = values;
    if let Err(error) = store.persist() {
        *store.values.lock().map_err(|_| "数据锁定失败".to_string())? = old_values;
        let _ = store.persist();
        return Err(format!("CORE_TRANSACTION_ROLLED_BACK: {}", error));
    }
    Ok(serde_json::json!({ "success": true, "filePath": path.to_string_lossy() }))
}

#[tauri::command]
fn load_names(app: tauri::AppHandle) -> serde_json::Value {
    let resource_dir = get_resource_dir(&app);
    let paths = [
        resource_dir.join("names.json"),
        PathBuf::from("public/names.json"),
        PathBuf::from("dist/names.json"),
    ];
    for p in &paths {
        if let Ok(s) = fs::read_to_string(p) {
            if let Ok(v) = serde_json::from_str(&s) {
                return v;
            }
        }
    }
    serde_json::json!({ "names": [] })
}

#[tauri::command]
fn load_changelog() -> serde_json::Value {
    let raw = include_str!("../../public/updatelogs/up.json");
    serde_json::from_str(raw).unwrap_or(serde_json::json!([]))
}

#[tauri::command]
async fn check_update() -> Result<serde_json::Value, String> {
    let urls = [
        "https://api.github.com/repos/StarCyrene/CyreneNameRoller/releases/latest",
        "https://api.kkgithub.com/repos/StarCyrene/CyreneNameRoller/releases/latest",
    ];
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;
    for url in &urls {
        if let Ok(resp) = client
            .get(*url)
            .header("User-Agent", "CyreneNameRoller")
            .header("Accept", "application/vnd.github.v3+json")
            .send()
            .await
        {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                return Ok(json);
            }
        }
    }
    Err("无法连接到更新服务器".into())
}

#[tauri::command]
fn open_external(url: String) {
    #[cfg(target_os = "windows")]
    {
        let _ = shell_execute("open", OsStr::new(&url), None);
    }
    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("open").arg(&url).spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = Command::new("xdg-open").arg(&url).spawn();
    }
}

// 公告缓存文件路径：写入系统 TEMP（无权限问题，且可离线复用）
fn announcement_cache_path() -> PathBuf {
    let dir = std::env::temp_dir().join("CyreneNameRoller");
    let _ = fs::create_dir_all(&dir);
    dir.join("announcement.json")
}

// 由原生层（Rust reqwest，服务端到服务端，不带浏览器 Origin 头）拉取公告，
// 规避 webview 的跨域拦截。下载到 TEMP 再读回；全部失败则复用本地缓存（离线兜底）。
#[tauri::command]
async fn fetch_announcements() -> Result<serde_json::Value, String> {
    let urls = [
        // 镜像代理（refs/heads/master）—— 你确认可用的主源
        "https://v4.gh-proxy.com/raw.githubusercontent.com/StarCyrene/CyreneNameRoller/refs/heads/master/.announcement/latest.json",
        // 自建 nameapi 镜像
        "https://nameapi.cyrene.hi.cn/announcement/latest.json",
        // 直连 raw.githubusercontent 兜底
        "https://raw.githubusercontent.com/StarCyrene/CyreneNameRoller/master/.announcement/latest.json",
    ];
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    let cache = announcement_cache_path();

    for url in &urls {
        if let Ok(resp) = client
            .get(*url)
            .header("User-Agent", "CyreneNameRoller")
            .send()
            .await
        {
            if resp.status().is_success() {
                if let Ok(bytes) = resp.bytes().await {
                    // 1) 下载到 TEMP 缓存文件
                    let _ = fs::write(&cache, &bytes);
                    // 2) 从磁盘读回并解析
                    if let Ok(s) = fs::read_to_string(&cache) {
                        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&s) {
                            return Ok(v);
                        }
                    }
                }
            }
        }
    }

    // 全部拉取失败：尝试读取之前已缓存的文件（离线兜底）
    if let Ok(s) = fs::read_to_string(&cache) {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&s) {
            return Ok(v);
        }
    }
    Err("无法获取公告内容".into())
}

#[tauri::command]
async fn download_and_launch_update(
    app: tauri::AppHandle,
    url: String,
    file_name: String,
    expected_size: u64,
    source: String,
) -> Result<serde_json::Value, String> {
    let bytes = download_installer_bytes(&app, &url, expected_size, &source).await?;
    let path = installer_temp_path(&file_name)?;
    let partial_path = path.with_extension("exe.part");
    let _ = fs::remove_file(&partial_path);
    fs::write(&partial_path, &bytes).map_err(|error| error.to_string())?;
    let _ = fs::remove_file(&path);
    fs::rename(&partial_path, &path).map_err(|error| error.to_string())?;
    launch_installer(&path).map_err(|error| format!("无法启动安装程序：{}", error))?;

    let exit_handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(1500));
        exit_handle.exit(0);
    });

    Ok(serde_json::json!({
        "success": true,
        "filePath": path.to_string_lossy(),
        "size": bytes.len()
    }))
}

#[tauri::command]
async fn open_floating_window(app: tauri::AppHandle) -> Result<(), String> {
    let size = floating_window_size(&app);
    let (style, radius) = floating_window_style_and_radius(&app);
    if let Some(win) = app.get_webview_window("floating") {
        win.set_title("").map_err(|e| e.to_string())?;
        win.show().map_err(|e| e.to_string())?;
        remove_floating_window_decorations(&win)?;
        set_floating_window_square_size(&win, size)?;
        apply_floating_window_region(&win, &style, radius)?;
        win.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }
    let ((x, y), used_fallback) = resolve_tauri_floating_position(&app, size)?;
    let win = tauri::WebviewWindowBuilder::new(
        &app,
        "floating",
        tauri::WebviewUrl::App("index.html#/floating".into()),
    )
    .always_on_top(true)
    .title("")
    .skip_taskbar(true)
    .decorations(false)
    .shadow(false)
    .resizable(false)
    .transparent(true)
    .inner_size(size as f64, size as f64)
    .min_inner_size(
        MIN_FLOATING_WINDOW_SIZE as f64,
        MIN_FLOATING_WINDOW_SIZE as f64,
    )
    .max_inner_size(
        MAX_FLOATING_WINDOW_SIZE as f64,
        MAX_FLOATING_WINDOW_SIZE as f64,
    )
    .visible(false)
    .build()
    .map_err(|e| e.to_string())?;
    set_floating_window_square_size(&win, size)?;
    win.set_position(PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    win.show().map_err(|e| e.to_string())?;
    remove_floating_window_decorations(&win)?;
    set_floating_window_square_size(&win, size)?;
    win.set_position(PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    apply_floating_window_region(&win, &style, radius)?;
    if used_fallback {
        if let Err(error) = persist_tauri_floating_position(&app, x, y) {
            eprintln!("[floating] failed to persist fallback position: {}", error);
        }
    }
    win.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn close_floating_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("floating") {
        win.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn save_floating_window_position(app: tauri::AppHandle) -> Result<(), String> {
    let win = app
        .get_webview_window("floating")
        .ok_or_else(|| "悬浮窗不可用".to_string())?;
    set_floating_window_square_size(&win, floating_window_size(&app))?;
    let (style, radius) = floating_window_style_and_radius(&app);
    apply_floating_window_region(&win, &style, radius)?;
    let position = win.outer_position().map_err(|error| error.to_string())?;
    persist_tauri_floating_position(&app, position.x, position.y)
}

#[tauri::command]
async fn reset_floating_window_position(app: tauri::AppHandle) -> Result<(), String> {
    if app.get_webview_window("floating").is_none() {
        open_floating_window(app.clone()).await?;
    }
    let win = app
        .get_webview_window("floating")
        .ok_or_else(|| "悬浮窗不可用".to_string())?;
    let previous = win.outer_position().map_err(|error| error.to_string())?;
    let (x, y) = primary_floating_position(&app, floating_window_size(&app))?;
    win.set_position(PhysicalPosition::new(x, y))
        .map_err(|error| error.to_string())?;
    if let Err(error) = persist_tauri_floating_position(&app, x, y) {
        let _ = win.set_position(previous);
        return Err(error);
    }
    win.show().map_err(|error| error.to_string())?;
    win.set_focus().map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
async fn set_floating_window_style(
    app: tauri::AppHandle,
    style: String,
    custom_image: Option<String>,
    radius: Option<f64>,
    text: Option<String>,
    background_color: Option<String>,
    text_color: Option<String>,
    text_size: Option<f64>,
    opacity: Option<f64>,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("floating") {
        apply_floating_window_region(&window, &style, radius)?;
    }
    app.emit_to(
        EventTarget::webview_window("floating"),
        "floating-window-style-changed",
        serde_json::json!({
            "style": style,
            "customImage": custom_image,
            "radius": radius,
            "text": text,
            "backgroundColor": background_color,
            "textColor": text_color,
            "textSize": text_size,
            "opacity": opacity
        }),
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
async fn set_floating_window_size(app: tauri::AppHandle, size: f64) -> Result<i32, String> {
    let size = normalize_floating_window_size(Some(size));
    let Some(win) = app.get_webview_window("floating") else {
        return Ok(size);
    };

    let previous_position = win.outer_position().map_err(|error| error.to_string())?;
    let previous_size = win.outer_size().map_err(|error| error.to_string())?;
    let scale_factor = win.scale_factor().map_err(|error| error.to_string())?;
    let physical_size = (size as f64 * scale_factor).round() as i32;
    let (mut x, mut y) = resize_floating_window_position(
        previous_position.x,
        previous_position.y,
        previous_size.width as i32,
        physical_size,
    );
    let center_x = previous_position
        .x
        .saturating_add(previous_size.width as i32 / 2);
    let center_y = previous_position
        .y
        .saturating_add(previous_size.height as i32 / 2);
    let work_areas = floating_work_areas(&app)?;
    if let Some((work_x, work_y, work_width, work_height, _)) =
        floating_work_area_for_center(&work_areas, center_x, center_y)
    {
        (x, y) = constrain_floating_window_position(
            x,
            y,
            physical_size,
            work_x,
            work_y,
            work_width,
            work_height,
        );
    } else {
        (x, y) = primary_floating_position(&app, size)?;
    }

    set_floating_window_physical_size(&win, physical_size as u32, physical_size as u32)?;
    let (style, radius) = floating_window_style_and_radius(&app);
    if let Err(error) = apply_floating_window_region(&win, &style, radius) {
        let _ = set_floating_window_physical_size(&win, previous_size.width, previous_size.height);
        let _ = win.set_position(previous_position);
        return Err(error);
    }
    if let Err(error) = win.set_position(PhysicalPosition::new(x, y)) {
        let _ = set_floating_window_physical_size(&win, previous_size.width, previous_size.height);
        let _ = win.set_position(previous_position);
        return Err(error.to_string());
    }
    if let Err(error) = persist_tauri_floating_position(&app, x, y) {
        let _ = set_floating_window_physical_size(&win, previous_size.width, previous_size.height);
        let _ = win.set_position(previous_position);
        return Err(error);
    }
    app.emit_to(
        EventTarget::webview_window("floating"),
        "floating-window-size-changed",
        size,
    )
    .map_err(|error| error.to_string())?;
    Ok(size)
}

#[tauri::command]
async fn focus_main_window(app: tauri::AppHandle) -> Result<(), String> {
    request_reveal_main_window(&app)
}

#[tauri::command]
async fn hide_to_tray(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        win.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn reveal_file(path: String) -> bool {
    let path = PathBuf::from(path);
    #[cfg(target_os = "windows")]
    {
        return background_command("explorer")
            .arg("/select,")
            .arg(path)
            .spawn()
            .is_ok();
    }
    #[cfg(target_os = "macos")]
    {
        return Command::new("open")
            .args(["-R", path.to_string_lossy().as_ref()])
            .spawn()
            .is_ok();
    }
    #[cfg(target_os = "linux")]
    {
        return Command::new("xdg-open")
            .arg(path.parent().unwrap_or(Path::new(".")))
            .spawn()
            .is_ok();
    }
}

#[tauri::command]
fn show_data_location(store: State<'_, EncryptedStore>) -> bool {
    store
        .path
        .lock()
        .ok()
        .map(|path| reveal_file(path.to_string_lossy().into_owned()))
        .unwrap_or(false)
}

#[tauri::command]
fn system_accent() -> String {
    #[cfg(target_os = "windows")]
    {
        let queries = [
            (
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Accent",
                "AccentColorMenu",
            ),
            (r"HKCU\Software\Microsoft\Windows\DWM", "AccentColor"),
        ];
        for (key, value_name) in queries {
            if let Ok(output) = background_command("reg")
                .args(["query", key, "/v", value_name])
                .output()
            {
                let text = String::from_utf8_lossy(&output.stdout);
                if let Some(raw) = text.split_whitespace().find(|part| part.starts_with("0x")) {
                    if let Ok(value) = u32::from_str_radix(raw.trim_start_matches("0x"), 16) {
                        let red = value & 0xff;
                        let green = (value >> 8) & 0xff;
                        let blue = (value >> 16) & 0xff;
                        return format!("#{:02x}{:02x}{:02x}", red, green, blue);
                    }
                }
            }
        }
    }
    "#ea5ec1".into()
}

#[cfg(target_os = "windows")]
fn startup_task_action() -> Result<String, String> {
    let executable = std::env::current_exe().map_err(|error| error.to_string())?;
    Ok(format!(
        "\"{}\" --cyrene-autostart",
        executable.to_string_lossy()
    ))
}

#[tauri::command]
fn read_dropped_file(path: String) -> Result<serde_json::Value, String> {
    let path = PathBuf::from(path);
    if !path.is_file() {
        return Err("拖入的路径不是文件".into());
    }
    let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
    if metadata.len() > 64 * 1024 * 1024 {
        return Err("文件过大，最多支持 64 MB".into());
    }
    let bytes = fs::read(&path).map_err(|error| error.to_string())?;
    let name = path
        .file_name()
        .and_then(OsStr::to_str)
        .unwrap_or("import")
        .to_string();
    let extension = path
        .extension()
        .and_then(OsStr::to_str)
        .unwrap_or("")
        .to_ascii_lowercase();
    Ok(serde_json::json!({
        "name": name,
        "extension": extension,
        "path": path.to_string_lossy(),
        "base64": base64::engine::general_purpose::STANDARD.encode(bytes)
    }))
}

#[cfg(target_os = "windows")]
fn startup_registry_action() -> Result<String, String> {
    startup_task_action()
}

fn configure_startup_task(enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        if !enabled {
            let query = background_command("schtasks")
                .args(["/Query", "/TN", STARTUP_TASK_NAME])
                .output()
                .map_err(|error| error.to_string())?;
            if !query.status.success() {
                return Ok(());
            }
        }
        let output = if enabled {
            background_command("schtasks")
                .args([
                    "/Create",
                    "/TN",
                    STARTUP_TASK_NAME,
                    "/TR",
                    &startup_task_action()?,
                    "/SC",
                    "ONLOGON",
                    "/RL",
                    "HIGHEST",
                    "/F",
                ])
                .output()
        } else {
            background_command("schtasks")
                .args(["/Delete", "/TN", STARTUP_TASK_NAME, "/F"])
                .output()
        }
        .map_err(|error| error.to_string())?;
        if output.status.success() {
            return Ok(());
        }
        let error = String::from_utf8_lossy(if output.stderr.is_empty() {
            &output.stdout
        } else {
            &output.stderr
        });
        return Err(error.trim().to_string());
    }
    #[cfg(target_os = "linux")]
    {
        let _ = enabled;
        Ok(())
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    Err("管理员计划任务仅支持 Windows".into())
}

fn configure_registry_startup(enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        if !enabled {
            let query = background_command("reg")
                .args([
                    "query",
                    r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                    "/v",
                    STARTUP_REGISTRY_VALUE,
                ])
                .output()
                .map_err(|error| error.to_string())?;
            if !query.status.success() {
                return Ok(());
            }
        }
        let mut command = background_command("reg");
        command.args([
            if enabled { "add" } else { "delete" },
            r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
            "/v",
            STARTUP_REGISTRY_VALUE,
        ]);
        if enabled {
            command.args(["/t", "REG_SZ", "/d", &startup_registry_action()?, "/f"]);
        } else {
            command.arg("/f");
        }
        let output = command.output().map_err(|error| error.to_string())?;
        if output.status.success() {
            return Ok(());
        }
        let error = String::from_utf8_lossy(if output.stderr.is_empty() {
            &output.stdout
        } else {
            &output.stderr
        });
        return Err(error.trim().to_string());
    }
    #[cfg(target_os = "linux")]
    {
        let _ = enabled;
        Ok(())
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    Err("传统启动项当前仅支持 Windows".into())
}

fn configure_auto_start(enabled: bool, mode: &str, previous_mode: &str) -> Result<(), String> {
    if !enabled {
        if mode == "scheduled" || previous_mode == "scheduled" {
            configure_startup_task(false)?;
        }
        configure_registry_startup(false)?;
        return Ok(());
    }
    match mode {
        "scheduled" => {
            configure_registry_startup(false)?;
            configure_startup_task(true)
        }
        "registry" => {
            if previous_mode == "scheduled" {
                configure_startup_task(false)?;
            }
            configure_registry_startup(true)
        }
        _ => Err("未知的开机启动方式".into()),
    }
}

fn process_is_elevated() -> bool {
    #[cfg(target_os = "windows")]
    {
        return unsafe { IsUserAnAdmin() != 0 };
    }
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

fn home_dir() -> PathBuf {
    if cfg!(target_os = "windows") {
        PathBuf::from(std::env::var("USERPROFILE").unwrap_or_else(|_| "C:\\Users\\Public".into()))
    } else {
        PathBuf::from(std::env::var("HOME").unwrap_or_else(|_| "/tmp".into()))
    }
}

fn autostart_desktop_path() -> PathBuf {
    home_dir().join(".config").join("autostart").join("cyrene-name-roller.desktop")
}

fn autostart_desktop_content(executable: &str) -> String {
    format!(
        "[Desktop Entry]\nType=Application\nName=Cyreneの随机点名器\nExec=\"{}\" --cyrene-autostart\nIcon=cyrene-name-roller\nTerminal=false\nX-GNOME-Autostart-enabled=true\n",
        executable
    )
}

#[cfg(target_os = "linux")]
fn configure_autostart_desktop_entry(enabled: bool) -> Result<(), String> {
    let path = autostart_desktop_path();
    if !enabled {
        if path.exists() {
            fs::remove_file(&path).map_err(|error| error.to_string())?;
        }
        return Ok(());
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let executable = std::env::current_exe().map_err(|error| error.to_string())?;
    fs::write(&path, autostart_desktop_content(&executable.to_string_lossy())).map_err(|error| error.to_string())?;
    Ok(())
}

fn linux_applications_dir() -> PathBuf {
    home_dir().join(".local").join("share").join("applications")
}

fn uri_desktop_path() -> PathBuf {
    linux_applications_dir().join("cyrene-name-roller-uri.desktop")
}

fn uri_desktop_content(executable: &str) -> String {
    format!(
        "[Desktop Entry]\nType=Application\nName=Cyreneの随机点名器 (URI Handler)\nExec=\"{}\" \"%1\"\nIcon=cyrene-name-roller\nTerminal=false\nNoDisplay=true\nMimeType=x-scheme-handler/{};\n",
        executable, URI_SCHEME
    )
}

#[cfg(target_os = "linux")]
fn configure_uri_desktop_entry(enabled: bool) -> Result<(), String> {
    let path = uri_desktop_path();
    if !enabled {
        if path.exists() {
            fs::remove_file(&path).map_err(|error| error.to_string())?;
        }
        return Ok(());
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let executable = std::env::current_exe().map_err(|error| error.to_string())?;
    fs::write(&path, uri_desktop_content(&executable.to_string_lossy())).map_err(|error| error.to_string())?;

    let _ = background_command("update-desktop-database")
        .arg(linux_applications_dir())
        .status();
    let _ = background_command("xdg-mime")
        .args(["default", &path.to_string_lossy(), &format!("x-scheme-handler/{}", URI_SCHEME)])
        .status();
    Ok(())
}

#[tauri::command]
fn is_process_elevated() -> bool {
    process_is_elevated()
}

#[tauri::command]
async fn set_auto_start(
    enabled: bool,
    mode: String,
    previous_mode: String,
) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "windows")]
    {
        let needs_scheduled_privilege = mode == "scheduled"
            || previous_mode == "scheduled" && (!enabled || mode != previous_mode);
        if needs_scheduled_privilege && !process_is_elevated() {
            return Ok(serde_json::json!({
                "success": false,
                "requiresElevation": true,
                "error": "需要管理员权限修改计划任务"
            }));
        }
        tauri::async_runtime::spawn_blocking(move || {
            configure_auto_start(enabled, &mode, &previous_mode)
        })
        .await
        .map_err(|error| error.to_string())??;
        return Ok(serde_json::json!({ "success": true, "restarting": false }));
    }
    #[cfg(target_os = "linux")]
    {
        let _ = previous_mode;
        tauri::async_runtime::spawn_blocking(move || configure_autostart_desktop_entry(enabled))
            .await
            .map_err(|error| error.to_string())??;
        return Ok(serde_json::json!({ "success": true, "restarting": false }));
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    Ok(serde_json::json!({ "success": false, "error": "当前系统暂不支持开机启动设置" }))
}

#[tauri::command]
fn restart_elevated_for_auto_start(
    enabled: bool,
    mode: String,
    previous_mode: String,
) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "windows")]
    {
        if mode != "scheduled" && mode != "registry" {
            return Err("未知的开机启动方式".into());
        }
        let executable = std::env::current_exe().map_err(|error| error.to_string())?;
        let parameters = format!(
            "--cyrene-configure-autostart={} --cyrene-autostart-mode={} --cyrene-previous-autostart-mode={} --cyrene-replace-pid={}",
            if enabled { "enable" } else { "disable" },
            mode,
            previous_mode,
            std::process::id()
        );
        if let Err(error) = shell_execute("runas", executable.as_os_str(), Some(&parameters)) {
            return Ok(serde_json::json!({ "success": false, "error": error }));
        }
        return Ok(serde_json::json!({ "success": true, "restarting": true }));
    }
    #[cfg(not(target_os = "windows"))]
    Ok(serde_json::json!({ "success": false, "error": "管理员计划任务仅支持 Windows" }))
}

#[tauri::command]
fn is_autostart_launch() -> bool {
    std::env::args().any(|arg| arg == "--cyrene-autostart")
}

#[tauri::command]
fn set_uri_scheme_enabled(enabled: bool) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "windows")]
    {
        let key = format!(r"HKCU\Software\Classes\{}", URI_SCHEME);
        if enabled {
            let executable = std::env::current_exe().map_err(|error| error.to_string())?;
            let executable = executable.to_string_lossy().to_string();
            let registrations = [
                (key.clone(), None, format!("URL:{} protocol", URI_SCHEME)),
                (key.clone(), Some("URL Protocol"), String::new()),
                (
                    format!(r"{}\DefaultIcon", key),
                    None,
                    format!("\"{}\",0", executable),
                ),
                (
                    format!(r"{}\shell\open\command", key),
                    None,
                    format!("\"{}\" \"%1\"", executable),
                ),
            ];
            for (path, name, value) in registrations {
                let mut command = background_command("reg");
                command.args(["add", &path]);
                if let Some(name) = name {
                    command.args(["/v", name]);
                } else {
                    command.arg("/ve");
                }
                let output = command
                    .args(["/t", "REG_SZ", "/d", &value, "/f"])
                    .output()
                    .map_err(|error| error.to_string())?;
                if !output.status.success() {
                    let error = String::from_utf8_lossy(if output.stderr.is_empty() {
                        &output.stdout
                    } else {
                        &output.stderr
                    });
                    return Err(error.trim().to_string());
                }
            }
        } else {
            let query = background_command("reg")
                .args(["query", &key])
                .output()
                .map_err(|error| error.to_string())?;
            if !query.status.success() {
                return Ok(serde_json::json!({ "success": true, "enabled": false }));
            }
            let output = background_command("reg")
                .args(["delete", &key, "/f"])
                .output()
                .map_err(|error| error.to_string())?;
            if !output.status.success() {
                let error = String::from_utf8_lossy(if output.stderr.is_empty() {
                    &output.stdout
                } else {
                    &output.stderr
                });
                return Err(error.trim().to_string());
            }
        }
        return Ok(serde_json::json!({ "success": true, "enabled": enabled }));
    }
    #[cfg(target_os = "linux")]
    {
        configure_uri_desktop_entry(enabled)?;
        return Ok(serde_json::json!({ "success": true, "enabled": enabled }));
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    Ok(serde_json::json!({
        "success": false,
        "enabled": false,
        "error": "当前系统暂不支持 URI 协议注册"
    }))
}

#[tauri::command]
fn is_uri_scheme_enabled() -> bool {
    #[cfg(target_os = "windows")]
    {
        let key = format!(r"HKCU\Software\Classes\{}\shell\open\command", URI_SCHEME);
        let Ok(output) = background_command("reg")
            .args(["query", &key, "/ve"])
            .output()
        else {
            return false;
        };
        if !output.status.success() {
            return false;
        }
        let executable = std::env::current_exe()
            .ok()
            .map(|path| path.to_string_lossy().to_ascii_lowercase());
        let output = String::from_utf8_lossy(&output.stdout).to_ascii_lowercase();
        executable.is_some_and(|path| output.contains(&path))
    }
    #[cfg(target_os = "linux")]
    {
        let path = uri_desktop_path();
        let Ok(content) = fs::read_to_string(&path) else {
            return false;
        };
        content.contains("MimeType=x-scheme-handler/cyrenenr;")
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    false
}

#[tauri::command]
async fn show_main_window(app: tauri::AppHandle) -> Result<(), String> {
    app.state::<MainWindowRevealState>()
        .pending
        .store(false, Ordering::Release);
    show_main_window_now(&app)
}

#[tauri::command]
fn main_window_ready(app: tauri::AppHandle) -> Result<bool, String> {
    let state = app.state::<MainWindowRevealState>();
    state.frontend_ready.store(true, Ordering::Release);
    if state.pending.load(Ordering::Acquire) {
        app.emit("main-window-show-requested", ())
            .map_err(|error| error.to_string())?;
    }
    let uri_state = app.state::<UriRequestState>();
    uri_state.frontend_ready.store(true, Ordering::Release);
    let pending = std::mem::take(
        &mut *uri_state
            .pending
            .lock()
            .map_err(|_| "URI 请求队列锁定失败".to_string())?,
    );
    let had_pending_uri = !pending.is_empty();
    for uri in pending {
        app.emit("uri-open-requested", uri)
            .map_err(|error| error.to_string())?;
    }
    Ok(had_pending_uri)
}

fn show_main_window_now(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.unminimize().map_err(|error| error.to_string())?;
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn request_reveal_main_window(app: &tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<MainWindowRevealState>();
    state.pending.store(true, Ordering::Release);
    if state.frontend_ready.load(Ordering::Acquire) {
        app.emit("main-window-show-requested", ())
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

// 构建系统托盘：左键无菜单，右键弹出“显示主窗口 / 退出”
fn create_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let show = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    let _tray = TrayIconBuilder::with_id("main-tray")
        .icon(app.default_window_icon().cloned().unwrap())
        .tooltip("Cyreneの随机点名器")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            // 左键单击托盘图标：直接显示主界面
            if let tauri::tray::TrayIconEvent::Click {
                button,
                button_state,
                ..
            } = event
            {
                if button == tauri::tray::MouseButton::Left
                    && button_state == tauri::tray::MouseButtonState::Up
                {
                    let _ = request_reveal_main_window(tray.app_handle());
                }
            }
        })
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                let _ = request_reveal_main_window(app);
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let arguments: Vec<String> = std::env::args().collect();
    let launch_uri = launch_uri_from_arguments(&arguments);
    let replacing_instance = arguments
        .iter()
        .any(|argument| argument.starts_with("--cyrene-replace-pid="));
    if let Some(configuration) = arguments
        .iter()
        .find(|argument| argument.starts_with("--cyrene-configure-autostart="))
    {
        let mode = arguments
            .iter()
            .find_map(|argument| argument.strip_prefix("--cyrene-autostart-mode="))
            .unwrap_or("scheduled");
        let previous_mode = arguments
            .iter()
            .find_map(|argument| argument.strip_prefix("--cyrene-previous-autostart-mode="))
            .unwrap_or(mode);
        if let Err(error) =
            configure_auto_start(configuration.ends_with("=enable"), mode, previous_mode)
        {
            eprintln!("[startup-task] {}", error);
            std::process::exit(2);
        }
        if replacing_instance {
            let _ = request_existing_instance_exit();
        }
    }
    let instance_listener = acquire_instance_listener(replacing_instance, launch_uri.as_deref());
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            let safe_mode_path = app.path().app_config_dir()?.join("safemode.json");
            app.manage(SafeModeState { status: Mutex::new(read_safe_mode_status(&safe_mode_path)) });
            let app_data_dir = app.path().app_data_dir()?;
            let data_path = configured_data_path(&app_data_dir, &installation_dir());
            let encrypted_store = EncryptedStore::load(data_path);
            let core_readonly = encrypted_store.is_healthy().is_err()
                || core_data_key().and_then(|key| encrypted_store.values.lock().map_err(|_| "CORE_INTEGRITY_CHECK_FAILED".to_string()).and_then(|values| core_state::parse(&values, &key).map(|_| ()))).is_err();
            app.manage(CoreAuthorityState::new(core_readonly));
            app.manage(encrypted_store);
            app.manage(MainWindowRevealState::new());
            app.manage(UriRequestState::new());
            let handle = app.handle().clone();
            start_instance_listener(instance_listener, handle.clone());
            if let Some(uri) = launch_uri.clone() {
                let _ = request_open_uri(&handle, uri);
            }
            migrate_legacy_data(&handle);
            restore_window_state(&handle);
            // 开机自启动（--cyrene-autostart）时保持隐藏，由前端根据「启动到托盘」设置决定是否显示；
            // 其余启动（含 Linux 兼容）直接显示主窗口。
            let autostart_launch = std::env::args().any(|arg| arg == "--cyrene-autostart");
            if let Some(window) = app.get_webview_window("main") {
                if !autostart_launch {
                    let _ = window.show();
                }
            }
            create_tray(app)?;

            if let Some(window) = app.get_webview_window("main") {
                let win = window.clone();
                let save_revision = Arc::new(AtomicU64::new(0));
                window.on_window_event(move |event| match event {
                    tauri::WindowEvent::CloseRequested { api, .. } => {
                        // 关闭时最小化到托盘，不退出进程（后台常驻）
                        api.prevent_close();
                        save_window_state(&handle);
                        let _ = win.hide();
                    }
                    tauri::WindowEvent::Resized(_) => {
                        let revision = save_revision.fetch_add(1, Ordering::Relaxed) + 1;
                        let revision_state = save_revision.clone();
                        let save_handle = handle.clone();
                        std::thread::spawn(move || {
                            std::thread::sleep(std::time::Duration::from_millis(350));
                            if revision_state.load(Ordering::Relaxed) == revision {
                                save_window_state(&save_handle);
                            }
                        });
                    }
                    _ => {}
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            storage_get,
            storage_set,
            storage_delete,
            storage_clear,
            safe_mode_status,
            portable_mode_status,
            set_portable_mode,
            core_grant_token,
            core_revoke_principal,
            core_state_set,
            core_draw_execute,
            core_card_commit,
            core_maintenance_execute,
            export_encrypted_data,
            import_encrypted_data,
            export_data_file,
            import_data_file,
            save_text_file,
            open_text_file,
            plugin_select_file,
            plugin_select_directory,
            plugin_execute_operation,
            read_dropped_file,
            load_names,
            load_changelog,
            check_update,
            open_external,
            show_data_location,
            reveal_file,
            system_accent,
            set_uri_scheme_enabled,
            is_uri_scheme_enabled,
            set_auto_start,
            restart_elevated_for_auto_start,
            is_process_elevated,
            is_autostart_launch,
            fetch_announcements,
            download_and_launch_update,
            open_floating_window,
            close_floating_window,
            save_floating_window_position,
            reset_floating_window_position,
            set_floating_window_style,
            set_floating_window_size,
            focus_main_window,
            hide_to_tray,
            main_window_ready,
            show_main_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{
        apply_core_maintenance, apply_core_state_update, center_floating_window, clear_non_core_values, constrain_floating_window_position,
        floating_window_position_visible, floating_window_region_geometry, is_cyrene_uri,
        launch_uri_from_arguments,
        normalize_floating_window_size, read_safe_mode_status, resize_floating_window_position,
        configured_data_path, core_data_key_for, data_key, data_path_for_mode, is_core_storage_key,
        portable_marker_path, valid_core_principal,
        validate_core_card_caller, validate_core_caller, validate_core_maintenance_request,
        CoreMaintenanceRequest, EncryptedStore, RustCardCommitRequest, RustCardInput,
        RustDrawInput, RustDrawRequest,
    };
    use serde_json::json;

    #[test]
    fn portable_marker_selects_installation_data_path() {
        let root = std::env::temp_dir().join(format!("cyrene-portable-{}", std::process::id()));
        let app_data = root.join("app-data");
        let installation = root.join("installation");
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&installation).unwrap();

        assert_eq!(
            configured_data_path(&app_data, &installation),
            data_path_for_mode(&app_data, &installation, false)
        );
        std::fs::write(portable_marker_path(&installation), b"portable\n").unwrap();
        assert_eq!(
            configured_data_path(&app_data, &installation),
            data_path_for_mode(&app_data, &installation, true)
        );
        let _ = std::fs::remove_dir_all(root);
    }

    #[cfg(target_os = "windows")]
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        WS_CAPTION, WS_MAXIMIZEBOX, WS_MINIMIZEBOX, WS_SYSMENU, WS_THICKFRAME,
    };

    fn maintenance_values(key: &[u8; 32]) -> serde_json::Value {
        let mut values = json!({
            "lists": {
                "list-1": {
                    "id": "list-1",
                    "names": [
                        { "id": "person-1", "cn": "A", "isWhiteList": false },
                        { "id": "person-2", "cn": "B", "isWhiteList": false },
                        { "id": "person-3", "cn": "C", "isWhiteList": false },
                        { "id": "person-4", "cn": "D", "isWhiteList": true }
                    ]
                }
            },
            "currentListId": "list-1",
            "balance": { "enabled": false, "algorithm": super::core_state::ALGORITHM_NAME },
            "statistics": { "counts": { "person-1": 2, "person-2": 6 }, "totalCount": 8 },
            "records": [{ "operationId": "old-operation" }],
            "pluginState": { "enabled": true }
        });
        let envelope = super::core_state::seal(super::core_state::genesis(&values), key).unwrap();
        values[super::core_state::CORE_STATE_KEY] = super::core_state::to_value(&envelope).unwrap();
        values
    }

    fn maintenance_request(action: &str) -> CoreMaintenanceRequest {
        CoreMaintenanceRequest {
            grant_token: "secret".into(),
            principal: "core-ui".into(),
            action: action.into(),
            list_id: String::new(),
            person_id: String::new(),
            mode: String::new(),
        }
    }

    #[test]
    fn uri_arguments_only_accept_the_cyrene_scheme() {
        let arguments = vec![
            "CyreneNameRoller.exe".to_string(),
            "cyrenenr://page/roller?count=6".to_string(),
        ];
        assert_eq!(
            launch_uri_from_arguments(&arguments).as_deref(),
            Some("cyrenenr://page/roller?count=6")
        );
        assert!(is_cyrene_uri("CYRENENR://start"));
        assert!(!is_cyrene_uri("https://example.com"));
        assert!(!is_cyrene_uri("cyrenenr:/start"));
    }

    #[test]
    fn floating_window_size_normalizes_to_supported_steps() {
        assert_eq!(normalize_floating_window_size(None), 64);
        assert_eq!(normalize_floating_window_size(Some(20.0)), 40);
        assert_eq!(normalize_floating_window_size(Some(66.0)), 68);
        assert_eq!(normalize_floating_window_size(Some(200.0)), 200);
        assert_eq!(normalize_floating_window_size(Some(300.0)), 256);
    }

    #[test]
    fn floating_window_centers_in_offset_work_area() {
        assert_eq!(
            center_floating_window(1920, 40, 1920, 1040, 1.0, 64),
            (2848, 528)
        );
    }

    #[test]
    fn floating_window_centers_logical_size_at_high_dpi() {
        assert_eq!(
            center_floating_window(0, 0, 1920, 1080, 1.5, 64),
            (912, 492)
        );
    }

    #[test]
    fn floating_window_accepts_positive_overlap() {
        assert!(floating_window_position_visible(
            1919,
            100,
            &[(0, 0, 1920, 1080, 1.0)],
            64
        ));
    }

    #[test]
    fn floating_window_rejects_off_screen_position() {
        assert!(!floating_window_position_visible(
            3000,
            100,
            &[(0, 0, 1920, 1080, 1.0)],
            64
        ));
    }

    #[test]
    fn floating_window_centers_requested_logical_size() {
        assert_eq!(
            center_floating_window(0, 0, 1920, 1080, 1.0, 128),
            (896, 476)
        );
    }

    #[test]
    fn floating_window_visibility_uses_requested_logical_size() {
        assert!(floating_window_position_visible(
            -100,
            100,
            &[(-0, 0, 1920, 1080, 1.0)],
            128
        ));
        assert!(!floating_window_position_visible(
            -100,
            100,
            &[(0, 0, 1920, 1080, 1.0)],
            40
        ));
    }

    #[test]
    fn floating_window_resizes_around_physical_center() {
        assert_eq!(
            resize_floating_window_position(100, 200, 64, 128),
            (68, 168)
        );
        assert_eq!(
            resize_floating_window_position(68, 168, 128, 40),
            (112, 212)
        );
    }

    #[test]
    fn floating_window_constrains_into_physical_work_area() {
        assert_eq!(
            constrain_floating_window_position(-20, 1070, 128, 0, 40, 1920, 1040),
            (0, 952)
        );
    }

    #[test]
    fn floating_window_region_matches_centered_ball_inside_rectangular_webview() {
        assert_eq!(floating_window_region_geometry(96, 64, 50, 1), (15, -1, 81, 65, 66));
        assert_eq!(floating_window_region_geometry(96, 64, 0, 2), (16, 0, 80, 64, 0));
        assert_eq!(floating_window_region_geometry(64, 96, 24, 2), (-2, 14, 66, 82, 35));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn floating_window_native_style_removes_caption_controls() {
        let decorated =
            (WS_CAPTION | WS_THICKFRAME | WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_SYSMENU) as isize;
        assert_eq!(super::floating_window_undecorated_style(decorated), 0);
    }

    #[test]
    fn core_principal_is_bound_to_caller_kind_and_plugin_id() {
        assert!(valid_core_principal("core-ui"));
        assert!(valid_core_principal("plugin:cn.example.test"));
        assert!(!valid_core_principal("plugin:"));
        assert!(!valid_core_principal("plugin:bad id"));

        let input = RustDrawInput { list_id: "list-1".into(), target: "people".into(), count: 1, allow_duplicates: false, gender: "all".into() };
        let plugin = RustDrawRequest {
            grant_token: "secret".into(),
            principal: "plugin:cn.example.test".into(),
            caller_kind: "plugin".into(),
            plugin_id: "cn.example.test".into(),
            operation_id: "op-1".into(),
            count_statistics: true,
            input,
        };
        assert!(validate_core_caller(&plugin).is_ok());
        let spoofed = RustDrawRequest { plugin_id: "cn.example.other".into(), ..plugin };
        assert_eq!(validate_core_caller(&spoofed).unwrap_err(), "PLUGIN_PERMISSION_DENIED");

        let card = RustCardCommitRequest {
            grant_token: "secret".into(),
            principal: "core-ui".into(),
            caller_kind: "core-ui".into(),
            plugin_id: "core".into(),
            operation_id: "card-1".into(),
            input: RustCardInput { list_id: "list-1".into(), person_ids: vec!["person-1".into()] },
        };
        assert!(validate_core_card_caller(&card).is_ok());
        let spoofed_card = RustCardCommitRequest { caller_kind: "plugin".into(), ..card };
        assert_eq!(validate_core_card_caller(&spoofed_card).unwrap_err(), "PLUGIN_PERMISSION_DENIED");

        let maintenance = CoreMaintenanceRequest {
            grant_token: "secret".into(),
            principal: "core-ui".into(),
            action: "clear-records".into(),
            list_id: String::new(),
            person_id: String::new(),
            mode: String::new(),
        };
        assert!(validate_core_maintenance_request(&maintenance).is_ok());
        let invalid_maintenance = CoreMaintenanceRequest { action: "replace-records".into(), ..maintenance };
        assert_eq!(validate_core_maintenance_request(&invalid_maintenance).unwrap_err(), "CORE_TRANSACTION_REJECTED");
        let initialize_person = CoreMaintenanceRequest {
            grant_token: "secret".into(),
            principal: "core-ui".into(),
            action: "initialize-person-count".into(),
            list_id: "list-1".into(),
            person_id: "person-1".into(),
            mode: "midpoint".into(),
        };
        assert!(validate_core_maintenance_request(&initialize_person).is_ok());
    }

    #[test]
    fn core_state_updates_are_authenticated_and_generic_clear_preserves_them() {
        let key = data_key();
        let envelope = super::core_state::seal(super::core_state::genesis(&json!({
            "lists": { "list-1": { "id": "list-1", "names": [] } },
            "currentListId": "list-1",
            "statistics": { "counts": { "person-1": 2 }, "totalCount": 2 },
            "records": [{ "operationId": "op-1" }]
        })), &key).unwrap();
        let mut values = json!({
            super::core_state::CORE_STATE_KEY: envelope,
            "statistics": { "counts": { "tampered": 99 }, "totalCount": 99 },
            "records": [],
            "pluginState": { "enabled": true }
        });
        values = apply_core_state_update(&values, "balance", json!({ "enabled": false, "algorithm": super::core_state::ALGORITHM_NAME }), &key).unwrap();
        let verified = super::core_state::parse(&values, &key).unwrap();
        assert_eq!(verified.state.balance["enabled"], false);
        assert_eq!(values["statistics"], verified.state.statistics);
        assert_eq!(values["records"], verified.state.records);
        assert!(apply_core_state_update(&values, "balance", json!({ "enabled": false, "weight": 2 }), &key).is_err());

        assert!(is_core_storage_key("lists"));
        assert!(is_core_storage_key("balance"));
        assert!(is_core_storage_key("statistics"));
        assert!(clear_non_core_values(&mut values));
        assert!(values.get("pluginState").is_none());
        assert!(values.get(super::core_state::CORE_STATE_KEY).is_some());
        assert!(values.get("statistics").is_some());
        assert!(values.get("records").is_some());
    }

    #[test]
    fn maintenance_clear_records_preserves_names_statistics_and_non_core_values() {
        let key = data_key();
        let old_values = maintenance_values(&key);
        let request = maintenance_request("clear-records");
        let (next_values, response) = apply_core_maintenance(&old_values, &request, &key, 1234).unwrap();
        let envelope = super::core_state::parse(&next_values, &key).unwrap();

        assert_eq!(response["receipt"]["action"], "clear-records");
        assert_eq!(response["receipt"]["committedAt"], 1234);
        assert_eq!(response["sequence"], 1);
        assert_eq!(next_values["statistics"], old_values["statistics"]);
        assert_eq!(next_values["lists"], old_values["lists"]);
        assert_eq!(next_values["pluginState"], old_values["pluginState"]);
        assert_eq!(next_values["records"], json!([]));
        assert_eq!(envelope.state.statistics, next_values["statistics"]);
        assert_eq!(envelope.state.records, next_values["records"]);
    }

    #[test]
    fn maintenance_initializes_person_count_inside_authenticated_state() {
        let key = data_key();
        let old_values = maintenance_values(&key);
        let mut request = maintenance_request("initialize-person-count");
        request.list_id = "list-1".into();
        request.person_id = "person-3".into();
        request.mode = "midpoint".into();
        let (next_values, response) = apply_core_maintenance(&old_values, &request, &key, 1234).unwrap();
        let envelope = super::core_state::parse(&next_values, &key).unwrap();

        assert_eq!(response["statistics"]["counts"]["person-3"], 4);
        assert_eq!(response["statistics"]["totalCount"], 12);
        assert_eq!(response["records"], old_values["records"]);
        assert_eq!(envelope.state.statistics, response["statistics"]);

        request.person_id = "person-4".into();
        assert_eq!(apply_core_maintenance(&old_values, &request, &key, 1234).unwrap_err(), "CORE_TRANSACTION_REJECTED");
    }

    #[test]
    fn maintenance_reset_all_replaces_complete_core_state_and_removes_non_core_values() {
        let key = data_key();
        let old_values = maintenance_values(&key);
        let request = maintenance_request("reset-all");
        let (next_values, response) = apply_core_maintenance(&old_values, &request, &key, 1234).unwrap();
        let envelope = super::core_state::parse(&next_values, &key).unwrap();

        assert!(next_values.get("pluginState").is_none());
        assert_eq!(next_values["currentListId"], "default");
        assert_eq!(next_values["lists"], json!({}));
        assert_eq!(next_values["statistics"], json!({ "counts": {}, "totalCount": 0 }));
        assert_eq!(next_values["records"], json!([]));
        assert_eq!(next_values["balance"], json!({ "enabled": true, "algorithm": super::core_state::ALGORITHM_NAME }));
        assert_eq!(response["sequence"], 1);
        assert_eq!(envelope.state.names, json!({ "currentListId": "default", "lists": {} }));
        assert_eq!(envelope.state.statistics, next_values["statistics"]);
        assert_eq!(envelope.state.records, next_values["records"]);
        assert_eq!(envelope.state.previous_hash.len(), 64);
        assert_eq!(envelope.state.receipt_hash.len(), 64);
    }

    #[test]
    fn tauri_safe_mode_uses_enable_and_fails_closed_for_invalid_config() {
        let directory = std::env::temp_dir().join(format!("cyrene-safe-mode-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&directory);
        let path = directory.join("safemode.json");
        let missing = read_safe_mode_status(&path);
        assert_eq!(missing["enabled"], false);
        assert_eq!(serde_json::from_str::<serde_json::Value>(&std::fs::read_to_string(&path).unwrap()).unwrap(), json!({ "enable": false }));

        std::fs::write(&path, r#"{"enable":true}"#).unwrap();
        assert_eq!(read_safe_mode_status(&path)["enabled"], true);
        std::fs::write(&path, r#"{"enabled":false}"#).unwrap();
        let invalid = read_safe_mode_status(&path);
        assert_eq!(invalid["enabled"], true);
        assert_eq!(invalid["errorCode"], "SAFE_MODE_CONFIG_INVALID");
        let _ = std::fs::remove_dir_all(directory);
    }

    #[test]
    fn encrypted_store_faults_recover_complete_old_or_new_core_state() {
        let directory = std::env::temp_dir().join(format!("cyrene-core-recovery-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&directory);
        std::fs::create_dir_all(&directory).unwrap();
        let path = directory.join("core.cyrene");
        let store = EncryptedStore::load(path.clone());
        let key = data_key();
        let old = super::core_state::seal(super::core_state::genesis(&serde_json::json!({})), &key).unwrap();
        let mut new = old.clone();
        new.state.sequence = 1;
        new.state.previous_hash = "a".repeat(64);
        new.state.receipt_hash = "b".repeat(64);
        new = super::core_state::seal(new, &key).unwrap();
        for stage in ["temporary-write", "temporary-sync", "backup", "replace"] {
            let _ = std::fs::remove_file(path.with_extension("cyrene.tmp"));
            let _ = std::fs::remove_file(path.with_extension("cyrene.bak"));
            *store.values.lock().unwrap() = serde_json::json!({ super::core_state::CORE_STATE_KEY: old.clone() });
            store.persist().unwrap();
            *store.values.lock().unwrap() = serde_json::json!({ super::core_state::CORE_STATE_KEY: new.clone() });
            assert!(store.persist_with_fault(Some(stage)).is_err());
            let recovered = EncryptedStore::load(path.clone());
            let values = recovered.values.lock().unwrap().clone();
            let envelope = super::core_state::parse(&values, &key).unwrap();
            let recovered_value = super::core_state::to_value(&envelope).unwrap();
            let old_value = super::core_state::to_value(&old).unwrap();
            let new_value = super::core_state::to_value(&new).unwrap();
            assert!(recovered_value == old_value || recovered_value == new_value, "{}", stage);
        }
        let _ = std::fs::remove_dir_all(directory);
    }

    #[test]
    fn unavailable_core_key_enters_explicit_recovery_error() {
        assert_eq!(core_data_key_for(true).unwrap_err(), "CORE_INTEGRITY_KEY_UNAVAILABLE");
        assert!(core_data_key_for(false).is_ok());
    }
}

fn core_data_key_for(disabled: bool) -> Result<[u8; 32], String> {
    if disabled { Err("CORE_INTEGRITY_KEY_UNAVAILABLE".into()) } else { Ok(data_key()) }
}

fn core_data_key() -> Result<[u8; 32], String> {
    core_data_key_for(std::env::var("CYRENE_CORE_KEY_UNAVAILABLE").as_deref() == Ok("1"))
}

use base64::Engine;
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

type HmacSha256 = Hmac<Sha256>;

pub const CORE_STATE_KEY: &str = "coreStateEnvelope";
pub const CORE_SCHEMA_VERSION: u32 = 1;
pub const ALGORITHM_NAME: &str = "cyrenenameroller-balance/v3";
pub const ALGORITHM_VERSION: &str = "3.1.1";

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoreState {
    pub schema_version: u32,
    pub sequence: u64,
    pub previous_hash: String,
    pub receipt_hash: String,
    pub algorithm: String,
    pub algorithm_version: String,
    pub names: Value,
    pub balance: Value,
    pub statistics: Value,
    pub records: Value,
    #[serde(default = "default_prizes")]
    pub prizes: Value,
}

fn default_prizes() -> Value { json!({ "lists": {}, "currentId": "default", "records": [] }) }

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoreStateEnvelope {
    pub schema_version: u32,
    pub state: CoreState,
    /// 完整 state（含 prizes）的 MAC：与 a7c8c20 之后的已发布版本一致，保证回退后仍可校验。
    pub state_mac: String,
    /// 冗余完整 MAC；旧版本 serde 会忽略未知字段。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub state_mac_full: Option<String>,
}

fn canonical<T: Serialize>(value: &T) -> Result<Vec<u8>, String> {
    serde_json::to_vec(value).map_err(|error| error.to_string())
}

pub fn state_mac(state: &CoreState, key: &[u8; 32]) -> Result<String, String> {
    let mut mac = HmacSha256::new_from_slice(key).map_err(|error| error.to_string())?;
    mac.update(&canonical(state)?);
    Ok(base64::engine::general_purpose::STANDARD_NO_PAD.encode(mac.finalize().into_bytes()))
}

fn mac_equals(expected_b64: &str, actual_b64: &str, key: &[u8; 32], payload: &[u8]) -> bool {
    let (Ok(expected), Ok(actual)) = (
        base64::engine::general_purpose::STANDARD_NO_PAD.decode(expected_b64),
        base64::engine::general_purpose::STANDARD_NO_PAD.decode(actual_b64),
    ) else {
        return false;
    };
    if expected.len() != actual.len() {
        return false;
    }
    let Ok(mut mac) = HmacSha256::new_from_slice(key) else {
        return false;
    };
    mac.update(payload);
    mac.verify_slice(&actual).is_ok()
}

pub fn verify(envelope: &CoreStateEnvelope, key: &[u8; 32]) -> Result<(), String> {
    if envelope.schema_version != CORE_SCHEMA_VERSION
        || envelope.state.schema_version != CORE_SCHEMA_VERSION
        || envelope.state.algorithm_version != ALGORITHM_VERSION
    {
        return Err("CORE_INTEGRITY_CHECK_FAILED".into());
    }
    let full_payload = canonical(&envelope.state)?;
    let expected_full = state_mac(&envelope.state, key)?;
    // 1) 完整 MAC（含 prizes）—— 当前主格式
    if mac_equals(&expected_full, &envelope.state_mac, key, &full_payload) {
        return Ok(());
    }
    if let Some(full_mac) = envelope.state_mac_full.as_deref() {
        if mac_equals(&expected_full, full_mac, key, &full_payload) {
            return Ok(());
        }
    }
    // 2) legacy MAC（不含 prizes）—— 旧版本写出 / 旧版本可读的格式
    let legacy_payload = canonical(&legacy_view(&envelope.state))?;
    if mac_equals(&state_mac_legacy(&envelope.state, key)?, &envelope.state_mac, key, &legacy_payload) {
        return Ok(());
    }
    Err("CORE_INTEGRITY_CHECK_FAILED".into())
}

// ponytail: prizes 字段加入 CoreState（a7c8c20）前的旧字段集，声明顺序必须与当时完全一致，
// 否则旧 envelope 的 MAC 永远对不上；删除本结构前先确认所有存量数据已升级
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LegacyCoreState<'a> {
    schema_version: u32,
    sequence: u64,
    previous_hash: &'a str,
    receipt_hash: &'a str,
    algorithm: &'a str,
    algorithm_version: &'a str,
    names: &'a Value,
    balance: &'a Value,
    statistics: &'a Value,
    records: &'a Value,
}

fn legacy_view(state: &CoreState) -> LegacyCoreState<'_> {
    LegacyCoreState {
        schema_version: state.schema_version,
        sequence: state.sequence,
        previous_hash: &state.previous_hash,
        receipt_hash: &state.receipt_hash,
        algorithm: &state.algorithm,
        algorithm_version: &state.algorithm_version,
        names: &state.names,
        balance: &state.balance,
        statistics: &state.statistics,
        records: &state.records,
    }
}

fn state_mac_legacy(state: &CoreState, key: &[u8; 32]) -> Result<String, String> {
    let mut mac = HmacSha256::new_from_slice(key).map_err(|error| error.to_string())?;
    mac.update(&canonical(&legacy_view(state))?);
    Ok(base64::engine::general_purpose::STANDARD_NO_PAD.encode(mac.finalize().into_bytes()))
}

fn verify_legacy(envelope: &CoreStateEnvelope, key: &[u8; 32]) -> bool {
    let Ok(actual) = base64::engine::general_purpose::STANDARD_NO_PAD.decode(&envelope.state_mac) else { return false };
    let Ok(canonical_bytes) = canonical(&legacy_view(&envelope.state)) else { return false };
    let Ok(mut mac) = HmacSha256::new_from_slice(key) else { return false };
    mac.update(&canonical_bytes);
    mac.verify_slice(&actual).is_ok()
}

pub fn receipt_hash(receipt: &Value) -> Result<String, String> {
    let mut hasher = Sha256::new();
    hasher.update(canonical(receipt)?);
    Ok(hex::encode(hasher.finalize()))
}

pub fn genesis(values: &Value) -> CoreStateEnvelope {
    let object = values.as_object().cloned().unwrap_or_default();
    let state = CoreState {
        schema_version: CORE_SCHEMA_VERSION,
        sequence: 0,
        previous_hash: String::new(),
        receipt_hash: String::new(),
        algorithm: ALGORITHM_NAME.into(),
        algorithm_version: ALGORITHM_VERSION.into(),
        names: json!({
            "currentListId": object.get("currentListId").cloned().unwrap_or_else(|| json!("default")),
            "lists": object.get("lists").cloned().unwrap_or_else(|| json!({}))
        }),
        balance: object.get("balance").cloned().unwrap_or_else(|| json!({ "enabled": true })),
        statistics: object.get("statistics").cloned().unwrap_or_else(|| json!({ "counts": {}, "totalCount": 0 })),
        records: object.get("records").cloned().unwrap_or_else(|| json!([])),
        prizes: object.get("prizes").cloned().unwrap_or_else(|| json!({ "lists": {}, "currentId": "default", "records": [] })),
    };
    CoreStateEnvelope { schema_version: CORE_SCHEMA_VERSION, state, state_mac: String::new(), state_mac_full: None }
}

pub fn seal(mut envelope: CoreStateEnvelope, key: &[u8; 32]) -> Result<CoreStateEnvelope, String> {
    let full = state_mac(&envelope.state, key)?;
    envelope.state_mac = full.clone();
    envelope.state_mac_full = Some(full);
    Ok(envelope)
}

pub fn parse(values: &Value, key: &[u8; 32]) -> Result<CoreStateEnvelope, String> {
    let Some(raw) = values.as_object().and_then(|object| object.get(CORE_STATE_KEY)) else {
        return seal(genesis(values), key);
    };
    // 未知字段原样保留在 raw 中；这里只解析已知结构，失败时向上返回而不是静默丢弃。
    let mut envelope: CoreStateEnvelope = serde_json::from_value(raw.clone()).map_err(|_| "CORE_INTEGRITY_CHECK_FAILED".to_string())?;
    if verify(&envelope, key).is_err() {
        // 仅当 prizes 仍是默认值且 legacy MAC 匹配时，才升级重签（兼容无 prizes 的旧数据）。
        if envelope.state.prizes != default_prizes() || !verify_legacy(&envelope, key) {
            return Err("CORE_INTEGRITY_CHECK_FAILED".into());
        }
        envelope = seal(envelope, key)?;
    } else if envelope.state_mac_full.is_none() {
        // 校验通过但缺少冗余字段时补写，便于后续版本识别；不改动 state 语义。
        envelope = seal(envelope, key)?;
    }
    if envelope.state.sequence > 0
        && (envelope.state.previous_hash.len() != 64 || envelope.state.receipt_hash.len() != 64)
    {
        return Err("CORE_INTEGRITY_CHECK_FAILED".into());
    }
    Ok(envelope)
}

pub fn verify_bound_values(values: &Value, envelope: &CoreStateEnvelope) -> Result<(), String> {
    let object = values.as_object().ok_or_else(|| "CORE_INTEGRITY_CHECK_FAILED".to_string())?;
    for (key, expected) in [("lists", envelope.state.names.get("lists")), ("currentListId", envelope.state.names.get("currentListId")), ("balance", Some(&envelope.state.balance)), ("statistics", Some(&envelope.state.statistics)), ("records", Some(&envelope.state.records)), ("prizes", Some(&envelope.state.prizes))] {
        if let Some(expected) = expected {
            if object.contains_key(key) && object.get(key) != Some(expected) { return Err("CORE_INTEGRITY_CHECK_FAILED".into()); }
        }
    }
    Ok(())
}

pub fn normalize_values(values: &Value, key: &[u8; 32]) -> Result<Value, String> {
    let envelope = parse(values, key)?;
    let mut normalized = values.clone();
    let object = normalized.as_object_mut().ok_or_else(|| "CORE_TRANSACTION_REJECTED".to_string())?;
    let raw_envelope = object.get(CORE_STATE_KEY).cloned();
    let mut envelope_value = to_value(&envelope)?;
    // 保留旧/新版本写入、当前结构未知的 envelope/state 字段，避免向下兼容时被洗掉。
    if let Some(raw) = raw_envelope.as_ref() {
        merge_missing_keys(raw, &mut envelope_value);
        if let (Some(raw_state), Some(new_state)) = (
            raw.get("state"),
            envelope_value.get_mut("state"),
        ) {
            merge_missing_keys(raw_state, new_state);
        }
    }
    object.insert(CORE_STATE_KEY.into(), envelope_value);
    object.insert("lists".into(), envelope.state.names.get("lists").cloned().unwrap_or_else(|| json!({})));
    object.insert("currentListId".into(), envelope.state.names.get("currentListId").cloned().unwrap_or_else(|| json!("default")));
    object.insert("balance".into(), envelope.state.balance.clone());
    object.insert("statistics".into(), envelope.state.statistics.clone());
    object.insert("records".into(), envelope.state.records.clone());
    object.insert("prizes".into(), envelope.state.prizes.clone());
    Ok(normalized)
}

fn merge_missing_keys(source: &Value, target: &mut Value) {
    let (Some(source_obj), Some(target_obj)) = (source.as_object(), target.as_object_mut()) else {
        return;
    };
    for (key, value) in source_obj {
        if !target_obj.contains_key(key) {
            target_obj.insert(key.clone(), value.clone());
        }
    }
}

pub fn to_value(envelope: &CoreStateEnvelope) -> Result<Value, String> {
    serde_json::to_value(envelope).map_err(|error| error.to_string())
}

pub fn hash_state(envelope: &CoreStateEnvelope) -> Result<String, String> {
    let mut hasher = Sha256::new();
    hasher.update(canonical(envelope)?);
    Ok(hex::encode(hasher.finalize()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn envelope_mac_covers_complete_state() {
        let key = [7u8; 32];
        let mut envelope = seal(genesis(&json!({ "lists": {}, "statistics": { "counts": {}, "totalCount": 0 }, "records": [] })), &key).unwrap();
        verify(&envelope, &key).unwrap();
        envelope.state.records = json!([{ "operationId": "tampered" }]);
        assert_eq!(verify(&envelope, &key).unwrap_err(), "CORE_INTEGRITY_CHECK_FAILED");
    }

    #[test]
    fn genesis_starts_at_sequence_zero_and_sealed_state_has_mac() {
        let key = [9u8; 32];
        let envelope = seal(genesis(&json!({})), &key).unwrap();
        assert_eq!(envelope.state.sequence, 0);
        assert!(!envelope.state_mac.is_empty());
    }

    #[test]
    fn non_genesis_state_requires_hash_chain_fields() {
        let key = [1u8; 32];
        let mut envelope = seal(genesis(&json!({})), &key).unwrap();
        envelope.state.sequence = 1;
        envelope = seal(envelope, &key).unwrap();
        let values = json!({ CORE_STATE_KEY: envelope });
        assert_eq!(parse(&values, &key).unwrap_err(), "CORE_INTEGRITY_CHECK_FAILED");
    }

    #[test]
    fn legacy_envelope_without_prizes_is_upgraded_on_parse() {
        let key = [5u8; 32];
        let mut state = genesis(&json!({})).state;
        state.sequence = 3;
        state.previous_hash = "a".repeat(64);
        state.receipt_hash = "b".repeat(64);
        state.records = json!([{ "operationId": "op-1" }]);
        let legacy_mac = state_mac_legacy(&state, &key).unwrap();
        let mut raw = serde_json::to_value(&state).unwrap();
        raw.as_object_mut().unwrap().remove("prizes");
        let values = json!({ CORE_STATE_KEY: { "schemaVersion": 1, "state": raw, "stateMac": legacy_mac } });
        let upgraded = parse(&values, &key).unwrap();
        verify(&upgraded, &key).unwrap();
        assert_eq!(upgraded.state.sequence, 3);
        assert_eq!(upgraded.state.prizes, default_prizes());
    }

    #[test]
    fn tampered_legacy_envelope_is_rejected() {
        let key = [6u8; 32];
        let mut state = genesis(&json!({})).state;
        let legacy_mac = state_mac_legacy(&state, &key).unwrap();
        state.records = json!([{ "operationId": "tampered" }]);
        let mut raw = serde_json::to_value(&state).unwrap();
        raw.as_object_mut().unwrap().remove("prizes");
        let values = json!({ CORE_STATE_KEY: { "schemaVersion": 1, "state": raw, "stateMac": legacy_mac } });
        assert_eq!(parse(&values, &key).unwrap_err(), "CORE_INTEGRITY_CHECK_FAILED");
    }

    #[test]
    fn normalize_values_rebinds_legacy_and_top_level_core_fields_to_the_envelope() {
        let key = [3u8; 32];
        let values = json!({
            "lists": { "list-1": { "id": "list-1", "names": [] } },
            "currentListId": "list-1",
            "statistics": { "counts": { "person-1": 1 }, "totalCount": 1 },
            "records": [{ "operationId": "op-1" }]
        });
        let normalized = normalize_values(&values, &key).unwrap();
        assert!(normalized.get(CORE_STATE_KEY).is_some());
        assert_eq!(normalized["statistics"]["totalCount"], 1);
        assert_eq!(normalized["records"][0]["operationId"], "op-1");
    }

    #[test]
    fn seal_writes_full_mac_and_accepts_legacy_mac_for_downgrade() {
        let key = [11u8; 32];
        let mut envelope = seal(genesis(&json!({
            "lists": {},
            "statistics": { "counts": {}, "totalCount": 0 },
            "records": [],
            "prizes": { "lists": { "p1": { "id": "p1", "items": ["A"] } }, "currentId": "p1", "records": [] }
        })), &key).unwrap();
        assert!(envelope.state_mac_full.is_some());
        verify(&envelope, &key).unwrap();

        // 模拟旧版本只写 legacy state_mac（无 stateMacFull）的数据仍可读取
        let legacy_mac = state_mac_legacy(&envelope.state, &key).unwrap();
        envelope.state_mac = legacy_mac;
        envelope.state_mac_full = None;
        verify(&envelope, &key).unwrap();
    }

    #[test]
    fn normalize_preserves_unknown_envelope_and_state_fields() {
        let key = [13u8; 32];
        let mut values = json!({ "pluginState": { "keep": true } });
        let envelope = seal(genesis(&values), &key).unwrap();
        let mut envelope_json = serde_json::to_value(&envelope).unwrap();
        envelope_json["futureEnvelopeField"] = json!("keep-me");
        envelope_json["state"]["futureStateField"] = json!({ "nested": 1 });
        values[CORE_STATE_KEY] = envelope_json;
        let normalized = normalize_values(&values, &key).unwrap();
        assert_eq!(normalized[CORE_STATE_KEY]["futureEnvelopeField"], json!("keep-me"));
        assert_eq!(normalized[CORE_STATE_KEY]["state"]["futureStateField"], json!({ "nested": 1 }));
        assert_eq!(normalized["pluginState"]["keep"], json!(true));
    }
}

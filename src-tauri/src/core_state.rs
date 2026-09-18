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
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoreStateEnvelope {
    pub schema_version: u32,
    pub state: CoreState,
    pub state_mac: String,
}

fn canonical<T: Serialize>(value: &T) -> Result<Vec<u8>, String> {
    serde_json::to_vec(value).map_err(|error| error.to_string())
}

pub fn state_mac(state: &CoreState, key: &[u8; 32]) -> Result<String, String> {
    let mut mac = HmacSha256::new_from_slice(key).map_err(|error| error.to_string())?;
    mac.update(&canonical(state)?);
    Ok(base64::engine::general_purpose::STANDARD_NO_PAD.encode(mac.finalize().into_bytes()))
}

pub fn verify(envelope: &CoreStateEnvelope, key: &[u8; 32]) -> Result<(), String> {
    if envelope.schema_version != CORE_SCHEMA_VERSION
        || envelope.state.schema_version != CORE_SCHEMA_VERSION
        || envelope.state.algorithm_version != ALGORITHM_VERSION
    {
        return Err("CORE_INTEGRITY_CHECK_FAILED".into());
    }
    let expected = state_mac(&envelope.state, key)?;
    let actual = base64::engine::general_purpose::STANDARD_NO_PAD
        .decode(&envelope.state_mac)
        .map_err(|_| "CORE_INTEGRITY_CHECK_FAILED".to_string())?;
    let expected_bytes = base64::engine::general_purpose::STANDARD_NO_PAD
        .decode(expected)
        .map_err(|_| "CORE_INTEGRITY_CHECK_FAILED".to_string())?;
    if actual.len() != expected_bytes.len() {
        return Err("CORE_INTEGRITY_CHECK_FAILED".into());
    }
    let mut mac = HmacSha256::new_from_slice(key).map_err(|error| error.to_string())?;
    mac.update(&canonical(&envelope.state)?);
    mac.verify_slice(&actual)
        .map_err(|_| "CORE_INTEGRITY_CHECK_FAILED".to_string())
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
    };
    CoreStateEnvelope { schema_version: CORE_SCHEMA_VERSION, state, state_mac: String::new() }
}

pub fn seal(mut envelope: CoreStateEnvelope, key: &[u8; 32]) -> Result<CoreStateEnvelope, String> {
    envelope.state_mac = state_mac(&envelope.state, key)?;
    Ok(envelope)
}

pub fn parse(values: &Value, key: &[u8; 32]) -> Result<CoreStateEnvelope, String> {
    let Some(raw) = values.as_object().and_then(|object| object.get(CORE_STATE_KEY)) else {
        return seal(genesis(values), key);
    };
    let envelope: CoreStateEnvelope = serde_json::from_value(raw.clone()).map_err(|_| "CORE_INTEGRITY_CHECK_FAILED".to_string())?;
    verify(&envelope, key)?;
    if envelope.state.sequence > 0
        && (envelope.state.previous_hash.len() != 64 || envelope.state.receipt_hash.len() != 64)
    {
        return Err("CORE_INTEGRITY_CHECK_FAILED".into());
    }
    Ok(envelope)
}

pub fn normalize_values(values: &Value, key: &[u8; 32]) -> Result<Value, String> {
    let envelope = parse(values, key)?;
    let mut normalized = values.clone();
    let object = normalized.as_object_mut().ok_or_else(|| "CORE_TRANSACTION_REJECTED".to_string())?;
    object.insert(CORE_STATE_KEY.into(), to_value(&envelope)?);
    object.insert("lists".into(), envelope.state.names.get("lists").cloned().unwrap_or_else(|| json!({})));
    object.insert("currentListId".into(), envelope.state.names.get("currentListId").cloned().unwrap_or_else(|| json!("default")));
    object.insert("balance".into(), envelope.state.balance.clone());
    object.insert("statistics".into(), envelope.state.statistics.clone());
    object.insert("records".into(), envelope.state.records.clone());
    Ok(normalized)
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
}

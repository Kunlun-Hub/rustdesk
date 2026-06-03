use std::{
    collections::{hash_map::DefaultHasher, HashMap, HashSet},
    hash::{Hash, Hasher},
    sync::RwLock,
};

use hbb_common::{config, log};

lazy_static::lazy_static! {
    static ref RELAY_SERVERS: RwLock<Vec<String>> = RwLock::new(build_relay_servers());
}

fn normalize_relay_entry(input: &str) -> String {
    let trimmed = input.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return String::new();
    }
    if trimmed.contains("://") {
        if let Ok(parsed) = url::Url::parse(trimmed) {
            if let Some(host) = parsed.host_str() {
                if let Some(port) = parsed.port() {
                    return format!("{host}:{port}");
                }
                return host.to_owned();
            }
        }
    }
    trimmed.to_owned()
}

fn parse_relay_servers(input: &str) -> Vec<String> {
    let input = input.trim();
    if input.is_empty() {
        return Vec::new();
    }

    let values = if input.starts_with('[') {
        serde_json::from_str::<Vec<String>>(input).unwrap_or_default()
    } else {
        input
            .split(|c: char| c == ',' || c == ';' || c == '\n' || c == '\r' || c.is_whitespace())
            .map(|item| item.to_owned())
            .collect()
    };

    let mut unique = HashSet::new();
    let mut result = Vec::new();
    for value in values {
        let normalized = normalize_relay_entry(&value);
        if normalized.is_empty() || !unique.insert(normalized.clone()) {
            continue;
        }
        result.push(normalized);
    }
    result
}

fn build_relay_servers() -> Vec<String> {
    parse_relay_servers(option_env!("RUSTDESK_BUILD_RELAY_SERVERS").unwrap_or(""))
}

fn has_built_in_server_config_values(
    built_in_id_server: &str,
    built_in_api_server: &str,
    built_in_key: &str,
    relay_api_url: &str,
    relay_servers: &[String],
) -> bool {
    !built_in_id_server.trim().is_empty()
        || !built_in_api_server.trim().is_empty()
        || !built_in_key.trim().is_empty()
        || !relay_api_url.trim().is_empty()
        || !relay_servers.is_empty()
}

fn is_locked_server_option_with_values(
    key: &str,
    built_in_id_server: &str,
    built_in_api_server: &str,
    built_in_key: &str,
    relay_api_url: &str,
    relay_servers: &[String],
) -> bool {
    match key {
        "custom-rendezvous-server" => !built_in_id_server.trim().is_empty(),
        "api-server" => !built_in_api_server.trim().is_empty(),
        "key" => !built_in_key.trim().is_empty(),
        "relay-server" => has_built_in_server_config_values(
            built_in_id_server,
            built_in_api_server,
            built_in_key,
            relay_api_url,
            relay_servers,
        ),
        _ => false,
    }
}

fn strip_locked_server_options_with_values(
    mut options: HashMap<String, String>,
    built_in_id_server: &str,
    built_in_api_server: &str,
    built_in_key: &str,
    relay_api_url: &str,
    relay_servers: &[String],
) -> HashMap<String, String> {
    options.retain(|key, _| {
        !is_locked_server_option_with_values(
            key,
            built_in_id_server,
            built_in_api_server,
            built_in_key,
            relay_api_url,
            relay_servers,
        )
    });
    options
}

pub fn built_in_id_server() -> String {
    option_env!("RUSTDESK_BUILD_ID_SERVER")
        .unwrap_or("")
        .trim()
        .to_owned()
}

pub fn built_in_api_server() -> String {
    option_env!("RUSTDESK_BUILD_API_SERVER")
        .unwrap_or("")
        .trim()
        .trim_end_matches('/')
        .to_owned()
}

pub fn built_in_key() -> String {
    option_env!("RUSTDESK_BUILD_KEY")
        .unwrap_or("")
        .trim()
        .to_owned()
}

pub fn relay_list_url() -> String {
    let explicit = option_env!("RUSTDESK_BUILD_RELAY_API_URL")
        .unwrap_or("")
        .trim()
        .trim_end_matches('/')
        .to_owned();
    if !explicit.is_empty() {
        return explicit;
    }

    let api = built_in_api_server();
    if api.is_empty() {
        return String::new();
    }
    format!("{api}/relay/list.json")
}

pub fn has_built_in_server_config() -> bool {
    let built_in_id = built_in_id_server();
    let built_in_api = built_in_api_server();
    let built_in_key = built_in_key();
    let relay_api_url = relay_list_url();
    let relay_servers = build_relay_servers();
    has_built_in_server_config_values(
        &built_in_id,
        &built_in_api,
        &built_in_key,
        &relay_api_url,
        &relay_servers,
    )
}

pub fn is_locked_server_option(key: &str) -> bool {
    let built_in_id = built_in_id_server();
    let built_in_api = built_in_api_server();
    let built_in_key = built_in_key();
    let relay_api_url = relay_list_url();
    let relay_servers = build_relay_servers();
    is_locked_server_option_with_values(
        key,
        &built_in_id,
        &built_in_api,
        &built_in_key,
        &relay_api_url,
        &relay_servers,
    )
}

pub fn apply_built_in_client_config() {
    let built_in_id = built_in_id_server();
    let built_in_api = built_in_api_server();
    let built_in_key = built_in_key();
    let relay_api_url = relay_list_url();
    let fallback_relays = build_relay_servers();
    if has_built_in_server_config_values(
        &built_in_id,
        &built_in_api,
        &built_in_key,
        &relay_api_url,
        &fallback_relays,
    ) {
        config::BUILTIN_SETTINGS
            .write()
            .unwrap()
            .insert("hide-server-settings".to_owned(), "Y".to_owned());

        let current_options = config::Config::get_options();
        let stripped_options = strip_locked_server_options_with_values(
            current_options.clone(),
            &built_in_id,
            &built_in_api,
            &built_in_key,
            &relay_api_url,
            &fallback_relays,
        );
        if stripped_options != current_options {
            config::Config::set_options(stripped_options);
        }
    }

    if !fallback_relays.is_empty() && RELAY_SERVERS.read().unwrap().is_empty() {
        *RELAY_SERVERS.write().unwrap() = fallback_relays;
    }
}

pub fn relay_servers() -> Vec<String> {
    RELAY_SERVERS.read().unwrap().clone()
}

pub fn configured_relay_server(seed: &str, allow_local_option: bool) -> Option<String> {
    if allow_local_option {
        let relay_server = config::Config::get_option("relay-server");
        if !relay_server.is_empty() {
            return Some(relay_server);
        }
    }
    choose_relay_server(seed)
}

pub fn set_relay_servers(relays: Vec<String>) {
    let mut unique = HashSet::new();
    let relays = relays
        .into_iter()
        .map(|relay| normalize_relay_entry(&relay))
        .filter(|relay| !relay.is_empty())
        .filter(|relay| unique.insert(relay.clone()))
        .collect::<Vec<_>>();
    log::info!("updated relay pool: {} entries", relays.len());
    *RELAY_SERVERS.write().unwrap() = relays;
}

pub fn strip_locked_server_options(mut options: HashMap<String, String>) -> HashMap<String, String> {
    let built_in_id = built_in_id_server();
    let built_in_api = built_in_api_server();
    let built_in_key = built_in_key();
    let relay_api_url = relay_list_url();
    let relay_servers = build_relay_servers();
    strip_locked_server_options_with_values(
        options,
        &built_in_id,
        &built_in_api,
        &built_in_key,
        &relay_api_url,
        &relay_servers,
    )
}

pub fn choose_relay_server(seed: &str) -> Option<String> {
    let relays = RELAY_SERVERS.read().unwrap();
    if relays.is_empty() {
        return None;
    }

    let mut hasher = DefaultHasher::new();
    seed.hash(&mut hasher);
    let idx = (hasher.finish() % relays.len() as u64) as usize;
    relays.get(idx).cloned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    lazy_static::lazy_static! {
        static ref TEST_LOCK: Mutex<()> = Mutex::new(());
    }

    struct RelayPoolRestoreGuard {
        relays: Vec<String>,
    }

    impl RelayPoolRestoreGuard {
        fn new() -> Self {
            Self {
                relays: relay_servers(),
            }
        }
    }

    impl Drop for RelayPoolRestoreGuard {
        fn drop(&mut self) {
            set_relay_servers(self.relays.clone());
        }
    }

    #[test]
    fn parse_relay_servers_normalizes_and_deduplicates() {
        let _lock = TEST_LOCK.lock().unwrap();
        assert_eq!(
            parse_relay_servers(
                " relay-a.example.com, https://relay-b.example.com:21117/ ; relay-a.example.com "
            ),
            vec![
                "relay-a.example.com".to_owned(),
                "relay-b.example.com:21117".to_owned(),
            ]
        );
    }

    #[test]
    fn parse_relay_servers_accepts_json_array() {
        let _lock = TEST_LOCK.lock().unwrap();
        assert_eq!(
            parse_relay_servers(
                "[\"https://relay-a.example.com/\",\"relay-b.example.com:21117\",\"\"]"
            ),
            vec![
                "relay-a.example.com".to_owned(),
                "relay-b.example.com:21117".to_owned(),
            ]
        );
    }

    #[test]
    fn set_relay_servers_normalizes_and_deduplicates_runtime_updates() {
        let _lock = TEST_LOCK.lock().unwrap();
        let _restore = RelayPoolRestoreGuard::new();
        set_relay_servers(vec![
            " https://relay-a.example.com:21117/ ".to_owned(),
            "relay-a.example.com:21117".to_owned(),
            "relay-b.example.com".to_owned(),
        ]);
        assert_eq!(
            relay_servers(),
            vec![
                "relay-a.example.com:21117".to_owned(),
                "relay-b.example.com".to_owned(),
            ]
        );
    }

    #[test]
    fn choose_relay_server_is_stable_for_same_seed() {
        let _lock = TEST_LOCK.lock().unwrap();
        let _restore = RelayPoolRestoreGuard::new();
        set_relay_servers(vec![
            "relay-a.example.com".to_owned(),
            "relay-b.example.com".to_owned(),
            "relay-c.example.com".to_owned(),
        ]);
        let first = choose_relay_server("device-1");
        let second = choose_relay_server("device-1");
        assert_eq!(first, second);
        assert!(first.is_some());
    }

    #[test]
    fn helper_detects_locked_server_options_from_embedded_values() {
        let relay_servers = vec!["relay-a.example.com".to_owned()];
        assert!(is_locked_server_option_with_values(
            "custom-rendezvous-server",
            "hbbs.example.com",
            "",
            "",
            "",
            &relay_servers,
        ));
        assert!(is_locked_server_option_with_values(
            "api-server",
            "",
            "https://api.example.com",
            "",
            "",
            &relay_servers,
        ));
        assert!(is_locked_server_option_with_values(
            "key",
            "",
            "",
            "pubkey",
            "",
            &relay_servers,
        ));
        assert!(is_locked_server_option_with_values(
            "relay-server",
            "",
            "",
            "",
            "https://api.example.com/relay/list.json",
            &Vec::new(),
        ));
        assert!(!is_locked_server_option_with_values(
            "custom-rendezvous-server",
            "",
            "",
            "",
            "",
            &Vec::new(),
        ));
    }

    #[test]
    fn strip_locked_server_options_helper_keeps_only_unlocked_values() {
        let options = HashMap::from([
            ("custom-rendezvous-server".to_owned(), "old-hbbs".to_owned()),
            ("relay-server".to_owned(), "old-relay".to_owned()),
            ("api-server".to_owned(), "https://old-api.example.com".to_owned()),
            ("key".to_owned(), "old-key".to_owned()),
            ("theme".to_owned(), "dark".to_owned()),
        ]);
        let filtered = strip_locked_server_options_with_values(
            options,
            "hbbs.example.com",
            "https://api.example.com",
            "pubkey",
            "https://api.example.com/relay/list.json",
            &vec!["relay-a.example.com".to_owned()],
        );
        assert_eq!(
            filtered,
            HashMap::from([("theme".to_owned(), "dark".to_owned())])
        );
    }
}

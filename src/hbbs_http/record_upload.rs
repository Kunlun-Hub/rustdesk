use crate::hbbs_http::create_http_client_with_url;
use hbb_common::{
    bail,
    config::{self, Config},
    lazy_static, log, ResultType,
};
use reqwest::blocking::Client;
use scrap::record::RecordState;
use serde::Deserialize;
use serde_json::{json, Map};
use sha2::{Digest, Sha256};
use std::{
    fs::File,
    io::{prelude::*, SeekFrom},
    sync::{mpsc::Receiver, Arc, Mutex},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

const MAX_HEADER_LEN: usize = 1024;
const SHOULD_SEND_TIME: Duration = Duration::from_secs(1);
const SHOULD_SEND_SIZE: u64 = 1024 * 1024;
const MIN_CHUNK_SIZE: u64 = 4 * 1024 * 1024;
const MAX_CHUNK_SIZE: u64 = 8 * 1024 * 1024;
const POLICY_CACHE_TIME: Duration = Duration::from_secs(30);
const MAX_SEND_ATTEMPTS: usize = 3;

lazy_static::lazy_static! {
    static ref ENABLE: Arc<Mutex<bool>> = Default::default();
    static ref LAST_POLICY_CHECK: Arc<Mutex<Option<Instant>>> = Default::default();
}

pub fn is_enable() -> bool {
    ENABLE
        .lock()
        .map(|value| *value)
        .unwrap_or_else(|_| config::Status::get("recording_policy_enabled") == "Y")
}

pub fn set_policy_enabled(enabled: bool) {
    if let Ok(mut current) = ENABLE.lock() {
        *current = enabled;
    }
    config::Status::set(
        "recording_policy_enabled",
        if enabled { "Y" } else { "N" }.to_owned(),
    );
}

#[derive(Deserialize)]
struct ApiEnvelope<T> {
    code: i32,
    message: String,
    data: T,
}

#[derive(Deserialize)]
struct RecordingPolicy {
    enabled: bool,
}

#[derive(Deserialize)]
struct UploadInitResponse {
    upload_id: String,
    upload_token: String,
    chunk_size: u64,
}

pub fn refresh_policy() -> bool {
    if let Ok(last) = LAST_POLICY_CHECK.lock() {
        if last.map(|value| value.elapsed() < POLICY_CACHE_TIME).unwrap_or(false) {
            return is_enable();
        }
    }
    let api_server = crate::get_api_server(
        Config::get_option("api-server"),
        Config::get_option("custom-rendezvous-server"),
    );
    if api_server.is_empty() {
        return is_enable();
    }
    let url = format!("{}/api/recording-policy", api_server);
    let enabled = create_http_client_with_url(&url)
        .get(&url)
        .query(&[
            ("peer_id", Config::get_id()),
            ("uuid", crate::encode64(hbb_common::get_uuid())),
        ])
        .send()
        .and_then(|response| response.error_for_status())
        .and_then(|response| response.json::<ApiEnvelope<RecordingPolicy>>())
        .map(|response| response.code == 0 && response.data.enabled);
    match enabled {
        Ok(value) => {
            set_policy_enabled(value);
            if let Ok(mut last) = LAST_POLICY_CHECK.lock() {
                *last = Some(Instant::now());
            }
            value
        }
        Err(err) => {
            log::warn!("failed to refresh recording policy: {err}");
            is_enable()
        }
    }
}

pub fn run(rx: Receiver<RecordState>) {
    std::thread::spawn(move || {
        let api_server = crate::get_api_server(
            Config::get_option("api-server"),
            Config::get_option("custom-rendezvous-server"),
        );
        // This URL is used for TLS connectivity testing and fallback detection.
        let login_option_url = format!("{}/api/login-options", &api_server);
        let client = create_http_client_with_url(&login_option_url);
        let mut uploader = RecordUploader {
            client,
            api_server,
            filepath: Default::default(),
            filename: Default::default(),
            upload_size: Default::default(),
            upload_id: Default::default(),
            upload_token: Default::default(),
            chunk_size: SHOULD_SEND_SIZE * 8,
            running: Default::default(),
            last_send: Instant::now(),
            started_at: Instant::now(),
        };
        loop {
            if let Err(e) = match rx.recv() {
                Ok(state) => match state {
                    RecordState::NewFile(filepath) => uploader.handle_new_file(filepath),
                    RecordState::NewFrame => {
                        if uploader.running {
                            uploader.handle_frame(false)
                        } else {
                            Ok(())
                        }
                    }
                    RecordState::WriteTail => {
                        if uploader.running {
                            uploader.handle_tail()
                        } else {
                            Ok(())
                        }
                    }
                    RecordState::RemoveFile => {
                        if uploader.running {
                            uploader.handle_remove()
                        } else {
                            Ok(())
                        }
                    }
                },
                Err(e) => {
                    log::trace!("upload thread stop: {}", e);
                    break;
                }
            } {
                log::error!("upload stop: {}", e);
            }
        }
    });
}

struct RecordUploader {
    client: Client,
    api_server: String,
    filepath: String,
    filename: String,
    upload_size: u64,
    upload_id: String,
    upload_token: String,
    chunk_size: u64,
    running: bool,
    last_send: Instant,
    started_at: Instant,
}
impl RecordUploader {
    fn file_sha256(&self) -> ResultType<String> {
        let mut file = File::open(&self.filepath)?;
        let mut hasher = Sha256::new();
        let mut buffer = vec![0u8; 1024 * 1024];
        loop {
            let length = file.read(&mut buffer)?;
            if length == 0 {
                break;
            }
            hasher.update(&buffer[..length]);
        }
        Ok(hex::encode(hasher.finalize()))
    }

    fn send_chunk(&self, offset: u64, body: Vec<u8>) -> ResultType<()> {
        let url = format!(
            "{}/api/recordings/{}/chunks",
            self.api_server, self.upload_id
        );
        let mut last_error = String::new();
        for attempt in 0..MAX_SEND_ATTEMPTS {
            match self.client.put(&url)
                .query(&[("offset", offset.to_string())])
                .header("X-Upload-Token", &self.upload_token)
                .body(body.clone())
                .send()
                .and_then(|response| response.error_for_status())
            {
                Ok(response) => {
                    match response.json::<Map<String, serde_json::Value>>() {
                        Ok(value) => {
                            if value.get("code").and_then(|v| v.as_i64()) == Some(0) {
                                return Ok(());
                            }
                            last_error = value
                                .get("message")
                                .map(ToString::to_string)
                                .unwrap_or_default();
                        }
                        Err(err) => last_error = err.to_string(),
                    }
                }
                Err(err) => last_error = err.to_string(),
            }
            if attempt + 1 < MAX_SEND_ATTEMPTS {
                std::thread::sleep(Duration::from_millis(250 * (attempt as u64 + 1)));
            }
        }
        bail!("chunk upload failed: {last_error}")
    }

    fn handle_new_file(&mut self, filepath: String) -> ResultType<()> {
        match std::path::PathBuf::from(&filepath).file_name() {
            Some(filename) => match filename.to_owned().into_string() {
                Ok(filename) => {
                    self.filename = filename.clone();
                    self.filepath = filepath.clone();
                    self.upload_size = 0;
                    self.started_at = Instant::now();
                    self.last_send = Instant::now();
                    let codec = filename
                        .trim_end_matches(".webm")
                        .trim_end_matches(".mp4")
                        .rsplit('_')
                        .next()
                        .unwrap_or_default();
                    let (from_peer, from_name, session_id) =
                        crate::Connection::recording_context().unwrap_or_default();
                    let response = self.client
                        .post(format!("{}/api/recordings/init", self.api_server))
                        .json(&json!({
                            "peer_id": Config::get_id(),
                            "uuid": crate::encode64(hbb_common::get_uuid()),
                            "from_peer": from_peer,
                            "from_name": from_name,
                            "session_id": session_id,
                            "filename": filename,
                            "codec": codec,
                            "started_at": SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs(),
                        }))
                        .send()?
                        .error_for_status()?
                        .json::<ApiEnvelope<UploadInitResponse>>()?;
                    if response.code != 0 {
                        bail!(response.message);
                    }
                    self.upload_id = response.data.upload_id;
                    self.upload_token = response.data.upload_token;
                    self.chunk_size = response
                        .data
                        .chunk_size
                        .clamp(MIN_CHUNK_SIZE, MAX_CHUNK_SIZE);
                    self.running = true;
                    Ok(())
                }
                Err(_) => bail!("can't parse filename:{:?}", filename),
            },
            None => bail!("can't parse filepath:{}", filepath),
        }
    }

    fn handle_frame(&mut self, flush: bool) -> ResultType<()> {
        if !flush && self.last_send.elapsed() < SHOULD_SEND_TIME {
            return Ok(());
        }
        match File::open(&self.filepath) {
            Ok(mut file) => match file.metadata() {
                Ok(m) => {
                    let len = m.len();
                    if len <= self.upload_size {
                        return Ok(());
                    }
                    if !flush && len - self.upload_size < SHOULD_SEND_SIZE {
                        return Ok(());
                    }
                    let remaining = len - self.upload_size;
                    let read_size = remaining.min(self.chunk_size);
                    let mut buf = vec![0; read_size as usize];
                    match file.seek(SeekFrom::Start(self.upload_size)) {
                        Ok(_) => match file.read_exact(&mut buf) {
                            Ok(()) => {
                                self.send_chunk(self.upload_size, buf)?;
                                self.upload_size += read_size;
                                self.last_send = Instant::now();
                                if flush && self.upload_size < len {
                                    return self.handle_frame(true);
                                }
                                Ok(())
                            }
                            Err(e) => bail!(e.to_string()),
                        },
                        Err(e) => bail!(e.to_string()),
                    }
                }
                Err(e) => bail!(e.to_string()),
            },
            Err(e) => bail!(e.to_string()),
        }
    }

    fn handle_tail(&mut self) -> ResultType<()> {
        self.handle_frame(true)?;
        match File::open(&self.filepath) {
            Ok(mut file) => {
                let mut buf = vec![0u8; MAX_HEADER_LEN];
                match file.read(&mut buf) {
                    Ok(length) => {
                        buf.truncate(length);
                        self.send_chunk(0, buf)?;
                        let response = self
                            .client
                            .post(format!(
                                "{}/api/recordings/{}/complete",
                                self.api_server, self.upload_id
                            ))
                            .header("X-Upload-Token", &self.upload_token)
                            .json(&json!({
                                "duration_ms": self.started_at.elapsed().as_millis() as u64,
                                "sha256": self.file_sha256()?,
                            }))
                            .send()?
                            .error_for_status()?
                            .json::<Map<String, serde_json::Value>>()?;
                        if response.get("code").and_then(|value| value.as_i64()) != Some(0) {
                            bail!(response
                                .get("message")
                                .map(ToString::to_string)
                                .unwrap_or_default());
                        }
                        self.running = false;
                        log::info!("upload success, file: {}", self.filename);
                        Ok(())
                    }
                    Err(e) => bail!(e.to_string()),
                }
            }
            Err(e) => bail!(e.to_string()),
        }
    }

    fn handle_remove(&mut self) -> ResultType<()> {
        if !self.upload_id.is_empty() && !self.upload_token.is_empty() {
            self.client
                .delete(format!("{}/api/recordings/{}", self.api_server, self.upload_id))
                .header("X-Upload-Token", &self.upload_token)
                .send()?
                .error_for_status()?;
        }
        self.running = false;
        Ok(())
    }
}

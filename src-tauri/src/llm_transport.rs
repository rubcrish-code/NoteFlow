use crate::{
    ai_operations::{self, StreamChunk},
    data::{DataError, DataResult},
    llm::{self, HttpClient, HttpRequest, HttpResponse},
    provider_url::{normalize_provider_url, ProviderLocality},
};
use serde_json::{json, Value};
use std::{
    io::{BufRead, BufReader, Read, Write},
    process::Stdio,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};

const MAX_RESPONSE: usize = 16 * 1024 * 1024;
const MAX_LINE: usize = 1024 * 1024;
type Observer = Arc<dyn Fn(StreamChunk) + Send + Sync>;

pub struct ControlledHttpClient {
    pub token: Arc<AtomicBool>,
    pub observer: Observer,
    pub streaming: bool,
}

impl HttpClient for ControlledHttpClient {
    fn check_cancelled(&self) -> DataResult<()> {
        ai_operations::check(&self.token)
    }
    fn send(&self, mut request: HttpRequest) -> DataResult<HttpResponse> {
        self.check_cancelled()?;
        if !self.streaming {
            return llm::CurlHttpClient.send(request);
        }
        if let Some(body) = request.body.as_mut() {
            if body.get("messages").is_some() || body.get("prompt").is_some() {
                body["stream"] = json!(true);
            }
        }
        send(request, Arc::clone(&self.token), Arc::clone(&self.observer))
    }
}

#[derive(Default)]
struct StreamDecoder {
    text: String,
    finished: bool,
    saw_stream: bool,
    finish_reason: String,
    provider_error: bool,
}
impl StreamDecoder {
    fn line(&mut self, line: &str, observer: &Observer) -> DataResult<()> {
        let line = line.trim();
        if line == "data: [DONE]" {
            self.finished = true;
            self.saw_stream = true;
            return Ok(());
        }
        let data = line.strip_prefix("data:").map(str::trim).unwrap_or(line);
        let Ok(value) = serde_json::from_str::<Value>(data) else {
            return Ok(());
        };
        if value.get("error").is_some() {
            self.provider_error = true;
            return Ok(());
        }
        let choice = value.pointer("/choices/0");
        if let Some(reason) = choice
            .and_then(|v| v.get("finish_reason"))
            .and_then(Value::as_str)
        {
            self.finish_reason = reason.to_string();
        }
        let delta = choice
            .and_then(|value| value.pointer("/delta/content"))
            .and_then(Value::as_str)
            .or_else(|| value.get("response").and_then(Value::as_str))
            .or_else(|| value.pointer("/message/content").and_then(Value::as_str));
        if choice.is_some_and(|v| v.get("delta").is_some()) || value.get("done").is_some() {
            self.saw_stream = true;
        }
        if let Some(delta) = delta {
            if self.text.len() + delta.len() > MAX_RESPONSE {
                return Err(DataError::InvalidInput(
                    "Ответ модели слишком большой".into(),
                ));
            }
            self.text.push_str(delta);
            // Content only: reasoning/provider envelopes never cross IPC.
            observer(StreamChunk {
                text: delta.into(),
                reset: false,
            });
        }
        if choice.is_some_and(|v| v.get("finish_reason").is_some_and(|v| !v.is_null()))
            || value.get("done").and_then(Value::as_bool) == Some(true)
        {
            self.finished = true;
        }
        Ok(())
    }
}

pub fn send(
    request: HttpRequest,
    token: Arc<AtomicBool>,
    observer: Observer,
) -> DataResult<HttpResponse> {
    let url = normalize_provider_url(&request.url, ProviderLocality::Local)?;
    if !matches!(request.method.as_str(), "GET" | "POST") {
        return Err(DataError::InvalidInput(
            "Неподдерживаемый HTTP-метод".into(),
        ));
    }
    let seconds = (request.timeout_ms.clamp(1000, 600_000) + 999) / 1000;
    let mut config = format!("url = \"{}\"\nrequest = \"{}\"\nheader = \"Accept: application/json, text/event-stream\"\n", llm::escape_curl_config_value(&url), request.method);
    for (name, value) in &request.headers {
        llm::validate_request_header(name, value)?;
        config.push_str(&format!(
            "header = \"{}: {}\"\n",
            llm::escape_curl_config_value(name),
            llm::escape_curl_config_value(value)
        ));
    }
    if let Some(body) = request.body {
        config.push_str(&format!(
            "header = \"Content-Type: application/json\"\ndata = \"{}\"\n",
            llm::escape_curl_config_value(&body.to_string())
        ));
    }
    let mut child = llm::curl_command(&url, seconds, seconds.clamp(1, 4))
        .arg("--no-buffer")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|_| DataError::InvalidInput("HTTP-клиент недоступен".into()))?;
    let write = child
        .stdin
        .take()
        .ok_or_else(|| DataError::State("HTTP-клиент недоступен".into()))
        .and_then(|mut stdin| stdin.write_all(config.as_bytes()).map_err(DataError::from));
    if write.is_err() {
        let _ = child.kill();
        let _ = child.wait();
        return Err(DataError::InvalidInput(
            "Не удалось отправить запрос модели".into(),
        ));
    }
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| DataError::State("HTTP-клиент недоступен".into()))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| DataError::State("HTTP-клиент недоступен".into()))?;
    observer(StreamChunk {
        text: String::new(),
        reset: true,
    });
    let reader_token = Arc::clone(&token);
    let output = std::thread::spawn(move || -> DataResult<(String, StreamDecoder)> {
        let mut reader = BufReader::new(stdout);
        let mut body = Vec::new();
        let mut decoder = StreamDecoder::default();
        loop {
            let mut line = Vec::new();
            // read_until itself is bounded; an unterminated hostile line cannot allocate without limit.
            let count = reader
                .by_ref()
                .take((MAX_LINE + 1) as u64)
                .read_until(b'\n', &mut line)?;
            if count == 0 {
                break;
            }
            if line.len() > MAX_LINE || body.len() + line.len() > MAX_RESPONSE {
                reader_token.store(true, Ordering::SeqCst);
                return Err(DataError::InvalidInput(
                    "Ответ модели слишком большой".into(),
                ));
            }
            body.extend_from_slice(&line);
            let line = std::str::from_utf8(&line)
                .map_err(|_| DataError::InvalidInput("Некорректный ответ модели".into()))?;
            if let Err(error) = decoder.line(line, &observer) {
                reader_token.store(true, Ordering::SeqCst);
                return Err(error);
            }
        }
        Ok((
            String::from_utf8(body)
                .map_err(|_| DataError::InvalidInput("Некорректный ответ модели".into()))?,
            decoder,
        ))
    });
    let errors = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let _ = stderr.take(64 * 1024).read_to_end(&mut bytes);
        String::from_utf8_lossy(&bytes).to_string()
    });
    let started = Instant::now();
    let status = loop {
        if token.load(Ordering::SeqCst)
            || started.elapsed() > Duration::from_secs(seconds as u64 + 1)
        {
            let _ = child.kill();
            break child.wait();
        }
        match child.try_wait() {
            Ok(Some(status)) => break Ok(status),
            Ok(None) => std::thread::sleep(Duration::from_millis(20)),
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                break Err(error);
            }
        }
    };
    let read = output
        .join()
        .map_err(|_| DataError::State("Ответ модели прерван".into()))?;
    let stderr = errors.join().unwrap_or_default();
    let (stdout, decoder) = read?;
    ai_operations::check(&token)?;
    if !status?.success() {
        return Err(DataError::InvalidInput(llm::map_curl_error(&stderr)));
    }
    let (body, code) = stdout
        .rsplit_once('\n')
        .ok_or_else(|| DataError::InvalidInput("Некорректный HTTP-ответ".into()))?;
    let status = code
        .trim()
        .parse::<u16>()
        .map_err(|_| DataError::InvalidInput("Некорректный HTTP-статус".into()))?;
    if status < 300 && decoder.provider_error {
        return Err(DataError::InvalidInput(
            "Провайдер не завершил ответ".into(),
        ));
    }
    if status < 300 && decoder.saw_stream {
        if !decoder.finished
            || matches!(decoder.finish_reason.as_str(), "length" | "content_filter")
        {
            return Err(DataError::InvalidInput(
                "Модель не завершила ответ. Повторите запрос.".into(),
            ));
        }
        Ok(HttpResponse { status, body: json!({ "response": decoder.text, "choices": [{ "message": { "content": decoder.text }, "finish_reason": "stop" }] }).to_string() })
    } else {
        Ok(HttpResponse {
            status,
            body: body.into(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transports_send_saved_bearer_and_json_headers_on_the_wire() {
        for streaming in [false, true] {
            let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("synthetic loopback");
            let url = format!(
                "http://{}/api/v1/chat/completions",
                listener.local_addr().expect("address")
            );
            let fixture = std::thread::spawn(move || {
                let (mut socket, _) = listener.accept().expect("request");
                socket
                    .set_read_timeout(Some(Duration::from_secs(3)))
                    .expect("bounded fixture");
                let mut headers = Vec::new();
                while !headers.ends_with(b"\r\n\r\n") {
                    let mut byte = [0];
                    socket.read_exact(&mut byte).expect("HTTP header");
                    headers.push(byte[0]);
                    assert!(headers.len() < 16384);
                }
                let headers = String::from_utf8(headers).expect("ASCII headers");
                let lower = headers.to_ascii_lowercase();
                assert!(lower.contains("authorization: bearer synthetic+/token\r\n"));
                assert!(lower.contains("content-type: application/json\r\n"));
                assert!(lower.contains("user-agent: mozilla/5.0"));
                let length = lower
                    .lines()
                    .find_map(|line| line.strip_prefix("content-length:"))
                    .expect("body length")
                    .trim()
                    .parse::<usize>()
                    .expect("numeric length");
                assert!(length < 65536);
                let mut body = vec![0; length];
                socket.read_exact(&mut body).expect("JSON body");
                let body: Value = serde_json::from_slice(&body).expect("JSON decode");
                assert_eq!(body.get("stream").and_then(Value::as_bool), Some(streaming));
                assert_eq!(
                    body.get("model").and_then(Value::as_str),
                    Some("discovered-qa-model")
                );
                socket.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{\"choices\":[{\"message\":{\"content\":\"QA response\"}}]}").expect("fixture response");
            });
            let request = HttpRequest {
                method: "POST".into(),
                url,
                timeout_ms: 3000,
                headers: vec![
                    ("Authorization".into(), "Bearer synthetic+/token".into()),
                    (
                        "User-Agent".into(),
                        llm::OPENAI_COMPATIBLE_USER_AGENT.into(),
                    ),
                ],
                body: Some(
                    json!({ "model": "discovered-qa-model", "messages": [], "stream": false }),
                ),
            };
            let response = if streaming {
                ControlledHttpClient {
                    token: Arc::new(AtomicBool::new(false)),
                    observer: Arc::new(|_| {}),
                    streaming,
                }
                .send(request)
            } else {
                llm::CurlHttpClient.send(request)
            }
            .expect("real wire transport");
            fixture.join().expect("wire assertions");
            assert_eq!(response.status, 200);
        }
    }
    fn local_request(url: String) -> HttpRequest {
        HttpRequest {
            method: "POST".into(),
            url,
            headers: vec![],
            body: Some(json!({ "messages": [], "stream": true })),
            timeout_ms: 3000,
        }
    }
    fn server(body: &'static str, delay: bool) -> (String, std::thread::JoinHandle<()>) {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("loopback fixture");
        let url = format!(
            "http://{}/chat/completions",
            listener.local_addr().expect("address")
        );
        let task = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().expect("accept");
            socket
                .set_read_timeout(Some(Duration::from_secs(3)))
                .expect("timeout");
            let mut request = [0; 4096];
            let _ = socket.read(&mut request);
            let _ = socket.write_all(
                b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n",
            );
            let _ = socket.write_all(body.as_bytes());
            let _ = socket.flush();
            if delay {
                std::thread::sleep(Duration::from_millis(500));
            }
        });
        (url, task)
    }
    #[test]
    fn real_curl_streams_unicode_and_discards_reasoning() {
        let (url, server) = server("data: {\"choices\":[{\"delta\":{\"content\":\"Ответ 🙂\",\"reasoning_content\":\"SECRET\"}}]}\n\ndata: [DONE]\n\n", false);
        let chunks = Arc::new(std::sync::Mutex::new(String::new()));
        let observed = Arc::clone(&chunks);
        let response = send(
            local_request(url),
            Arc::new(AtomicBool::new(false)),
            Arc::new(move |chunk| observed.lock().expect("fixture").push_str(&chunk.text)),
        )
        .expect("curl stream");
        server.join().expect("fixture server");
        assert_eq!(response.status, 200);
        assert!(response.body.contains("Ответ 🙂"));
        assert!(!response.body.contains("SECRET"));
        assert_eq!(*chunks.lock().expect("fixture"), "Ответ 🙂");
    }
    #[test]
    fn real_curl_cancellation_reaps_child_and_rejects_truncated_success() {
        let body = "data: {\"choices\":[{\"delta\":{\"content\":\"Часть\"}}]}\n\n";
        let (url, server) = server(body, true);
        let token = Arc::new(AtomicBool::new(false));
        let cancel = Arc::clone(&token);
        let started = Instant::now();
        assert!(send(
            local_request(url),
            token,
            Arc::new(move |chunk| {
                if !chunk.text.is_empty() {
                    cancel.store(true, Ordering::SeqCst);
                }
            })
        )
        .is_err());
        assert!(started.elapsed() < Duration::from_secs(2));
        server.join().expect("fixture server");
        let (url, server) = self::server(body, false);
        assert!(send(
            local_request(url),
            Arc::new(AtomicBool::new(false)),
            Arc::new(|_| {})
        )
        .is_err());
        server.join().expect("fixture server");
    }
    #[test]
    fn decoder_streams_only_answer_content_and_requires_completion() {
        let chunks = Arc::new(std::sync::Mutex::new(Vec::new()));
        let collected = Arc::clone(&chunks);
        let observer: Observer =
            Arc::new(move |chunk| collected.lock().expect("fixture").push(chunk.text));
        let mut decoder = StreamDecoder::default();
        decoder.line(r#"data: {"choices":[{"delta":{"reasoning_content":"SECRET","content":"Привет "}}]}"#, &observer).expect("delta");
        decoder
            .line(
                r#"data: {"choices":[{"delta":{"content":"🙂"},"finish_reason":"stop"}]}"#,
                &observer,
            )
            .expect("delta");
        assert_eq!(decoder.text, "Привет 🙂");
        assert!(decoder.finished);
        assert!(!chunks.lock().expect("fixture").join("").contains("SECRET"));
        let mut ollama = StreamDecoder::default();
        ollama
            .line(r#"{"response":"Ответ","done":false}"#, &observer)
            .expect("ollama");
        assert!(!ollama.finished);
        ollama
            .line(r#"{"response":"","done":true}"#, &observer)
            .expect("done");
        assert!(ollama.finished);
        ollama
            .line(r#"{"error":"provider secret"}"#, &observer)
            .expect("retain HTTP status first");
        assert!(ollama.provider_error);
    }
}

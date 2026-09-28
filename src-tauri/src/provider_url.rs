use crate::data::{DataError, DataResult};
use url::{Host, Url};

#[derive(Clone, Copy)]
pub enum ProviderLocality {
    Cloud,
    Local,
}

fn invalid_url() -> DataError {
    DataError::InvalidInput(
        "Укажите корректный адрес модели (http или https) без логина и пароля".to_string(),
    )
}

pub fn is_local_destination(url: &Url) -> bool {
    match url.host() {
        Some(Host::Ipv4(ip)) => ip.is_private() || ip.is_loopback() || ip.is_link_local(),
        Some(Host::Ipv6(ip)) => {
            ip.is_loopback() || ip.is_unique_local() || ip.is_unicast_link_local()
        }
        Some(Host::Domain(host)) => {
            host.eq_ignore_ascii_case("localhost")
                || host.ends_with(".localhost")
                || host.ends_with(".local")
        }
        None => false,
    }
}

fn is_loopback_destination(url: &Url) -> bool {
    match url.host() {
        Some(Host::Ipv4(ip)) => ip.is_loopback(),
        Some(Host::Ipv6(ip)) => ip.is_loopback(),
        Some(Host::Domain(host)) => {
            host.eq_ignore_ascii_case("localhost") || host.ends_with(".localhost")
        }
        None => false,
    }
}

pub fn normalize_provider_url(value: &str, locality: ProviderLocality) -> DataResult<String> {
    let trimmed = value.trim();
    let url = Url::parse(trimmed).map_err(|_| invalid_url())?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || trimmed.chars().any(char::is_whitespace)
        || (url.scheme() == "http" && !is_local_destination(&url))
        || (matches!(locality, ProviderLocality::Cloud)
            && url.scheme() != "https"
            && !is_loopback_destination(&url))
    {
        return Err(invalid_url());
    }
    Ok(url.as_str().trim_end_matches('/').to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_bridge_ollama_and_local_lan() {
        assert_eq!(
            normalize_provider_url(
                "https://bridge-back.admlr.lipetsk.ru/api/v1/",
                ProviderLocality::Cloud
            )
            .unwrap(),
            "https://bridge-back.admlr.lipetsk.ru/api/v1"
        );
        assert_eq!(
            normalize_provider_url("HTTPS://EXAMPLE.COM/v1/", ProviderLocality::Cloud).unwrap(),
            "https://example.com/v1"
        );
        assert!(normalize_provider_url("http://localhost:11434", ProviderLocality::Local).is_ok());
        assert!(
            normalize_provider_url("http://127.0.0.1:1234/v1", ProviderLocality::Cloud).is_ok()
        );
        assert!(
            normalize_provider_url("http://192.168.1.42:11434", ProviderLocality::Local).is_ok()
        );
        assert!(normalize_provider_url("http://[::1]:11434", ProviderLocality::Local).is_ok());
    }

    #[test]
    fn rejects_unsafe_or_ambiguous_destinations() {
        for value in [
            "javascript:alert(1)",
            "file:///tmp/key",
            "data:text/plain,x",
            "ftp://example.com",
            "https://user:password@example.com",
            "https://example.com/?key=secret",
            "https://",
            "http://api.example.com/v1",
            "https://example.com/path#fragment",
        ] {
            assert!(
                normalize_provider_url(value, ProviderLocality::Cloud).is_err(),
                "{value}"
            );
        }
        assert!(
            normalize_provider_url("http://api.example.com/v1", ProviderLocality::Local).is_err()
        );
        assert!(normalize_provider_url("http://192.168.1.42/v1", ProviderLocality::Cloud).is_err());
    }
}

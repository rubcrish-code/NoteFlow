use crate::data::{DataError, DataResult};
use std::{
    collections::HashSet,
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
};
use uuid::Uuid;
use zip::{write::SimpleFileOptions, ZipArchive, ZipWriter};

pub const MAX_EXPORT_BYTES: usize = 256 * 1024 * 1024;

pub struct PortableAsset {
    pub id: String,
    pub source: PathBuf,
    pub name: String,
    pub mime: String,
    pub references: Vec<String>,
}

pub struct PortableNote {
    pub title: String,
    pub markdown: String,
    pub assets: Vec<PortableAsset>,
}

pub fn filename(title: &str) -> String {
    // Reserve room for extensions and collision suffixes on byte-limited filesystems.
    let mut value = String::new();
    for character in title.chars() {
        let safe = if character.is_control() || "<>:\"/\\|?*".contains(character) {
            '_'
        } else {
            character
        };
        if value.len() + safe.len_utf8() > 180 {
            break;
        }
        value.push(safe);
    }
    let value = value.trim().trim_matches('.').trim_end().to_string();
    let base = value.split('.').next().unwrap_or("").to_ascii_uppercase();
    let reserved = matches!(base.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (base.len() == 4
            && (base.starts_with("COM") || base.starts_with("LPT"))
            && matches!(base.as_bytes()[3], b'1'..=b'9'));
    if value.is_empty() {
        "Заметка".into()
    } else if reserved {
        format!("_{value}")
    } else {
        value
    }
}

pub fn unique_name(preferred: &str, used: &mut HashSet<String>) -> String {
    let path = Path::new(preferred);
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Заметка");
    let extension = path.extension().and_then(|s| s.to_str()).unwrap_or("");
    let mut result = preferred.to_string();
    let mut index = 2;
    while !used.insert(result.to_lowercase()) {
        result = format!(
            "{stem} ({index}){}",
            if extension.is_empty() {
                String::new()
            } else {
                format!(".{extension}")
            }
        );
        index += 1;
    }
    result
}

pub fn validate_destination(path: &Path, extension: &str, profile: &Path) -> DataResult<()> {
    let parent = path
        .parent()
        .filter(|p| p.is_dir())
        .ok_or_else(|| DataError::InvalidInput("Выберите существующую папку".into()))?;
    if !path.is_absolute()
        || path.is_dir()
        || path
            .extension()
            .and_then(|s| s.to_str())
            .is_none_or(|s| !s.eq_ignore_ascii_case(extension))
        || filename(path.file_stem().and_then(|s| s.to_str()).unwrap_or(""))
            != path.file_stem().and_then(|s| s.to_str()).unwrap_or("")
        || parent.canonicalize()?.starts_with(profile.canonicalize()?)
    {
        return Err(DataError::InvalidInput(
            "Выберите безопасное место сохранения вне профиля".into(),
        ));
    }
    Ok(())
}

pub fn atomic_write(
    path: &Path,
    write: impl FnOnce(&mut File) -> DataResult<()>,
    validate: impl FnOnce(&Path) -> DataResult<()>,
) -> DataResult<()> {
    let temp = path.with_extension(format!("{}.tmp", Uuid::new_v4()));
    let result = (|| {
        let mut file = File::create_new(&temp)?;
        write(&mut file)?;
        file.sync_all()?;
        drop(file);
        validate(&temp)?;
        fs::rename(&temp, path)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(temp);
    }
    result
}

fn portable_markdown(
    note: &PortableNote,
    folder: &str,
    names: &std::collections::HashMap<String, String>,
) -> String {
    let mut markdown = note.markdown.clone();
    for asset in &note.assets {
        if let Some(name) = names.get(&asset.id) {
            let relative = format!("{folder}/{name}");
            // Markdown destinations need escaped whitespace, not filesystem renaming.
            let encoded = relative
                .replace('%', "%25")
                .replace(' ', "%20")
                .replace('(', "%28")
                .replace(')', "%29")
                .replace('#', "%23");
            for reference in &asset.references {
                markdown = markdown.replace(reference, &encoded);
            }
        }
    }
    markdown
}

pub fn write_markdown(path: &Path, note: PortableNote) -> DataResult<()> {
    let folder = format!(
        "{}.assets-{}",
        filename(
            path.file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Заметка")
        ),
        &Uuid::new_v4().to_string()[..8]
    );
    let directory = path.with_file_name(&folder);
    let mut names = std::collections::HashMap::new();
    let mut used = HashSet::new();
    let mut created_directory = false;
    let result = (|| {
        if !note.assets.is_empty() {
            fs::create_dir(&directory)?;
            created_directory = true;
        }
        for asset in &note.assets {
            let name = unique_name(&filename(&asset.name), &mut used);
            fs::copy(&asset.source, directory.join(&name))?;
            names.insert(asset.id.clone(), name);
        }
        let markdown = portable_markdown(&note, &folder, &names);
        atomic_write(
            path,
            |file| {
                file.write_all(markdown.as_bytes())?;
                Ok(())
            },
            |temp| {
                let bytes = fs::read(temp)?;
                std::str::from_utf8(&bytes).map_err(|_| DataError::Serialization)?;
                Ok(())
            },
        )
    })();
    if result.is_err() && created_directory {
        let _ = fs::remove_dir_all(&directory);
    }
    result
}

pub fn write_project(path: &Path, notes: Vec<PortableNote>) -> DataResult<()> {
    atomic_write(
        path,
        |file| {
            let mut zip = ZipWriter::new(file);
            let options =
                SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
            let mut names = std::collections::HashMap::new();
            let mut used = HashSet::new();
            for note in &notes {
                for asset in &note.assets {
                    if names.contains_key(&asset.id) {
                        continue;
                    }
                    let name = unique_name(&filename(&asset.name), &mut used);
                    zip.start_file(format!("assets/{name}"), options)?;
                    std::io::copy(&mut File::open(&asset.source)?, &mut zip)?;
                    names.insert(asset.id.clone(), name);
                }
            }
            used.clear();
            for note in &notes {
                let name = unique_name(&format!("{}.md", filename(&note.title)), &mut used);
                zip.start_file(name, options)?;
                zip.write_all(portable_markdown(note, "assets", &names).as_bytes())?;
            }
            zip.finish()?;
            Ok(())
        },
        validate_zip,
    )
}

fn validate_zip(path: &Path) -> DataResult<()> {
    let mut zip = ZipArchive::new(File::open(path)?)?;
    for index in 0..zip.len() {
        let mut entry = zip.by_index(index)?;
        if entry.enclosed_name().is_none() {
            return Err(DataError::InvalidInput("Недопустимое имя файла".into()));
        }
        std::io::copy(&mut entry, &mut std::io::sink())?;
    }
    Ok(())
}

pub fn write_document(path: &Path, format: &str, bytes: &[u8]) -> DataResult<()> {
    if bytes.len() > MAX_EXPORT_BYTES || bytes.is_empty() {
        return Err(DataError::InvalidInput(
            "Недопустимый размер экспорта".into(),
        ));
    }
    atomic_write(
        path,
        |file| {
            file.write_all(bytes)?;
            Ok(())
        },
        |temp| match format {
            "txt" => {
                std::str::from_utf8(bytes).map_err(|_| DataError::Serialization)?;
                Ok(())
            }
            "pdf"
                if bytes.starts_with(b"%PDF-") && bytes.windows(5).rev().any(|w| w == b"%%EOF") =>
            {
                Ok(())
            }
            "docx" => {
                validate_zip(temp)?;
                let mut zip = ZipArchive::new(File::open(temp)?)?;
                for name in ["[Content_Types].xml", "word/document.xml", "_rels/.rels"] {
                    let mut value = String::new();
                    zip.by_name(name)?.read_to_string(&mut value)?;
                }
                Ok(())
            }
            _ => Err(DataError::InvalidInput(
                "Некорректный формат документа".into(),
            )),
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn safe_unicode_names_and_collisions() {
        assert_eq!(filename("Документация API"), "Документация API");
        for title in ["文".repeat(200), "🙂".repeat(200), "я".repeat(200)] {
            assert!(filename(&title).len() <= 180);
        }
        for name in ["CON", "PRN", "COM1", "LPT9"] {
            assert!(filename(name).starts_with('_'));
        }
        for name in ["../evil", "A/B", "name:", "..."] {
            assert!(!filename(name).contains('/'));
        }
        let mut used = HashSet::new();
        assert_eq!(unique_name("Заметка.md", &mut used), "Заметка.md");
        assert_eq!(unique_name("заметка.md", &mut used), "заметка (2).md");
    }
    #[test]
    fn failed_validation_preserves_destination_and_cleans_temp() -> DataResult<()> {
        let directory = std::env::temp_dir().join(format!("noteflow-export-{}", Uuid::new_v4()));
        fs::create_dir(&directory)?;
        let path = directory.join("test.pdf");
        fs::write(&path, b"previous")?;
        assert!(write_document(&path, "pdf", b"invalid").is_err());
        assert_eq!(fs::read(&path)?, b"previous");
        assert_eq!(fs::read_dir(&directory)?.count(), 1);
        fs::remove_dir_all(directory)?;
        Ok(())
    }

    #[test]
    fn project_zip_is_portable_unicode_deduplicated_and_has_no_internal_metadata() -> DataResult<()>
    {
        let directory =
            std::env::temp_dir().join(format!("noteflow-project-export-{}", Uuid::new_v4()));
        fs::create_dir(&directory)?;
        let source = directory.join("source.png");
        fs::write(&source, b"fixture image bytes")?;
        let notes = ["Одинаковое название", "Одинаковое название", "../CON"]
            .into_iter()
            .map(|title| PortableNote {
                title: title.into(),
                markdown: "# Русский текст\n![Схема](noteflow-asset://localhost/asset)".into(),
                assets: vec![PortableAsset {
                    id: "asset".into(),
                    source: source.clone(),
                    name: "Схема.png".into(),
                    mime: "image/png".into(),
                    references: vec!["noteflow-asset://localhost/asset".into()],
                }],
            })
            .collect();
        let path = directory.join("project.zip");
        write_project(&path, notes)?;
        let mut zip = ZipArchive::new(File::open(&path)?)?;
        assert_eq!(zip.len(), 4);
        assert!(zip.by_name("Одинаковое название.md").is_ok());
        assert!(zip.by_name("Одинаковое название (2).md").is_ok());
        for index in 0..zip.len() {
            let mut entry = zip.by_index(index)?;
            assert!(entry.enclosed_name().is_some());
            assert!(!entry.name().ends_with(".json"));
            if entry.name().ends_with(".md") {
                let mut text = String::new();
                entry.read_to_string(&mut text)?;
                assert!(text.contains("assets/Схема.png"));
                assert!(!text.contains("noteflow-asset:"));
            }
        }
        drop(zip);
        fs::remove_dir_all(directory)?;
        Ok(())
    }

    #[test]
    fn missing_asset_preserves_previous_markdown_and_zip() -> DataResult<()> {
        let directory =
            std::env::temp_dir().join(format!("noteflow-export-fault-{}", Uuid::new_v4()));
        fs::create_dir(&directory)?;
        for extension in ["md", "zip"] {
            let path = directory.join(format!("old.{extension}"));
            fs::write(&path, b"previous document")?;
            let note = PortableNote {
                title: "Заметка".into(),
                markdown: "asset".into(),
                assets: vec![PortableAsset {
                    id: "asset".into(),
                    source: directory.join("missing.png"),
                    name: "image.png".into(),
                    mime: "image/png".into(),
                    references: vec!["asset".into()],
                }],
            };
            let result = if extension == "md" {
                write_markdown(&path, note)
            } else {
                write_project(&path, vec![note])
            };
            assert!(result.is_err());
            assert_eq!(fs::read(path)?, b"previous document");
        }
        assert_eq!(fs::read_dir(&directory)?.count(), 2);
        fs::remove_dir_all(directory)?;
        Ok(())
    }

    #[test]
    fn destination_rejects_profile_relative_invalid_and_wrong_extension() -> DataResult<()> {
        let directory =
            std::env::temp_dir().join(format!("noteflow-export-path-{}", Uuid::new_v4()));
        let profile = directory.join("profile");
        fs::create_dir_all(&profile)?;
        for path in [
            PathBuf::from("relative.md"),
            profile.join("note.md"),
            directory.join("CON.md"),
            directory.join("note.exe"),
            directory.join("missing/note.md"),
        ] {
            assert!(validate_destination(&path, "md", &profile).is_err());
        }
        assert!(validate_destination(&directory.join("Документация.md"), "md", &profile).is_ok());
        fs::remove_dir_all(directory)?;
        Ok(())
    }

    #[test]
    fn successful_write_replaces_only_after_validation() -> DataResult<()> {
        let directory =
            std::env::temp_dir().join(format!("noteflow-export-replace-{}", Uuid::new_v4()));
        fs::create_dir(&directory)?;
        let path = directory.join("old.txt");
        fs::write(&path, b"previous")?;
        write_document(&path, "txt", "Русский текст".as_bytes())?;
        assert_eq!(fs::read_to_string(&path)?, "Русский текст");
        assert_eq!(fs::read_dir(&directory)?.count(), 1);
        fs::remove_dir_all(directory)?;
        Ok(())
    }
}

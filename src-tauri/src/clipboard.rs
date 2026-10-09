use serde::Serialize;

const MAX_TEXT_BYTES: usize = 4 * 1024 * 1024;
const MAX_IMAGE_BYTES: usize = 25 * 1024 * 1024;
const MAX_IMAGE_PIXELS: u64 = 16 * 1024 * 1024;

pub(crate) fn decode_png(bytes: &[u8]) -> Result<image::RgbaImage, String> {
    use std::io::Cursor;
    let error = || "Не удалось подготовить изображение".to_string();
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err(error());
    }
    let mut reader = image::ImageReader::with_format(Cursor::new(bytes), image::ImageFormat::Png);
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(8192);
    limits.max_image_height = Some(8192);
    limits.max_alloc = Some(128 * 1024 * 1024);
    reader.limits(limits);
    let image = reader.decode().map_err(|_| error())?;
    if u64::from(image.width()) * u64::from(image.height()) > MAX_IMAGE_PIXELS {
        return Err(error());
    }
    Ok(image.into_rgba8())
}

#[tauri::command]
pub async fn copy_image_clipboard(bytes: Vec<u8>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let image = decode_png(&bytes)?;
        arboard::Clipboard::new()
            .and_then(|mut clipboard| {
                clipboard.set_image(arboard::ImageData {
                    width: image.width() as usize,
                    height: image.height() as usize,
                    bytes: std::borrow::Cow::Owned(image.into_raw()),
                })
            })
            .map_err(|_| "Не удалось скопировать изображение".to_string())
    })
    .await
    .map_err(|_| "Не удалось скопировать изображение".to_string())?
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardContent {
    pub text: String,
    pub html: String,
}

#[derive(Default)]
pub(crate) struct ClipboardPayload {
    pub text: String,
    pub html: String,
    pub files: Vec<std::path::PathBuf>,
    pub image: Option<Vec<u8>>,
}

pub(crate) const MAX_CLIPBOARD_FILES: usize = 32;

fn encode_bitmap(image: image::RgbaImage) -> Result<Vec<u8>, String> {
    if u64::from(image.width()) * u64::from(image.height()) > MAX_IMAGE_PIXELS {
        return Err("Изображение в буфере слишком большое".into());
    }
    let mut output = std::io::Cursor::new(Vec::new());
    image
        .write_to(&mut output, image::ImageFormat::Png)
        .map_err(|_| "Не удалось прочитать изображение из буфера".to_string())?;
    if output.get_ref().len() > MAX_IMAGE_BYTES {
        return Err("Изображение в буфере слишком большое".into());
    }
    Ok(output.into_inner())
}

#[cfg(any(windows, test))]
fn packed_dib_to_bmp(bytes: &[u8]) -> Result<Vec<u8>, String> {
    let error = || "Не удалось прочитать изображение из буфера".to_string();
    let read_u32 = |offset: usize| -> Result<u32, String> {
        let field: [u8; 4] = bytes
            .get(offset..offset + 4)
            .ok_or_else(error)?
            .try_into()
            .map_err(|_| error())?;
        Ok(u32::from_le_bytes(field))
    };
    let header_size = read_u32(0)? as usize;
    if !matches!(header_size, 40 | 52 | 56 | 108 | 124) || bytes.len() < header_size {
        return Err(error());
    }
    let bit_count = u16::from_le_bytes([bytes[14], bytes[15]]);
    let compression = read_u32(16)?;
    let colors = read_u32(32)?;
    let colors = if colors == 0 && bit_count <= 8 {
        1u32.checked_shl(u32::from(bit_count)).ok_or_else(error)?
    } else {
        colors
    };
    if colors > 256 {
        return Err(error());
    }
    // Packed clipboard DIBs use in-header masks for V4/V5, not another 12-byte mask block.
    // Give the standard BMP decoder an explicit pixel offset instead of its inferred DIB offset.
    let mask_bytes = if header_size == 40 && compression == 3 {
        12
    } else {
        0
    };
    let pixel_offset = 14 + header_size + mask_bytes + colors as usize * 4;
    if pixel_offset >= bytes.len() + 14 {
        return Err(error());
    }
    if header_size == 124 && (read_u32(112)? != 0 || read_u32(116)? != 0) {
        return Err(error());
    }
    let mut bmp = Vec::with_capacity(bytes.len() + 14);
    bmp.extend_from_slice(b"BM");
    bmp.extend_from_slice(&((bytes.len() + 14) as u32).to_le_bytes());
    bmp.extend_from_slice(&[0; 4]);
    bmp.extend_from_slice(&(pixel_offset as u32).to_le_bytes());
    bmp.extend_from_slice(bytes);
    // Chromium can supply BI_RGB with an explicit alpha mask; preserve that declared transparency.
    if header_size >= 108 && bit_count == 32 && compression == 0 && read_u32(52)? == 0xff000000 {
        bmp[30..34].copy_from_slice(&3u32.to_le_bytes());
        if read_u32(40)? == 0 && read_u32(44)? == 0 && read_u32(48)? == 0 {
            for (offset, value) in [(40, 0x00ff0000u32), (44, 0x0000ff00), (48, 0x000000ff)] {
                bmp[14 + offset..18 + offset].copy_from_slice(&value.to_le_bytes());
            }
        }
    }
    Ok(bmp)
}

#[cfg(any(windows, test))]
fn decode_clipboard_image(bytes: &[u8], dib: bool) -> Result<Vec<u8>, String> {
    use image::ImageDecoder;
    let error = || "Не удалось прочитать изображение из буфера".to_string();
    if bytes.len()
        > if dib {
            128 * 1024 * 1024
        } else {
            MAX_IMAGE_BYTES
        }
    {
        return Err(error());
    }
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(8192);
    limits.max_image_height = Some(8192);
    limits.max_alloc = Some(128 * 1024 * 1024);
    let bitmap = if dib {
        let bmp = packed_dib_to_bmp(bytes)?;
        let mut decoder =
            image::codecs::bmp::BmpDecoder::new(std::io::Cursor::new(bmp)).map_err(|_| error())?;
        let (width, height) = decoder.dimensions();
        if u64::from(width) * u64::from(height) > MAX_IMAGE_PIXELS {
            return Err(error());
        }
        decoder.set_limits(limits).map_err(|_| error())?;
        image::DynamicImage::from_decoder(decoder).map_err(|_| error())?
    } else {
        let mut reader = image::ImageReader::new(std::io::Cursor::new(bytes))
            .with_guessed_format()
            .map_err(|_| error())?;
        if !matches!(
            reader.format(),
            Some(image::ImageFormat::Png | image::ImageFormat::Jpeg | image::ImageFormat::WebP)
        ) {
            return Err(error());
        }
        reader.limits(limits);
        reader.decode().map_err(|_| error())?
    };
    encode_bitmap(bitmap.into_rgba8())
}

fn bounded_content(text: String, html: String) -> Result<ClipboardContent, String> {
    if text.len() > MAX_TEXT_BYTES || html.len() > MAX_TEXT_BYTES {
        return Err("Содержимое буфера обмена слишком большое".into());
    }
    Ok(ClipboardContent { text, html })
}

pub(crate) fn read_content() -> Result<ClipboardPayload, String> {
    #[cfg(windows)]
    let sequence = windows::sequence();
    #[cfg(windows)]
    if let Some(payload) = windows::read_assets()? {
        return Ok(payload);
    }

    let mut clipboard =
        arboard::Clipboard::new().map_err(|_| "Буфер обмена недоступен".to_string())?;
    #[cfg(not(windows))]
    {
        if let Ok(files) = clipboard.get().file_list() {
            if !files.is_empty() {
                if files.len() > MAX_CLIPBOARD_FILES {
                    return Err("Вставляйте не больше 32 файлов за один раз".into());
                }
                return Ok(ClipboardPayload {
                    files,
                    ..Default::default()
                });
            }
        }
        match clipboard.get_image() {
            Ok(bitmap) => {
                let pixels = bitmap
                    .width
                    .checked_mul(bitmap.height)
                    .filter(|size| *size as u64 <= MAX_IMAGE_PIXELS)
                    .ok_or_else(|| "Изображение в буфере слишком большое".to_string())?;
                if bitmap.bytes.len() != pixels * 4 {
                    return Err("Некорректное изображение в буфере".into());
                }
                let image = image::RgbaImage::from_raw(
                    bitmap.width as u32,
                    bitmap.height as u32,
                    bitmap.bytes.into_owned(),
                )
                .ok_or_else(|| "Некорректное изображение в буфере".to_string())?;
                return Ok(ClipboardPayload {
                    image: Some(encode_bitmap(image)?),
                    ..Default::default()
                });
            }
            Err(arboard::Error::ContentNotAvailable) => {}
            Err(_) => return Err("Не удалось прочитать изображение из буфера".into()),
        }
    }
    // Reading is explicit, only when the user invokes Paste. Never log either format.
    let html = clipboard.get().html().unwrap_or_default();
    let text = clipboard.get_text().unwrap_or_default();
    #[cfg(windows)]
    if sequence != windows::sequence() {
        return Err("Буфер обмена изменился. Повторите вставку.".into());
    }
    let content = bounded_content(text, html)?;
    Ok(ClipboardPayload {
        text: content.text,
        html: content.html,
        ..Default::default()
    })
}

#[cfg(windows)]
mod windows {
    use super::*;
    use std::ffi::c_void;
    #[link(name = "user32")]
    extern "system" {
        fn OpenClipboard(window: *mut c_void) -> i32;
        fn CloseClipboard() -> i32;
        fn IsClipboardFormatAvailable(format: u32) -> i32;
        fn GetClipboardData(format: u32) -> *mut c_void;
        fn RegisterClipboardFormatW(name: *const u16) -> u32;
        fn GetClipboardSequenceNumber() -> u32;
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn GlobalSize(handle: *mut c_void) -> usize;
        fn GlobalLock(handle: *mut c_void) -> *mut c_void;
        fn GlobalUnlock(handle: *mut c_void) -> i32;
    }
    #[link(name = "shell32")]
    extern "system" {
        fn DragQueryFileW(drop: *mut c_void, index: u32, file: *mut u16, size: u32) -> u32;
    }
    struct Open;
    impl Drop for Open {
        fn drop(&mut self) {
            unsafe {
                CloseClipboard();
            }
        }
    }
    pub fn sequence() -> u32 {
        unsafe { GetClipboardSequenceNumber() }
    }

    pub fn read_assets() -> Result<Option<ClipboardPayload>, String> {
        let error = || "Не удалось прочитать буфер обмена. Повторите вставку.".to_string();
        if unsafe { OpenClipboard(std::ptr::null_mut()) } == 0 {
            return Err(error());
        }
        let _open = Open;
        if unsafe { IsClipboardFormatAvailable(15) } != 0 {
            let handle = unsafe { GetClipboardData(15) };
            if handle.is_null() {
                return Err(error());
            }
            let count = unsafe { DragQueryFileW(handle, u32::MAX, std::ptr::null_mut(), 0) };
            if count == 0 || count as usize > MAX_CLIPBOARD_FILES {
                return Err("Вставляйте от 1 до 32 файлов за один раз".into());
            }
            let mut files = Vec::new();
            for index in 0..count {
                let size = unsafe { DragQueryFileW(handle, index, std::ptr::null_mut(), 0) };
                if size == 0 || size > 32768 {
                    return Err(error());
                }
                let mut name = vec![0u16; size as usize + 1];
                if unsafe { DragQueryFileW(handle, index, name.as_mut_ptr(), size + 1) } != size {
                    return Err(error());
                }
                let name = String::from_utf16(&name[..size as usize]).map_err(|_| error())?;
                files.push(std::path::PathBuf::from(name));
            }
            return Ok(Some(ClipboardPayload {
                files,
                ..Default::default()
            }));
        }
        let mut formats = Vec::new();
        for name in ["PNG", "image/png", "image/jpeg"] {
            let wide: Vec<u16> = name.encode_utf16().chain(Some(0)).collect();
            formats.push((unsafe { RegisterClipboardFormatW(wide.as_ptr()) }, false));
        }
        formats.extend([(17, true), (8, true)]);
        for (format, dib) in formats {
            if format == 0 || unsafe { IsClipboardFormatAvailable(format) } == 0 {
                continue;
            }
            let handle = unsafe { GetClipboardData(format) };
            if handle.is_null() {
                return Err(error());
            }
            let size = unsafe { GlobalSize(handle) };
            if size == 0
                || size
                    > if dib {
                        128 * 1024 * 1024
                    } else {
                        MAX_IMAGE_BYTES
                    }
            {
                return Err("Изображение в буфере слишком большое".into());
            }
            let address = unsafe { GlobalLock(handle) };
            if address.is_null() {
                return Err(error());
            }
            // Borrowed clipboard memory is copied only while locked and never freed by us.
            let bytes = unsafe { std::slice::from_raw_parts(address as *const u8, size) }.to_vec();
            unsafe {
                GlobalUnlock(handle);
            }
            drop(_open);
            return Ok(Some(ClipboardPayload {
                image: Some(decode_clipboard_image(&bytes, dib)?),
                ..Default::default()
            }));
        }
        Ok(None)
    }
}

#[tauri::command]
pub async fn write_editor_clipboard(text: String) -> Result<(), String> {
    if text.len() > MAX_TEXT_BYTES {
        return Err("Текст слишком большой для копирования".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        arboard::Clipboard::new()
            .and_then(|mut clipboard| clipboard.set_text(text))
            .map_err(|_| "Не удалось скопировать текст".to_string())
    })
    .await
    .map_err(|_| "Не удалось скопировать текст".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clipboard_normalizes_png_jpeg_webp_and_dib_to_real_png() {
        for format in [
            image::ImageFormat::Png,
            image::ImageFormat::Jpeg,
            image::ImageFormat::WebP,
            image::ImageFormat::Bmp,
        ] {
            let mut bytes = std::io::Cursor::new(Vec::new());
            image::RgbImage::from_pixel(3, 2, image::Rgb([12, 34, 56]))
                .write_to(&mut bytes, format)
                .expect("encode synthetic bitmap");
            let source = if format == image::ImageFormat::Bmp {
                &bytes.get_ref()[14..]
            } else {
                bytes.get_ref().as_slice()
            };
            let png = decode_clipboard_image(source, format == image::ImageFormat::Bmp)
                .expect("clipboard decode");
            let pixels = decode_png(&png).expect("normalized PNG");
            assert_eq!(pixels.dimensions(), (3, 2));
            assert_eq!(pixels.get_pixel(0, 0).0[3], 255);
            if format != image::ImageFormat::Jpeg {
                assert_eq!(pixels.get_pixel(0, 0).0, [12, 34, 56, 255]);
            }
        }
    }

    #[test]
    fn clipboard_dibv5_preserves_alpha_and_rejects_malformed_or_oversized_data() {
        let mut dib = vec![0u8; 128];
        for (offset, value) in [
            (0, 124u32),
            (4, 1),
            (8, 1),
            (16, 3),
            (20, 4),
            (40, 0x00ff0000),
            (44, 0x0000ff00),
            (48, 0x000000ff),
            (52, 0xff000000),
            (56, 0x73524742),
        ] {
            dib[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
        }
        dib[12..14].copy_from_slice(&1u16.to_le_bytes());
        dib[14..16].copy_from_slice(&32u16.to_le_bytes());
        dib[124..].copy_from_slice(&[56, 34, 12, 128]);
        let png = decode_clipboard_image(&dib, true).expect("DIBV5");
        assert_eq!(
            decode_png(&png).expect("PNG").get_pixel(0, 0).0,
            [12, 34, 56, 128]
        );
        assert!(decode_clipboard_image(b"private invalid bitmap", true).is_err());
        assert!(decode_clipboard_image(b"private invalid image", false).is_err());
        assert!(decode_clipboard_image(&vec![0; MAX_IMAGE_BYTES + 1], false).is_err());
        dib[4..8].copy_from_slice(&100_000u32.to_le_bytes());
        assert!(decode_clipboard_image(&dib, true).is_err());
    }

    #[test]
    fn image_transfer_decodes_real_pixels_and_rejects_invalid_payload() {
        let pixel = image::RgbaImage::from_pixel(2, 3, image::Rgba([12, 34, 56, 255]));
        let mut bytes = std::io::Cursor::new(Vec::new());
        pixel
            .write_to(&mut bytes, image::ImageFormat::Png)
            .expect("encode fixture");
        let decoded = decode_png(bytes.get_ref()).expect("decode pixels");
        assert_eq!(decoded.dimensions(), (2, 3));
        assert_eq!(decoded.get_pixel(0, 0).0, [12, 34, 56, 255]);
        assert!(decode_png(b"not a png secret").is_err());
        assert!(decode_png(&vec![0; MAX_IMAGE_BYTES + 1]).is_err());
    }

    #[test]
    fn clipboard_payload_is_bounded_and_preserves_unicode_and_html() {
        let content = bounded_content("Текст 🙂".into(), "<p><b>Текст 🙂</b></p>".into())
            .expect("bounded clipboard");
        assert_eq!(content.text, "Текст 🙂");
        assert!(content.html.contains("<b>"));
        let error = bounded_content("x".repeat(MAX_TEXT_BYTES + 1), "".into())
            .err()
            .expect("limit");
        assert!(!error.contains("xxx"));
        assert!(bounded_content("".into(), "x".repeat(MAX_TEXT_BYTES + 1)).is_err());
    }
}

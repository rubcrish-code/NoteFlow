#[cfg(any(windows, test))]
fn application_find_key(key: u32, control: bool, shift: bool, alt: bool) -> bool {
    !alt && ((key == 0x46 && control && !shift) || (key == 0x72 && !control))
}

#[cfg(windows)]
pub fn install(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    use webview2_com::{
        AcceleratorKeyPressedEventHandler,
        Microsoft::Web::WebView2::Win32::ICoreWebView2AcceleratorKeyPressedEventArgs2,
    };
    use windows::{
        core::Interface,
        Win32::UI::Input::KeyboardAndMouse::{GetKeyState, VK_CONTROL, VK_MENU, VK_SHIFT},
    };

    window.with_webview(|webview| {
        // COM and keyboard state are accessed on the WebView's UI thread.
        let result = unsafe {
            let handler = AcceleratorKeyPressedEventHandler::create(Box::new(|_, args| {
                let Some(args) = args else { return Ok(()) };
                let mut key = 0;
                args.VirtualKey(&mut key)?;
                if application_find_key(
                    key,
                    GetKeyState(i32::from(VK_CONTROL.0)) < 0,
                    GetKeyState(i32::from(VK_SHIFT.0)) < 0,
                    GetKeyState(i32::from(VK_MENU.0)) < 0,
                ) {
                    if let Ok(args) = args.cast::<ICoreWebView2AcceleratorKeyPressedEventArgs2>() {
                        // Do not SetHandled(true): the trusted DOM event must still reach NoteFlow.
                        args.SetIsBrowserAcceleratorKeyEnabled(false)?;
                    }
                }
                Ok(())
            }));
            webview
                .controller()
                .add_AcceleratorKeyPressed(&handler, &mut 0)
        };
        if result.is_err() {
            eprintln!("NoteFlow: application find shortcut initialization failed");
        }
    })
}

#[cfg(test)]
mod tests {
    use super::application_find_key;

    #[test]
    fn routes_control_f_but_not_other_control_shortcuts() {
        assert!(application_find_key(0x46, true, false, false));
        for key in [0x41, 0x43, 0x56, 0x58, 0x50, 0x52, 0x5a] {
            assert!(!application_find_key(key, true, false, false));
        }
    }

    #[test]
    fn leaves_plain_text_alt_and_extended_chords_untouched() {
        assert!(!application_find_key(0x46, false, false, false));
        assert!(!application_find_key(0x46, true, true, false));
        assert!(!application_find_key(0x46, true, false, true));
    }

    #[test]
    fn routes_f3_in_both_directions_without_capturing_modified_browser_keys() {
        assert!(application_find_key(0x72, false, false, false));
        assert!(application_find_key(0x72, false, true, false));
        assert!(!application_find_key(0x72, true, false, false));
        assert!(!application_find_key(0x72, false, false, true));
        assert!(!application_find_key(0x74, false, false, false));
    }
}

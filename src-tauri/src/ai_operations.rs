use crate::data::{DataError, DataResult};
use serde::Serialize;
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamChunk {
    pub text: String,
    pub reset: bool,
}

#[derive(Default)]
pub struct AiOperations(Mutex<HashMap<String, Arc<AtomicBool>>>);

impl AiOperations {
    pub fn begin(&self, id: &str) -> DataResult<Arc<AtomicBool>> {
        uuid::Uuid::parse_str(id)
            .map_err(|_| DataError::InvalidInput("Некорректный запрос ИИ".into()))?;
        let mut operations = self
            .0
            .lock()
            .map_err(|_| DataError::State("Запрос ИИ недоступен".into()))?;
        if operations.contains_key(id) || operations.len() >= 16 {
            return Err(DataError::InvalidInput("Запрос ИИ уже выполняется".into()));
        }
        let token = Arc::new(AtomicBool::new(false));
        operations.insert(id.into(), Arc::clone(&token));
        Ok(token)
    }
    pub fn finish(&self, id: &str) {
        if let Ok(mut operations) = self.0.lock() {
            operations.remove(id);
        }
    }
    pub fn cancel(&self, id: &str) {
        if let Ok(operations) = self.0.lock() {
            if let Some(token) = operations.get(id) {
                token.store(true, Ordering::SeqCst);
            }
        }
    }
}

pub fn check(token: &AtomicBool) -> DataResult<()> {
    if token.load(Ordering::SeqCst) {
        Err(DataError::InvalidInput("Запрос ИИ остановлен".into()))
    } else {
        Ok(())
    }
}

#[tauri::command]
pub fn cancel_ai_operation(request_id: String, state: tauri::State<'_, AiOperations>) {
    state.cancel(&request_id);
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn identities_are_unique_and_cancellation_is_scoped() {
        let operations = AiOperations::default();
        let a = uuid::Uuid::new_v4().to_string();
        let b = uuid::Uuid::new_v4().to_string();
        let token_a = operations.begin(&a).expect("A");
        let token_b = operations.begin(&b).expect("B");
        assert!(operations.begin(&a).is_err());
        operations.cancel(&a);
        assert!(check(&token_a).is_err());
        assert!(check(&token_b).is_ok());
        operations.finish(&a);
        assert!(operations.begin(&a).is_ok());
        assert!(operations.begin("invalid").is_err());
    }
}

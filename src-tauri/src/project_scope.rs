use crate::data::{DataError, DataResult};

// Only mutable chat filters are reconciled. Message snapshots retain the scope
// of the original request for Retry. Empty explicit scope must not broaden to ALL.
pub const MIGRATION_SQL: &str = r#"
    UPDATE ai_chats SET project_scope_json = (
        SELECT json_group_array(value) FROM json_each(ai_chats.project_scope_json)
        WHERE value IN (SELECT id FROM projects WHERE archived_at IS NULL)
    ) WHERE scope = 'rag' AND project_scope_json IS NOT NULL;
    CREATE TRIGGER rag_scope_project_archive AFTER UPDATE OF archived_at ON projects
    WHEN new.archived_at IS NOT NULL
    BEGIN
        UPDATE ai_chats SET project_scope_json = (
            SELECT json_group_array(value) FROM json_each(ai_chats.project_scope_json)
            WHERE value <> new.id
        ) WHERE scope = 'rag' AND project_scope_json IS NOT NULL;
    END;
    CREATE TRIGGER rag_scope_project_delete AFTER DELETE ON projects
    BEGIN
        UPDATE ai_chats SET project_scope_json = (
            SELECT json_group_array(value) FROM json_each(ai_chats.project_scope_json)
            WHERE value <> old.id
        ) WHERE scope = 'rag' AND project_scope_json IS NOT NULL;
    END;
"#;

pub fn decode(value: Option<String>) -> DataResult<Option<Vec<String>>> {
    value
        .map(|json| {
            let ids: Vec<String> = serde_json::from_str(&json)?;
            if ids.len() > 1_000 || ids.iter().any(|id| id.is_empty() || id.len() > 128) {
                return Err(DataError::InvalidInput(
                    "Некорректный фильтр проектов".into(),
                ));
            }
            Ok(ids)
        })
        .transpose()
}

// NULL is the whole active database, not a snapshot of existing project IDs.
pub fn encode_ids(ids: Option<&[String]>) -> Option<String> {
    ids.map(|ids| serde_json::json!(ids).to_string())
}

// One bound object represents the union; an inferred project narrows both parts.
pub fn sql_value(
    explicit: Option<&[String]>,
    inferred: Option<&str>,
    include_standalone: bool,
) -> Option<String> {
    match (explicit, inferred) {
        (None, None) => None,
        (None, Some(id)) => {
            Some(serde_json::json!({"projectIds":[id], "includeStandalone":false}).to_string())
        }
        (Some(ids), inferred) => Some(
            serde_json::json!({"projectIds":ids
                .iter()
                .filter(|id| inferred.is_none_or(|filter| id.as_str() == filter))
                .collect::<Vec<_>>(), "includeStandalone":include_standalone && inferred.is_none()})
            .to_string(),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn all_union_and_disjoint_intersection_are_distinct() {
        assert_eq!(sql_value(None, None, false), None);
        let ids = vec!["a".into(), "b".into()];
        assert_eq!(
            sql_value(Some(&ids), None, false),
            Some(serde_json::json!({"projectIds":["a","b"],"includeStandalone":false}).to_string())
        );
        assert_eq!(
            sql_value(Some(&ids), Some("b"), true),
            Some(serde_json::json!({"projectIds":["b"],"includeStandalone":false}).to_string())
        );
        assert_eq!(
            sql_value(Some(&ids), Some("c"), true),
            Some(serde_json::json!({"projectIds":[],"includeStandalone":false}).to_string())
        );
    }
    #[test]
    fn rejects_malformed_and_unbounded_scope_without_broadening() {
        assert_eq!(decode(None).expect("all"), None);
        assert!(decode(Some("{}".into())).is_err());
        assert!(decode(Some("[\"\"]".into())).is_err());
        assert!(decode(Some(serde_json::json!(vec!["x"; 1001]).to_string())).is_err());
    }
}

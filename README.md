# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Rust tests

Run the deterministic Rust test suite from `src-tauri`:

```bash
cargo test
```

The FTS5 performance probe is intentionally excluded from the regular suite because wall-clock assertions are sensitive to concurrent CPU and disk load. Run it in isolation on an otherwise idle machine:

```bash
cargo test search::tests::search_performance_on_ten_thousand_notes -- --ignored --exact --nocapture --test-threads=1
```

The probe reports database setup, search schema setup, fixture generation, indexing, and query time separately. Its existing limits remain 30 seconds for indexing 10,000 notes and 5 seconds for the query.

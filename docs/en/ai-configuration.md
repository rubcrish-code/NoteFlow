# AI configuration

[Documentation](README.md)

Open **Settings → AI models**. Generative models and semantic search models have separate sections. A generative model writes answers; an embedding model creates vectors used to retrieve related text. One does not substitute for the other.

## Generative connection

1. Choose the provider type: Ollama, LM Studio, OpenAI-compatible or a custom API.
2. Give the connection a local name and enter the base URL.
3. Enter an API key if the server requires it.
4. Select **Get model list**. The list is requested from the server; Refresh makes another request. If discovery is unavailable, enter the exact model ID manually.
5. Test the connection and save it. Select the default connection for assistant and note-chat actions.

Model discovery does not guarantee that every listed model supports chat or embeddings. Capability metadata is used when available; otherwise, test the intended operation. A discovery failure must not invalidate a manually entered model.

## Local servers

| Server | Common address | Notes |
| --- | --- | --- |
| Ollama | `http://127.0.0.1:11434` | Start Ollama and install a model first. Do not add `/v1` to its native API base URL. |
| LM Studio | `http://localhost:1234/v1` | Load a model and start its local server. |

These addresses are examples, not a promise about your server configuration. Keep model IDs exactly as reported by your provider.

## OpenAI-compatible and custom services

Use the provider’s documented URL, model and API key. Custom connections expose relative model-list, chat and embedding paths and nonsecret HTTP headers. Do not put `Authorization`, keys, tokens or other secret values in the headers JSON; use the API-key field.

Saved keys are not returned to the form. Leave the key field blank to keep an existing key unless you explicitly choose deletion. Provider names, URLs, model IDs and configuration values are not translated.

## Semantic search and knowledge chat

Configure an embedding profile separately. Test it, grant cloud-processing consent if applicable, and inspect index progress. Notes are queued for reconciliation after saving. Derived chunks and vectors can be rebuilt without changing the notes themselves.

Knowledge chat can search all active notes, selected projects, notes outside projects, or a supported combination. Sources are saved as historical snapshots. A deleted or changed note does not turn its historical source text into a current document.

## Privacy

Local means data stays on this device only if the server really runs locally. External providers receive the selected note/context/excerpts after consent. Model list and connection tests are real network operations. API keys stay in OS secure storage and are not exported with backups.

Streaming and stop behavior depend on server support. NoteFlow does not translate existing model answers or chat history when the UI language changes. See [Security and privacy](security-privacy.md) and [Troubleshooting](troubleshooting.md).

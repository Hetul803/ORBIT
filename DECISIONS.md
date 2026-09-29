# Engineering decisions

Each choice below resolves an implementation detail the product brief intentionally left open.

| Decision                                                                                     | Reasoning                                                                                                   |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| pnpm workspaces plus Turborepo                                                               | Gives deterministic installs, dependency-aware gates, and small independently testable packages.            |
| TypeScript strict mode everywhere                                                            | Privacy and consent code benefits from explicit nullability and exhaustiveness.                             |
| Expo SDK 57 with Expo Router                                                                 | One route-based codebase generates iOS, Android, and a static web build.                                    |
| Fastify 5                                                                                    | Schema-friendly performance, simple plugin boundaries, WebSockets, and low operational overhead.            |
| PostgreSQL 16 with pgvector and Prisma 7                                                     | Relational constraints protect consent flows while vector columns leave a clean semantic-retrieval path.    |
| Redis plus BullMQ                                                                            | Durable recurring jobs and concurrency limits are more reliable than in-process timers.                     |
| MinIO in local Compose                                                                       | It exercises an S3-compatible deployment shape without a cloud account.                                     |
| Email OTP and JWT access/rotating refresh tokens                                             | Passwordless onboarding is low-friction while server-side refresh revocation remains possible.              |
| Date-of-birth hard gate before account creation                                              | The product is adult-only and cannot safely treat the restriction as a dismissible notice.                  |
| `.edu` and phone verification remain optional                                                | They increase trust and unlock context without blocking useful first-run value.                             |
| Raw imports are parsed in memory and discarded                                               | Durable preferences are useful; retaining complete third-party archives creates unnecessary privacy risk.   |
| Voice calibration stores aggregate style labels, not imported quotes                         | The agent can sound familiar without duplicating private conversation content.                              |
| Regex plus model redaction, failing closed                                                   | Two distinct detectors reduce leakage, and uncertain content must never be surfaced.                        |
| Only redacted turns are persisted                                                            | A hash supports integrity and debugging without keeping original PII-bearing model output.                  |
| Independent judge sees only redacted transcripts                                             | Compatibility scoring cannot become an alternate path around the privacy firewall.                          |
| Mutual field-intersection reveal                                                             | Two approvals alone are insufficient; only fields selected by both people appear.                           |
| Reveal and inbox decisions are immutable                                                     | A durable human decision boundary is safer and easier to audit than silent rewrites.                        |
| Append-only activity records enforced in SQL                                                 | Application code cannot quietly erase or rewrite the history it is meant to prove.                          |
| Deletion has a seven-day grace period                                                        | It permits recovery from accidental requests while the worker reliably scrubs personal relations afterward. |
| Minimal anonymized audit tombstones survive deletion                                         | Security and abuse accountability remain without preserving user-authored content or contact data.          |
| LLM models are selected per task by environment                                              | Cheap classification and high-quality judgment can evolve independently without code changes.               |
| User BYOK overrides the selected provider key                                                | A user can fund their own calls while the same cap, ledger, redaction, and retry controls still apply.      |
| BYOK uses AES-256-GCM field encryption                                                       | Authenticated encryption detects tampering and avoids plaintext secrets in the database and logs.           |
| Hard user and global caps are checked before every provider attempt                          | A retry or fallback cannot bypass budget policy.                                                            |
| Deterministic stub provider is the zero-key default                                          | Every feature, CI test, and seeded demo stays usable before external credentials exist.                     |
| Lexical retrieval precedes model reranking                                                   | Cheap deterministic filters remove unsafe or irrelevant candidates before paid reasoning.                   |
| Candidate filters include blocks, scope, activity, prior introduction, and age compatibility | Unsafe pairs never reach the conversation model.                                                            |
| Daily introduction caps are enforced in the worker                                           | A small network remains useful without generating spam or runaway costs.                                    |
| ORVIN is implemented as versioned validated skill graphs                                     | Validated procedures can be reused and revised rather than repeatedly prompting from scratch.               |
| Two recent failures or sub-80% validation force frontier reasoning                           | Confidence must decay into a safe fallback instead of compounding an incorrect skill.                       |
| Learning receipts compare first and current run                                              | Concrete actions and model calls saved make compounding value understandable to one user.                   |
| Exchange moves no money and recommends public handoff                                        | This avoids pretending to be escrow while retaining useful matching and negotiation.                        |
| Warm editorial visual system with custom SVG icons and no shadows                            | It follows the brief's calm paper-like identity without importing a generic icon system.                    |
| Offline behavior caches successful GETs but queues no blind writes                           | Stale reading is tolerable; silently replaying consent or safety mutations is not.                          |
| Public repository with all rights reserved                                                   | The requested public visibility does not automatically grant competitors reuse rights.                      |

## Known external-boundary gaps

The optional voice transcription, production SMS, OAuth/mail adapters, remote push, store signing, and production object upload items are deliberately tracked as issues rather than represented by TODO code. Their surrounding interfaces, storage models, safety controls, and closest local behavior are implemented and tested.

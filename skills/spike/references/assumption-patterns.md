# Common Risky Assumptions by Category

## External APIs

| Assumption | How to Test | Common Surprises |
|-----------|-------------|-----------------|
| API returns structured JSON in expected format | Call with sample input, inspect response | Fields renamed between versions, nested differently than docs suggest |
| API handles N items per request | Send request at stated limit | Undocumented size limits, timeout before completion |
| Rate limit is X requests/minute | Check docs, then send burst of requests | Different limits for different endpoints, undocumented throttling |
| API is available and responds in under Xs | Timed request from your environment | Cold start latency, geographic routing, intermittent failures |
| Free tier covers the use case | Check pricing page and current usage | Hidden costs (per-token, per-character, bandwidth), usage already near limit |
| API supports batch/bulk operations | Check docs for bulk endpoint | Bulk endpoint may have different rate limits, different response format |

## Databases & Schemas

| Assumption | How to Test | Common Surprises |
|-----------|-------------|-----------------|
| Column X is nullable | Check migration files or run `\d table` | NOT NULL constraint added in a later migration |
| Table has no CHECK constraints on column | Check migration files | CHECK constraints added separately from CREATE TABLE |
| Foreign key allows NULL | Check constraint definition | FK defined as NOT NULL in original CREATE TABLE |
| Index exists for the query pattern | Check migrations or `\di` | Index exists but doesn't cover the specific column combination |
| Migration won't lock the table | Check table size and migration type | ALTER TABLE on large tables can lock for minutes |

## Libraries & Dependencies

| Assumption | How to Test | Common Surprises |
|-----------|-------------|-----------------|
| Installed version supports feature X | Check changelog/docs for the installed version | Feature added in a newer version than what's installed |
| Library A and B work together | Import both, exercise the integration point | Peer dependency conflicts, incompatible React versions |
| Library supports the configuration we need | Create minimal test with the specific config | Config option exists but behaves differently than expected |
| Library handles edge case X | Write test for the specific edge case | Works for common cases, breaks on edge cases (Unicode, large inputs, null) |

## Performance

| Assumption | How to Test | Common Surprises |
|-----------|-------------|-----------------|
| Operation completes in under X seconds | Time it with realistic data volume | 10x slower than expected due to N+1 queries, serialization overhead |
| Memory usage stays under X MB | Profile with realistic dataset | Memory spikes during batch processing, garbage collection pauses |
| Concurrent requests don't cause issues | Send parallel requests | Race conditions, database locks, connection pool exhaustion |

## LLM / AI

| Assumption | How to Test | Common Surprises |
|-----------|-------------|-----------------|
| Model returns valid structured JSON | Call with actual prompt, parse response | Markdown wrapping, extra fields, inconsistent naming |
| Model generates N items reliably | Request N items, check count | Returns fewer than requested, duplicates, or trailing garbage |
| Model understands the domain well enough | Test with diverse inputs from the domain | Great for major cities, poor for small towns or niche industries |
| Structured output mode works as expected | Use the specific structured output API | Not all models support it, schema validation may differ from docs |
| Response fits within token limits | Calculate expected output tokens | 100 structured items can exceed output token limit |
| Temperature setting produces desired variety | Run same prompt 3-5 times, compare outputs | Too low = repetitive, too high = incoherent |

## Integrations

| Assumption | How to Test | Common Surprises |
|-----------|-------------|-----------------|
| Webhook delivers within X seconds | Set up test endpoint, trigger event | Retry delays, out-of-order delivery |
| OAuth flow works with our setup | Walk through the full auth flow | Callback URL restrictions, scope limitations |
| File upload handles X MB files | Upload a file at the size limit | Client timeout, server memory limits, proxy body size limits |
| CORS allows our origin | Make request from browser | Preflight OPTIONS not handled, specific headers blocked |

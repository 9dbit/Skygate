# Native journal commit boundaries

Skygate retains SQLite WAL mode with `synchronous=FULL`. Independent players can
share one bounded commit: at most 64 synchronous write operations, a queue of at
most 1,024 pending operations, and a 2 ms batching delay. Per-player serialization
continues to cover the complete round and duplicate requests.

The native runtime awaits each successful durable commit before the next outward
effect:

| Persisted state | Next action permitted after commit |
| --- | --- |
| Launch/session binding | Return the session cookie |
| Immutable outcome and intent | Request wallet reservation |
| Reservation and central round ID | Request wallet settlement |
| Settled result | Return the successful round response |
| Definitive wallet rejection | Return the persisted rejection |

Each operation uses a savepoint, so an invalid operation cannot leave its partial
writes in another player's successful batch. An outer commit failure rejects all
operations in that batch and attempts a rollback. The caller receives no success
acknowledgment. Existing persisted intent/reservation states and wallet idempotency
support recovery; retry uses the same request ID and immutable outcome. Outcomes
whose initial intent did not commit cannot reach the wallet.

Queue overflow and shutdown reject pending work. Callbacks must be synchronous SQL
operations; asynchronous, generator and nested queue callbacks are rejected. The
queue never waits on external I/O inside a transaction. Shutdown does not promise
to complete requests already waiting on an external service; clients recover using
the existing idempotent request protocol.

`health().durable_journal` exposes only aggregate counts and timings. `operations`
counts all operations in a committed batch, including operations rejected by their
individual savepoint. `rejected_operations` counts those operation failures;
`failed_commits` counts failed outer batches. These counters reset at process start.

The tests use separate on-disk SQLite connections to observe the durable boundaries,
real local HTTP requests for concurrent players and duplicates, and injected commit
failures followed by restart/replay. These local tests establish the application
ordering and recovery behavior. Platform power-loss, complete volume replacement,
production approval and external wallet certification require separate evidence.

Game math, RNG, immutable result format, wallet protocol, and production quarantine
are unchanged by this queue.

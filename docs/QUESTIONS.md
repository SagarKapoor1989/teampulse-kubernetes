# Assessment question preparation

## Why this application idea?

It is easy to understand in a short demonstration, but it still has distinct transactional and analytical responsibilities. The workload assumption is many teams with far more dashboard reads than writes. I explicitly acknowledge that a monolith would be cheaper for the current tiny feature set.

## Why three custom services?

Web isolates the browser and external boundary, Tasks owns business data and CRUD, and Insights demonstrates service-to-service REST consumption and an independently scalable read workload. These are deployable units that map to responsibilities rather than arbitrary code folders.

## Why can they scale horizontally?

They store no durable state in process or on the pod filesystem. Kubernetes Services distribute traffic across interchangeable replicas, and the durable state is in Redis. Each has a separate Deployment and HPA, so replica counts do not have to match.

## How do services interact?

The browser calls Web. Web proxies task routes to the `tasks` Kubernetes Service and insight routes to `insights`. Insights calls Tasks with HTTP `fetch`. Only Tasks speaks the Redis wire protocol. Kubernetes DNS resolves stable Service names even when pods change.

## Why not let Insights query Redis?

That would couple Insights to the storage schema, duplicate credentials, and let it bypass Task validation and ownership. Calling the REST contract costs latency but keeps a clean boundary and makes storage replaceable.

## Why Redis?

It is simple to demonstrate, supports hashes and sets needed by this model, has an official container, and supports append-only persistence. It is not inherently the best database for every task product; PostgreSQL could be a stronger choice if relational queries, transactions, and reporting complexity grew.

## What happens when a pod dies?

Kubernetes replaces it. Web, Tasks, and Insights are stateless, and Services route around unready replicas. If Redis restarts, there is a short outage, but its AOF files remain on the PVC and are reloaded.

## Is a PVC a backup?

No. It protects data from a pod/container restart, but not deletion of the claim, storage corruption, operator error, or a regional failure. Production requires scheduled backups, retention policy, off-site copies, and restore testing.

## What makes it externally accessible?

The Web Service is type `NodePort` on port 30080. For a local demonstration, `kubectl port-forward service/web 8080:80` gives a reliable browser URL. In production I would normally use an HTTPS Ingress or managed load balancer.

## What business value does independent scaling provide?

If insight reads spike, the business can add only Insights capacity. This can protect task writes and reduce unnecessary compute. It also lets teams release services independently. The costs are more operational tooling, network failure modes, duplicated runtime overhead, and harder debugging.

## What security is implemented?

Only Web is public; Redis has a password and an internal Service; NetworkPolicy defaults to deny; only Tasks receives the database secret; inputs and body sizes are validated; task content is rendered safely; browser security headers are set; and containers run without root, added capabilities, privilege escalation, or writable root filesystems.

## What security remains?

There is no identity or authorization in the educational version, and local access is HTTP. Production needs TLS, OIDC, authorization checks, CSRF protection when using cookies, external secret management and rotation, rate limiting, auditing, image scanning/signing, restricted RBAC, and backup/recovery processes.

## What would fail first under load?

Likely the single Redis instance or the synchronous list-all operation used to calculate insights. I would measure before changing it. Options include pagination, caching, a materialized analytics read model updated by events, Redis replication/managed service, and scaling based on request latency rather than CPU alone.

## Why use a BFF instead of exposing every service?

It gives the browser one origin and one public attack surface, hides internal topology, avoids broad CORS configuration, and allows internal APIs to stay ClusterIP-only. It adds one hop and must itself be operated and scaled.

# TeamPulse architecture and evaluation

## 1. Software description

TeamPulse is a browser-based work tracker. Users create tasks with a title, description, owner, and workflow state; move tasks between “To do”, “In progress”, and “Done”; delete tasks; and see completion metrics update. It is intentionally modest in business scope so the deployment and service boundaries remain visible during a short assessment demonstration.

The scaling scenario is a multi-team installation with bursty morning check-ins and dashboard traffic. Reading analytics can become much more frequent than changing tasks. Although a single process would be cheaper for the current feature set, this assumed workload makes independent scaling and failure isolation meaningful.

## 2. Component and microservice mapping

### Browser client

The HTML, CSS, and JavaScript client provides the task board. It calls only same-origin `/api` routes, so it does not need Kubernetes DNS knowledge and does not require permissive cross-origin rules.

### Web/BFF microservice

The web service serves static UI files, provides `GET /healthz`, and acts as a Backend for Frontend (BFF). It forwards task operations to the Task API and dashboard requests to the Insights API. It is stateless, so any replica can handle any request.

### Task microservice

The Task API is the system of record at the application layer. It validates task data, implements RESTful CRUD endpoints, and is the only custom service allowed to know the Redis password or protocol. It stores each task as a Redis hash and maintains a set of task IDs.

### Insights microservice

The Insights API demonstrates programmatic REST consumption. It calls `GET /api/tasks` over the cluster network, then calculates counts by status and owner, active work, and completion percentage. It is stateless and can be scaled independently when reporting is busy. It intentionally does not connect directly to Redis; this preserves the Task API's ownership of task data.

### Redis database

Redis is the only third-party application container, which is permitted by the assignment. It runs as one replica with append-only persistence. `/data` is backed by a `ReadWriteOnce` PersistentVolumeClaim, so data is not tied to a Redis pod's lifecycle.

### Kubernetes resources

Each custom service has its own Deployment, ClusterIP Service, resource requests/limits, health probes, and HorizontalPodAutoscaler. The web Service is a NodePort and is the sole public entry point. Redis has one Deployment, one internal Service, and one PVC. A ConfigMap carries non-secret service addresses; a Secret carries the Redis password; NetworkPolicies restrict permitted flows.

## 3. Architecture principles and patterns

- **Single responsibility:** UI/gateway, transactional task ownership, and analytical calculation are separate concerns.
- **Database per service ownership:** only the Task service accesses the database. Other services use its contract rather than sharing storage internals.
- **Backend for Frontend/API gateway:** one public origin hides internal topology and simplifies the browser client.
- **Stateless compute:** all three custom services keep durable state outside their pods, enabling replica replacement and horizontal scaling.
- **Service discovery:** services use Kubernetes DNS names (`tasks`, `insights`, `redis`) rather than pod IP addresses.
- **Externalized configuration:** addresses and credentials enter through ConfigMap and Secret resources.
- **Health-aware orchestration:** liveness checks identify dead processes; readiness checks stop traffic until dependencies are usable.
- **Bulkhead/failure isolation:** analytics can fail or scale without granting it direct database access. The task board reports an error instead of silently showing invented data.
- **Least privilege network segmentation:** default-deny policies permit only the required browser-to-web, web-to-API, insights-to-tasks, and tasks-to-Redis paths.

## 4. Request flows

### Create a task

1. Browser sends `POST /api/tasks` to the Web/BFF.
2. Web forwards the JSON request to the Task service via the `tasks` ClusterIP Service.
3. Task validates the fields, allocates an ID, and writes the hash and index to Redis.
4. The created resource returns as HTTP 201 to the browser.

### Refresh insights

1. Browser sends `GET /api/insights` to Web.
2. Web calls the Insights Service.
3. Insights programmatically calls `GET http://tasks:3001/api/tasks`.
4. Insights calculates metrics and returns JSON. It never sees database credentials.

## 5. Benefits and business implications

**Independent scaling.** Reporting and browser traffic can scale without multiplying database-facing processes unnecessarily. This can improve responsiveness during high read demand and lets the business pay for capacity where it is needed.

**Independent delivery and ownership.** A team can improve insight calculations without modifying task persistence. Smaller units reduce change scope and make ownership clearer.

**Failure isolation.** An insights defect does not corrupt task storage. Users may temporarily lose metrics while core task data remains available.

**Portable deployment.** The workload uses standard containers and Kubernetes objects rather than a provider-specific application platform. This reduces provider lock-in, although storage classes and ingress details still differ across providers.

**Observable operation.** Structured stdout logs, probes, resource settings, instance identifiers, and Kubernetes status make service behavior visible during operation.

## 6. Challenges and mitigations

### Complexity and cost

Three custom services require more images, manifests, network calls, and operational knowledge than a monolith. For the application's current size, this is deliberate educational overhead, not the cheapest production design. Repeatable Make targets, shared naming, Kustomize rendering, and a local Compose environment reduce that burden. A real product should adopt these boundaries only when team ownership or scaling evidence justifies them.

### Distributed failure and latency

The insights request depends on Web → Insights → Tasks, so network latency and partial failure are introduced. Calls use finite timeouts; Kubernetes readiness removes unhealthy destinations; the UI displays explicit errors. Production improvements could add bounded retries with jitter, circuit breaking, cached last-known metrics, tracing, and service-level objectives. Retries must be conservative to avoid amplifying an outage.

### Data consistency

Insights are calculated from a point-in-time task list and may become stale immediately after another write. That is acceptable for a dashboard. Stronger requirements could use versioned events and a dedicated read model, but that adds eventual consistency and operational complexity.

### Database availability

Redis is intentionally a single replica, as allowed by the assignment, so it is a single point of temporary outage. Kubernetes restarts it and the PVC preserves data, but restart time remains downtime. Production options include managed Redis, replication/Sentinel, backups, tested restoration, pod disruption budgets, and an appropriate storage class. Persistence is not the same as backup.

### Autoscaling limits

CPU is an imperfect signal: the Insights service could become latency-bound on its upstream before CPU is high. Metrics Server must also be installed for HPA decisions. Production scaling can incorporate request rate, queue depth, or latency metrics. Min/max bounds prevent unbounded cost and resource requests make CPU utilization meaningful.

## 7. Security discussion

### Threats considered

- Direct database exposure or credential leakage
- Unnecessary east-west pod communication
- Malicious or oversized request bodies
- Cross-site scripting through task fields
- Container privilege escalation and writable image filesystems
- Supply-chain risk from mutable or vulnerable base images
- Plain HTTP and absent end-user authentication
- Denial of service and abusive task creation

### Controls implemented

- Redis is a ClusterIP-only Service and is reachable by policy only from Task pods.
- The Redis password is injected from a Kubernetes Secret and is not given to Web or Insights.
- A namespace-wide default-deny NetworkPolicy is followed by explicit allow rules.
- Task inputs have type and length validation; request bodies are limited to 64 KiB.
- The UI inserts user data with `textContent`, not `innerHTML`, and the Web service adds a restrictive Content Security Policy plus clickjacking and MIME-sniffing protections.
- Custom containers run as a non-root user, drop Linux capabilities, prevent privilege escalation, use the default seccomp profile, and have read-only root filesystems in Kubernetes.
- Only the Web/BFF is externally reachable. Internal service names and Redis are not published.
- Secrets and non-secret configuration use separate Kubernetes resources.
- Resource limits, timeouts, and health probes reduce some denial-of-service and cascading-failure risk.

### Remaining risks and production mitigation

The demonstration has no login or role model. Any person who reaches the NodePort can read and change tasks. Production should terminate HTTPS at an Ingress or cloud load balancer, use a trusted identity provider (OIDC), enforce authorization in the Task API, add CSRF protection if cookie sessions are used, and keep an audit trail.

The demonstration Secret includes a placeholder value in source control. A real deployment should create it at deploy time from a secret manager (for example, a cloud KMS-backed store), enable encryption at rest for Kubernetes Secrets, rotate it, and restrict RBAC. NetworkPolicy enforcement also depends on the cluster's network plugin.

Images use tags for readability. A release pipeline should pin immutable digests, generate an SBOM, scan images and source, sign images, verify signatures with admission policy, update base images, and run as a dedicated ServiceAccount with minimal RBAC. Rate limiting and quotas should be added at the edge. Redis backups and recovery tests are necessary for genuine durability.

## 8. Requirement traceability

| Assignment requirement | Evidence |
|---|---|
| Kubernetes deployable | `kubernetes/kustomization.yaml` and eight resource files |
| At least two microservice types and a database | Web, Tasks, Insights, Redis |
| REST API in each custom microservice | `/healthz` in all; business APIs in Web, Tasks, Insights |
| Externally accessible | NodePort `web:30080` or local port-forward |
| Independent horizontal scaling | One Deployment and HPA per custom service |
| Images on Docker Hub | `make push`; configured image names recorded in manifests before submission |
| Separate database microservice | Official Redis container and internal Service |
| Persistent database storage | Redis AOF on `redis-data` PVC |
| Programmatically use a REST API | Insights calls Task API with server-side `fetch()` |
| Program a REST provider | Task API implements CRUD using Node HTTP |
| No reused non-database microservices | All three application images contain project-owned code |

## 9. Repository and recording

Before submission, replace these placeholders in the main README:

- the Git repository URL containing all source and Kubernetes code;
- the three Docker Hub image URLs;
- the 5–10 minute recording URL.

The exact presentation sequence is provided in `docs/DEMO_SCRIPT.md`.

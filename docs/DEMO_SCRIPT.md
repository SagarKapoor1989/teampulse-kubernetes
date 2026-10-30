# TeamPulse 7–8 minute demonstration script

Record at 1080p if possible and enlarge the terminal font. Before recording, publish the images, deploy the application, start the port-forward, and create two sample tasks so the board is not empty.

## 0:00–0:45 — Introduce the product

“TeamPulse is a small task and progress dashboard. I built it to demonstrate a Kubernetes microservice architecture rather than to compete with a full project-management product. For scaling to make business sense, I assume many teams use it and dashboard reads are much heavier than task writes.”

Show the browser board. Point out task workflow columns and summary metrics.

## 0:45–1:50 — Explain the architecture

Show the architecture diagram in `README.md`.

“The browser reaches only the Web service. Web is a Backend for Frontend and routes REST calls to Task or Insights. Task owns validation and all Redis access. Insights demonstrates programmatic API consumption: it calls Task over HTTP, then calculates the summary. Redis is the separate database and its `/data` directory is mounted from a persistent volume.”

Mention that the custom services are stateless and each has its own Deployment, Service, and HPA.

## 1:50–3:10 — Use the application

1. Click **Add a task**.
2. Create “Review security controls”, assign yourself, choose “To do”.
3. Move it to “In progress”.
4. Show the count and completion percentage changing.
5. Refresh the page to prove data is not held only in browser memory.

Explain that browser calls go to `/api/tasks` and `/api/insights` on the Web service. The Web service forwards them inside the cluster.

## 3:10–4:05 — Show Kubernetes running

Run:

```sh
kubectl get pods,services,pvc,hpa -n teampulse
```

Point out:

- two replicas each for Web, Tasks, and Insights;
- one Redis pod;
- ClusterIP for internal services and NodePort for Web;
- the Bound persistent volume claim;
- separate HPA maximums, showing independent scalability.

Optionally run `kubectl scale deployment/insights -n teampulse --replicas=4`, then show the extra Insights pods. If HPA is active, it may later restore the configured minimum.

## 4:05–4:55 — Show logs and REST interaction

Run:

```sh
kubectl logs -n teampulse -l app.kubernetes.io/name=teampulse --all-containers --prefix --tail=30
BASE_URL=http://localhost:8080 make smoke-test
```

Explain that logs are written to stdout for Kubernetes log collection. The smoke test creates a task through the public REST gateway, then reads insights. Briefly show `services/insights/src/server.js`, specifically `getTasks()`, as evidence of programmatically calling the Task REST API.

## 4:55–6:10 — Walk through Kubernetes YAML

Show these files in order:

1. `kubernetes/web.yaml`: Deployment replicas/probes/resources/security and public NodePort Service.
2. `kubernetes/tasks.yaml` and `insights.yaml`: separate Deployments and internal Services.
3. `kubernetes/autoscaling.yaml`: independent HPA targets and bounds.
4. `kubernetes/redis.yaml`: one database replica, append-only mode, PVC mount.
5. `kubernetes/network-policies.yaml`: default deny and explicitly allowed flows.

Do not read every line. Explain what each category achieves.

## 6:10–6:55 — Prove persistence

Show the task in the UI, then identify and delete only the Redis pod:

```sh
kubectl get pods -n teampulse -l app.kubernetes.io/component=database
kubectl delete pod -n teampulse REDIS_POD_NAME
kubectl get pods,pvc -n teampulse -w
```

After the replacement is ready, refresh the UI and show that the task remains. State that the pod was disposable but the PersistentVolumeClaim was retained.

## 6:55–7:50 — Benefits, challenges, and security

“The benefits are independent scaling, ownership, failure isolation, and portable deployment. The trade-off is distributed-system complexity, more network calls, higher operational overhead, and a single Redis availability point in this assignment.”

“Implemented security includes one public entry point, Redis authentication, Kubernetes Secrets, default-deny network policy, validated and size-limited input, browser security headers, non-root containers, dropped capabilities, and read-only filesystems. For production I would add HTTPS, OIDC login, role-based authorization, external secret management, rate limiting, immutable signed images, scanning, backups, and monitoring.”

## 7:50–8:05 — Close

Show the repository root.

“The repository contains all application source, Dockerfiles, tests, Docker Hub image configuration, and Kubernetes deployment code. The README includes reproducible build, push, deployment, and verification commands.”

Stop the recording and upload it. Put the recording URL, your repository URL, and Docker Hub URLs into `README.md` before submission.

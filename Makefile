DOCKERHUB_USERNAME ?=
VERSION ?= 1.0.0
SERVICES := web tasks insights

.PHONY: test compose-up compose-down build push configure-images deploy status logs smoke-test

test:
	@for service in $(SERVICES); do echo "Testing $$service"; (cd services/$$service && npm test) || exit 1; done
	@echo "Testing complete service interaction"
	@node --test test/*.test.js
	@kubectl kustomize kubernetes >/dev/null

compose-up:
	docker compose up --build -d

compose-down:
	docker compose down

build:
	@test -n "$(DOCKERHUB_USERNAME)" || (echo "Set DOCKERHUB_USERNAME first" && exit 1)
	@for service in $(SERVICES); do docker build -t $(DOCKERHUB_USERNAME)/teampulse-$$service:$(VERSION) services/$$service || exit 1; done

push: build
	@for service in $(SERVICES); do docker push $(DOCKERHUB_USERNAME)/teampulse-$$service:$(VERSION) || exit 1; done

configure-images:
	@test -n "$(DOCKERHUB_USERNAME)" || (echo "Set DOCKERHUB_USERNAME first" && exit 1)
	./scripts/configure-images.sh "$(DOCKERHUB_USERNAME)" "$(VERSION)"

deploy:
	kubectl apply -k kubernetes
	kubectl rollout status deployment/web deployment/tasks deployment/insights deployment/redis -n teampulse --timeout=180s

status:
	kubectl get pods,services,pvc,hpa -n teampulse

logs:
	kubectl logs -n teampulse -l app.kubernetes.io/name=teampulse --all-containers --prefix --tail=100

smoke-test:
	./scripts/smoke-test.sh

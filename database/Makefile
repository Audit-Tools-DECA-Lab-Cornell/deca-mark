.DEFAULT_GOAL := help
.PHONY: help start stop reset test api-build api-test

API_TEST_IMAGE ?= fieldmaps-api:test
API_RUNTIME_IMAGE ?= fieldmaps-api:runtime
ROOT := $(abspath ..)

help:
	@printf '%s\n' 'Use pnpm db:start, db:stop, db:reset, db:test or backend:test from the product root.'

start:
	sh local-supabase.sh start

stop:
	sh local-supabase.sh stop

reset:
	sh local-supabase.sh reset

test:
	sh local-supabase.sh test

api-build:
	docker build --target runtime -t $(API_RUNTIME_IMAGE) ../backend
	docker build --target test -t $(API_TEST_IMAGE) ../backend

api-test: api-build
	docker run --rm --add-host host.docker.internal:host-gateway \
	  -e DECAMARK_CONTAINER_TESTS=1 \
	  -v /var/run/docker.sock:/var/run/docker.sock \
	  -v "$(ROOT)/database/.local/fieldmaps-api-password:/database/.local/fieldmaps-api-password:ro" \
	  -v "$(ROOT)/contracts:/contracts:ro" \
	  -v "$(ROOT)/supabase:/supabase:ro" $(API_TEST_IMAGE)

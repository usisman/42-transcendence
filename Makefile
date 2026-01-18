COMPOSE_FILE := srcs/docker/docker-compose.yml
# Güncel Docker sürümlerinde "docker compose" kullanılabiliyor, ancak
# sisteminde klasik "docker-compose" çalıştığından onu hedefliyoruz.
COMPOSE := docker-compose

CERT_DIR := srcs/docker/nginx/certs
CERT_PEM := $(CERT_DIR)/localhost.pem
CERT_KEY := $(CERT_DIR)/localhost-key.pem

.PHONY: up up-detached down vclean certs clean-build

up: $(CERT_PEM)
	$(COMPOSE) -f $(COMPOSE_FILE) up --build

up-detached: $(CERT_PEM)
	$(COMPOSE) -f $(COMPOSE_FILE) up --build -d


clean-build:
	@find srcs -type d \( -name dist -o -name build -o -name coverage -o -name .vite -o -name .cache \) -not -path '*/node_modules/*' -prune -exec rm -rf {} +
	@find srcs -type f \( -name '*.tsbuildinfo' -o -name '.eslintcache' -o -name '.stylelintcache' \) -not -path '*/node_modules/*' -delete

down:
	$(COMPOSE) -f $(COMPOSE_FILE) down
	@if [ -d "$(CERT_DIR)" ]; then rm -rf "$(CERT_DIR)"; fi

	@$(MAKE) clean-build
vclean:
	$(COMPOSE) -f $(COMPOSE_FILE) down -v
	@if [ -d "$(CERT_DIR)" ]; then rm -rf "$(CERT_DIR)"; fi
	@$(MAKE) clean-build

$(CERT_PEM):
	@command -v mkcert >/dev/null || { echo "mkcert yüklü değil. macOS için 'brew install mkcert nss', Linux (Debian/Ubuntu) için 'sudo apt install mkcert libnss3-tools' komutlarını çalıştırıp 'mkcert -install' deyin."; exit 1; }
	@mkdir -p $(CERT_DIR)
	@mkcert -install >/dev/null 2>&1 || true
	mkcert -cert-file $(CERT_PEM) -key-file $(CERT_KEY) localhost 127.0.0.1 ::1

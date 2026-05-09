#!/bin/bash
# Bootstrap Let's Encrypt cert for kindredaistudio.site.
# Run once on the VM after DNS is pointing here. Re-running is safe.

set -e

DOMAINS=(kindredaistudio.site www.kindredaistudio.site)
EMAIL="ramdevcalope2015@gmail.com"
STAGING=0   # set to 1 to test against Let's Encrypt staging

DATA_PATH="./certbot"
RSA_KEY_SIZE=4096

if ! [ -x "$(command -v docker)" ]; then
  echo "❌ docker is not installed." >&2
  exit 1
fi

mkdir -p "$DATA_PATH/conf" "$DATA_PATH/www"

# Download recommended TLS params if missing
if [ ! -e "$DATA_PATH/conf/options-ssl-nginx.conf" ] || [ ! -e "$DATA_PATH/conf/ssl-dhparams.pem" ]; then
  echo "### Downloading recommended TLS parameters..."
  curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf > "$DATA_PATH/conf/options-ssl-nginx.conf"
  curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot/certbot/ssl-dhparams.pem > "$DATA_PATH/conf/ssl-dhparams.pem"
fi

# Create dummy cert so nginx can start with the HTTPS server block
DOMAIN="${DOMAINS[0]}"
CERT_PATH="/etc/letsencrypt/live/$DOMAIN"
echo "### Creating dummy certificate for $DOMAIN..."
mkdir -p "$DATA_PATH/conf/live/$DOMAIN"
docker compose run --rm --entrypoint "\
  openssl req -x509 -nodes -newkey rsa:$RSA_KEY_SIZE -days 1 \
    -keyout '$CERT_PATH/privkey.pem' \
    -out '$CERT_PATH/fullchain.pem' \
    -subj '/CN=localhost'" certbot

echo "### Starting nginx..."
docker compose up --force-recreate -d nginx

echo "### Deleting dummy certificate for $DOMAIN..."
docker compose run --rm --entrypoint "\
  rm -Rf /etc/letsencrypt/live/$DOMAIN && \
  rm -Rf /etc/letsencrypt/archive/$DOMAIN && \
  rm -Rf /etc/letsencrypt/renewal/$DOMAIN.conf" certbot

echo "### Requesting Let's Encrypt certificate for ${DOMAINS[*]}..."
DOMAIN_ARGS=""
for d in "${DOMAINS[@]}"; do DOMAIN_ARGS="$DOMAIN_ARGS -d $d"; done

EMAIL_ARG="--email $EMAIL"
[ "$STAGING" != "0" ] && STAGING_ARG="--staging" || STAGING_ARG=""

docker compose run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    $STAGING_ARG \
    $EMAIL_ARG \
    $DOMAIN_ARGS \
    --rsa-key-size $RSA_KEY_SIZE \
    --agree-tos \
    --force-renewal" certbot

echo "### Reloading nginx..."
docker compose exec nginx nginx -s reload

echo "✅ Done. https://kindredaistudio.site should now be live."

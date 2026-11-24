#!/bin/bash
# =============================================================================
# Automated Batch Onboarding for ALL Custom Domains in KumoMTA
# Generates 2048-bit DKIM keys and creates a master DNS configuration ledger
# =============================================================================

DKIM_DIR="/opt/kumomta/etc/dkim"
DOMAINS_FILE="/root/all_custom_domains.txt"
OUTPUT_DNS_LEDGER="/root/MASTER_DNS_RECORDS_FOR_ALL_DOMAINS.txt"
SERVER_IP=$(curl -s -4 ifconfig.me || echo "198.51.100.42")

mkdir -p "$DKIM_DIR"
> "$OUTPUT_DNS_LEDGER"

echo "=================================================================="
echo "⚡ Starting Automated KumoMTA Setup for All Domains"
echo "🌐 Server IP: $SERVER_IP"
echo "📁 Output DNS Ledger: $OUTPUT_DNS_LEDGER"
echo "=================================================================="

if [ ! -f "$DOMAINS_FILE" ]; then
    echo "ERROR: Domain list file not found at $DOMAINS_FILE"
    exit 1
fi

COUNT=0

while IFS= read -r DOMAIN || [ -n "$DOMAIN" ]; do
    DOMAIN=$(echo "$DOMAIN" | tr '[:upper:]' '[:lower:]' | xargs)
    [ -z "$DOMAIN" ] && continue

    COUNT=$((COUNT + 1))
    echo "[$COUNT] Processing domain: $DOMAIN ..."

    # 1. Generate 2048-bit RSA Private Key if not already present
    if [ ! -f "$DKIM_DIR/$DOMAIN.key" ]; then
        openssl genrsa -out "$DKIM_DIR/$DOMAIN.key" 2048 2>/dev/null
        openssl rsa -in "$DKIM_DIR/$DOMAIN.key" -pubout -out "$DKIM_DIR/$DOMAIN.pub" 2>/dev/null
        chmod 600 "$DKIM_DIR/$DOMAIN.key"
        chown kumod:kumod "$DKIM_DIR/$DOMAIN.key" 2>/dev/null || true
    fi

    # 2. Extract Public Key string
    PUB_KEY=$(grep -v '^-' "$DKIM_DIR/$DOMAIN.pub" | tr -d '\n')

    # 3. Append to Master DNS Ledger
    cat << EOF >> "$OUTPUT_DNS_LEDGER"
==================================================================
DOMAIN: $DOMAIN
==================================================================
1. SPF Record (TXT):
   Host:  $DOMAIN
   Type:  TXT
   Value: v=spf1 ip4:$SERVER_IP ~all

2. DKIM 2048-bit Record (TXT):
   Host:  kumo._domainkey.$DOMAIN
   Type:  TXT
   Value: v=DKIM1; k=rsa; p=$PUB_KEY

3. DMARC Phased Record (TXT):
   Host:  _dmarc.$DOMAIN
   Type:  TXT
   Value: v=DMARC1; p=none; rua=mailto:dmarc-reports@$DOMAIN; pct=100; adkim=r; aspf=r

4. Forward A Record (Host):
   Host:  mail.$DOMAIN
   Type:  A
   Value: $SERVER_IP

EOF

done < "$DOMAINS_FILE"

echo ""
echo "=================================================================="
echo "✔ Completed processing $COUNT domains!"
echo "📄 All DNS records have been saved to: $OUTPUT_DNS_LEDGER"
echo "=================================================================="

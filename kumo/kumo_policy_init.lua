local kumo = require 'kumo'

-- =========================================================================
-- AUTONOMOUS MAILOPS KUMOMTA POLICY (ENTERPRISE EDITION WITH MULTI-FAMILY EHLO)
-- Dynamic Family EHLO Mapping:
--   • Worldwide Journals Group -> mail.worldwidejournals.in
--   • Paripex Group            -> mail.paripex.com
--   • GJRA Group               -> mail.gjra.in
--   • IJAR / IJSR Group        -> mail.indianjournalofappliedresearch.com
-- Dual-Lane Architecture: Instant OTP Lane (<1s) & Organic Marketing Lane
-- =========================================================================

local DEFAULT_PRIMARY_MAIL_HOST = 'mail.worldwidejournals.in'
local WEBHOOK_URL = 'https://teatablespoon.com/admin/mail/kumomta_webhook.php'

-- 1. ESMTP LISTENER: Accepts local loopback connections on port 2525
kumo.on('init', function()
  kumo.start_esmtp_listener {
    listen = '127.0.0.1:2525',
    relay_hosts = { '127.0.0.1', '::1' },
    max_message_size = 52428800,
    banner = DEFAULT_PRIMARY_MAIL_HOST .. ' ESMTP KumoMTA Autonomous MailOps Ready'
  }

  -- High-Performance Disk Spool Queues
  kumo.define_spool {
    name = 'data',
    path = '/var/spool/kumomta/data',
  }
  kumo.define_spool {
    name = 'meta',
    path = '/var/spool/kumomta/meta',
  }

  -- Real-Time Automated MailOps Webhook Log
  kumo.configure_local_logs {
    log_dir = '/var/log/kumomta',
    max_segment_duration = '10 seconds',
    headers = { 'From', 'To', 'Subject', 'X-Campaign-ID', 'Feedback-ID', 'X-Mail-Class' }
  }
end)

-- 2. DOMAIN SHAPING RULES FOR MARKETING / BULK TRAFFIC
local domain_shaping = {
  ['gmail.com'] = {
    max_connection_rate = '1/s',
    max_deliveries_per_connection = 1,
    connection_limit = 3,
    consecutive_connection_failures_before_delay = 2,
    consecutive_success_delay = '4s',
    retry_interval = '20m',
    max_retry_interval = '4h',
    age_limit = '48h',
  },
  ['googlemail.com'] = {
    max_connection_rate = '1/s',
    max_deliveries_per_connection = 1,
    connection_limit = 3,
    consecutive_connection_failures_before_delay = 2,
    consecutive_success_delay = '4s',
    retry_interval = '20m',
    max_retry_interval = '4h',
    age_limit = '48h',
  },
  ['yahoo.com'] = {
    max_connection_rate = '1/s',
    max_deliveries_per_connection = 3,
    max_message_rate = '2/s',
    retry_interval = '20m',
    max_retry_interval = '48h',
    age_limit = '48h',
  },
  ['ymail.com'] = {
    max_connection_rate = '1/s',
    max_deliveries_per_connection = 3,
    max_message_rate = '2/s',
    retry_interval = '20m',
    max_retry_interval = '48h',
    age_limit = '48h',
  },
  ['outlook.com'] = {
    max_connection_rate = '2/s',
    max_deliveries_per_connection = 5,
    max_message_rate = '3/s',
    retry_interval = '15m',
    max_retry_interval = '48h',
    age_limit = '48h',
  },
  ['hotmail.com'] = {
    max_connection_rate = '2/s',
    max_deliveries_per_connection = 5,
    max_message_rate = '3/s',
    retry_interval = '15m',
    max_retry_interval = '48h',
    age_limit = '48h',
  }
}

-- Resolve brand family EHLO based on sender domain
local function resolve_family_ehlo(domain)
  if not domain then return DEFAULT_PRIMARY_MAIL_HOST end
  local d = domain:lower()

  -- Paripex Group
  if d:find('paripex') then
    return 'mail.paripex.com'
  end

  -- GJRA Group
  if d:find('gjra') or d:find('globaljournal') then
    return 'mail.gjra.in'
  end

  -- IJAR / IJSR Group
  if d:find('appliedresearch') or d:find('ijasr') or d:find('ijsr') then
    return 'mail.indianjournalofappliedresearch.com'
  end

  -- Worldwide Journals Group (and default fallback)
  return 'mail.worldwidejournals.in'
end

-- 3. PER-SENDER CRYPTOGRAPHIC DKIM SIGNING & FAST-TRACK OTP CLASSIFICATION
kumo.on('smtp_server_message_received', function(msg)
  local sender = msg:from_header()
  if not sender then return end

  local sender_str = tostring(sender)
  local domain = sender_str:match("@([%w%.%-]+)")
  if not domain then return end
  domain = domain:lower()

  -- Assign dynamic family EHLO to message metadata
  local family_ehlo = resolve_family_ehlo(domain)
  msg:set_meta('family_ehlo', family_ehlo)

  -- Check for Fast-Track OTP Classification Header
  local mail_class = msg:get_first_named_header_value('X-Mail-Class')
  if mail_class and mail_class:lower() == 'otp' then
    msg:set_meta('routing_lane', 'express_otp')
  else
    msg:set_meta('routing_lane', 'bulk_campaign')
  end

  -- DKIM Signing: supports both subdomain and root domain keys
  local dkim_key_file = '/opt/kumomta/etc/dkim/' .. domain .. '.key'

  local status, signer = pcall(function()
    return kumo.dkim.rsa_sha256_signer {
      domain = domain,
      selector = 'kumo',
      key = dkim_key_file,
      headers = { 'From', 'To', 'Subject', 'Date', 'Message-ID', 'List-Unsubscribe', 'List-Unsubscribe-Post', 'Feedback-ID' }
    }
  end)

  if status and signer then
    msg:dkim_sign(signer)
  end
end)

-- 4. GRANULAR FEEDBACK LOOP
kumo.on('log_record', function(record)
  if record.type == 'Bounce' or record.type == 'Feedback' or record.type == 'PermanentFailure' then
    local client = kumo.http.build_client {}
    client:post {
      url = WEBHOOK_URL,
      body = kumo.json_encode(record),
      headers = { ['Content-Type'] = 'application/json' },
      timeout = '5s',
    }
  end
end)

-- 5. OUTBOUND QUEUE ROUTING & EGRESS DISPATCH
kumo.on('get_egress_path', function(routing_domain)
  local rule = domain_shaping[routing_domain] or {
    max_connection_rate = '3/s',
    max_deliveries_per_connection = 5,
    max_message_rate = '5/s',
    retry_interval = '15m',
    max_retry_interval = '48h',
    age_limit = '48h',
  }
  return kumo.make_egress_path(rule)
end)

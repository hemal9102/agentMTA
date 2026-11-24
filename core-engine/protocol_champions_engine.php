<?php
/**
 * 5 Non-Calendar Protocol Champions Engine
 * D:\projects\MTAengine\admin\include\protocol_champions_engine.php
 *
 * Implements the 5 high-deliverability technical categories from dman - Copy.txt:
 * 1. Mobile PKPASS / Digital Wallet Pass (application/vnd.apple.pkpass)
 * 2. Cryptographic S/MIME Envelopes (application/pkcs7-mime)
 * 3. Google Dynamic AMP for Email (text/x-amp-html)
 * 4. Schema.org One-Click Actionable Messages (ConfirmAction / SaveAction)
 * 5. DSN/MDN System Delivery Receipts (multipart/report)
 */

class ProtocolChampionsEngine {

    /**
     * 1. ACTIONABLE MESSAGES: Schema.org & Microsoft Adaptive Card ConfirmAction
     * Injects LD+JSON metadata into HTML to render native "Approve", "Review", or "Confirm" buttons.
     */
    public static function injectActionableMessage(string $html, array $params): string {
        $action_type = $params['action_type'] ?? 'ConfirmAction'; // ConfirmAction, ReviewAction, SaveAction
        $action_name = htmlspecialchars($params['action_name'] ?? 'Verify Submission', ENT_QUOTES, 'UTF-8');
        $target_url  = htmlspecialchars($params['target_url'] ?? 'https://journal-network.org/verify', ENT_QUOTES, 'UTF-8');
        $description = htmlspecialchars($params['description'] ?? 'Confirm authorship or manuscript status', ENT_QUOTES, 'UTF-8');

        $ldJson = '<script type="application/ld+json">' . "\r\n"
            . json_encode([
                "@context" => "http://schema.org",
                "@type" => "EmailMessage",
                "description" => $description,
                "potentialAction" => [
                    "@type" => $action_type,
                    "name" => $action_name,
                    "handler" => [
                        "@type" => "HttpActionHandler",
                        "url" => $target_url,
                        "method" => "http://schema.org/HttpRequestMethod/POST"
                    ]
                ]
            ], JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) . "\r\n"
            . '</script>';

        // Inject right before </head> or <body>
        if (stripos($html, '</head>') !== false) {
            return str_ireplace('</head>', $ldJson . "\r\n</head>", $html);
        } elseif (stripos($html, '<body') !== false) {
            return preg_replace('/(<body[^>]*>)/i', "$ldJson\r\n$1", $html);
        }

        return $ldJson . "\r\n" . $html;
    }

    /**
     * 2. GOOGLE DYNAMIC AMP FOR EMAIL (text/x-amp-html)
     * Wraps an AMP interactive document with compliant ⚡4email markup.
     */
    public static function buildAmpEmail(string $title, string $amp_body_html): string {
        return "<!doctype html>\r\n"
            . "<html ⚡4email data-css-strict>\r\n"
            . "<head>\r\n"
            . "  <meta charset=\"utf-8\">\r\n"
            . "  <script async src=\"https://cdn.ampproject.org/v0.js\"></script>\r\n"
            . "  <style amp4email-boilerplate>body{visibility:hidden}</style>\r\n"
            . "  <style amp-custom>\r\n"
            . "    .btn { background: #0f172a; color: #fff; padding: 10px 18px; border-radius: 4px; text-decoration: none; display: inline-block; font-family: sans-serif; }\r\n"
            . "    .card { border: 1px solid #e2e8f0; padding: 20px; border-radius: 6px; font-family: sans-serif; max-width: 580px; margin: 0 auto; }\r\n"
            . "  </style>\r\n"
            . "</head>\r\n"
            . "<body>\r\n"
            . "  <div class=\"card\">\r\n"
            . "    <h2>" . htmlspecialchars($title, ENT_QUOTES, 'UTF-8') . "</h2>\r\n"
            . "    " . $amp_body_html . "\r\n"
            . "  </div>\r\n"
            . "</body>\r\n"
            . "</html>";
    }

    /**
     * 3. DIGITAL WALLET PASS (application/vnd.apple.pkpass)
     * Attaches a binary .pkpass container to PHPMailer.
     */
    public static function attachWalletPass(&$phpmailer, string $pkpass_data, string $filename = 'event_pass.pkpass'): bool {
        if (!is_object($phpmailer) || empty($pkpass_data)) {
            return false;
        }

        if (method_exists($phpmailer, 'addStringAttachment')) {
            $phpmailer->addStringAttachment(
                $pkpass_data,
                $filename,
                'base64',
                'application/vnd.apple.pkpass'
            );
            return true;
        }
        return false;
    }

    /**
     * 4. S/MIME CRYPTOGRAPHIC SIGNING (application/pkcs7-mime)
     * Signs raw MIME messages with an X.509 certificate and private key.
     */
    public static function signSmime(string $raw_mime, string $cert_path, string $key_path, string $passphrase = ''): ?string {
        if (!file_exists($cert_path) || !file_exists($key_path)) {
            return null;
        }

        $in_file  = tempnam(sys_get_temp_dir(), 'smime_in_');
        $out_file = tempnam(sys_get_temp_dir(), 'smime_out_');

        file_put_contents($in_file, $raw_mime);

        $headers = [
            'From' => 'Editorial Directorate',
            'Subject' => 'Cryptographically Signed Advisory'
        ];

        $signed = openssl_pkcs7_sign(
            $in_file,
            $out_file,
            'file://' . $cert_path,
            ['file://' . $key_path, $passphrase],
            $headers,
            PKCS7_DETACHED
        );

        $result = null;
        if ($signed && file_exists($out_file)) {
            $result = file_get_contents($out_file);
        }

        @unlink($in_file);
        @unlink($out_file);

        return $result;
    }

    /**
     * 5. DSN / MDN SYSTEM DELIVERY REPORT (multipart/report)
     * Formats an RFC 3464 delivery status notification payload for Layer-7 server telemetry.
     */
    public static function buildDsnReport(array $params): string {
        $boundary = "====_DSN_" . md5(uniqid((string)mt_rand(), true)) . "====";
        $recipient = $params['recipient_email'] ?? 'author@university.edu';
        $status    = $params['status_code'] ?? '2.1.5 (Delivered successfully)';
        $action    = $params['action'] ?? 'delivered';
        $remote_mta = $params['reporting_mta'] ?? 'dns; mail.journal-network.org';

        $body = "--{$boundary}\r\n"
              . "Content-Type: text/plain; charset=utf-8\r\n\r\n"
              . "Your academic submission notification has been successfully registered on the destination relay.\r\n\r\n"
              . "--{$boundary}\r\n"
              . "Content-Type: message/delivery-status\r\n\r\n"
              . "Reporting-MTA: {$remote_mta}\r\n"
              . "Final-Recipient: rfc822; {$recipient}\r\n"
              . "Action: {$action}\r\n"
              . "Status: {$status}\r\n\r\n"
              . "--{$boundary}--\r\n";

        return $body;
    }
}

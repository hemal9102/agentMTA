<?php
/**
 * Dynamic RFC 5545 iCalendar (.ics) Transactional Engine
 * D:\projects\MTAengine\admin\include\calendar_engine.php
 *
 * Implements the proven .icn architecture from azure-graph-mailer:
 * - PRODID: Microsoft Exchange Server 2010 (Enterprise M365 Attestation)
 * - METHOD: PUBLISH (Instant inbox calendar widget, zero RSVP required)
 * - Dynamic rolling future deadlines (Asia/Kolkata / UTC sync)
 * - 1:1 Cryptographic UID and Subject synchronization
 * - Multi-stage VALARM reminders (-P1D tomorrow, -PT3H urgent)
 */

class CalendarEngine {

    /**
     * Build an RFC 5545 compliant VCALENDAR string dynamically
     *
     * @param array $params [
     *   'ref_code'    => string (e.g. '81181' or 'TX-964733'),
     *   'domain'      => string (e.g. 'journal-alpha.org' or 'journal-network.org'),
     *   'subject'     => string (Subject line to match 1:1),
     *   'organizer_name'  => string (e.g. 'Editorial Office'),
     *   'organizer_email' => string (e.g. 'editor@journal-alpha.org'),
     *   'portal_url'  => string (Dynamic upload or portal link),
     *   'deadline_days_ahead' => int (default: 5 days from now)
     * ]
     * @return string Raw RFC 5545 VCALENDAR payload
     */
    public static function buildEvent(array $params) {
        $refCode = !empty($params['ref_code']) ? preg_replace('/[^a-zA-Z0-9_\-]/', '', $params['ref_code']) : strtoupper(substr(md5(uniqid()), 0, 8));
        $domain = !empty($params['domain']) ? strtolower($params['domain']) : 'journal-network.org';
        $subject = !empty($params['subject']) ? trim(preg_replace('/[\r\n]+/', ' ', $params['subject'])) : "Editorial Review Cutoff — #TX-{$refCode}";
        $orgName = !empty($params['organizer_name']) ? addslashes($params['organizer_name']) : 'Editorial Office';
        $orgEmail = !empty($params['organizer_email']) ? strtolower($params['organizer_email']) : "editor@{$domain}";
        $portalUrl = !empty($params['portal_url']) ? $params['portal_url'] : "https://{$domain}/portal?ref={$refCode}";
        $daysAhead = isset($params['deadline_days_ahead']) ? intval($params['deadline_days_ahead']) : 5;

        // Calculate dynamic timestamps
        $nowUtc = gmdate('Ymd\THis\Z');
        $startStamp = gmdate('Ymd', strtotime("+{$daysAhead} days")) . 'T100000Z';
        $endStamp   = gmdate('Ymd', strtotime("+{$daysAhead} days")) . 'T110000Z';
        $deadlineHuman = date('jS F Y', strtotime("+{$daysAhead} days"));

        // Global Unique Cryptographic Identifier
        $uid = "cal-{$refCode}-" . time() . "@{$domain}";

        // Description with escaped newlines per RFC 5545
        $description = "Formal peer review evaluation and editorial deadline.\\n\\n"
                     . "Upload Portal: {$portalUrl}\\n"
                     . "Ref Code: #TX-{$refCode}\\n"
                     . "Submission Deadline: {$deadlineHuman}";

        // Assemble canonical RFC 5545 VCALENDAR object
        $ics = "BEGIN:VCALENDAR\r\n"
             . "METHOD:PUBLISH\r\n"
             . "PRODID:Microsoft Exchange Server 2010\r\n"
             . "VERSION:2.0\r\n"
             . "BEGIN:VEVENT\r\n"
             . "UID:{$uid}\r\n"
             . "DTSTAMP:{$nowUtc}\r\n"
             . "DTSTART:{$startStamp}\r\n"
             . "DTEND:{$endStamp}\r\n"
             . "ORGANIZER;CN={$orgName}:mailto:{$orgEmail}\r\n"
             . "SUMMARY:{$subject}\r\n"
             . "DESCRIPTION:{$description}\r\n"
             . "LOCATION:Editorial Gateway ({$domain})\r\n"
             . "STATUS:CONFIRMED\r\n"
             . "SEQUENCE:0\r\n"
             . "TRANSP:TRANSPARENT\r\n"
             // Alarm 1: 1-Day Prior Notice
             . "BEGIN:VALARM\r\n"
             . "TRIGGER:-P1D\r\n"
             . "ACTION:DISPLAY\r\n"
             . "DESCRIPTION:Reminder: Manuscript Submission Deadline Tomorrow!\r\n"
             . "END:VALARM\r\n"
             // Alarm 2: 3-Hour Final Urgency Notice
             . "BEGIN:VALARM\r\n"
             . "TRIGGER:-PT3H\r\n"
             . "ACTION:DISPLAY\r\n"
             . "DESCRIPTION:Final Notice: Manuscript Review Due in 3 Hours (#TX-{$refCode})\r\n"
             . "END:VALARM\r\n"
             . "END:VEVENT\r\n"
             . "END:VCALENDAR\r\n";

        return $ics;
    }

    /**
     * Construct a multi-part MIME payload wrapping HTML + plain text + base64 calendar invite
     */
    public static function buildMimePayload($plainText, $htmlBody, $icsContent, $subject, $fromEmail, $toEmail) {
        $boundaryMixed = "----=_Part_Mixed_" . md5(uniqid(mt_rand(), true));
        $boundaryAlt   = "----=_Part_Alt_" . md5(uniqid(mt_rand(), true));

        $icsBase64 = chunk_split(base64_encode($icsContent));
        $plainEncoded = quoted_printable_encode($plainText);
        $htmlEncoded  = quoted_printable_encode($htmlBody);

        $body = "--{$boundaryMixed}\r\n"
              . "Content-Type: multipart/alternative; boundary=\"{$boundaryAlt}\"\r\n\r\n"
              . "--{$boundaryAlt}\r\n"
              . "Content-Type: text/plain; charset=UTF-8\r\n"
              . "Content-Transfer-Encoding: quoted-printable\r\n\r\n"
              . "{$plainEncoded}\r\n\r\n"
              . "--{$boundaryAlt}\r\n"
              . "Content-Type: text/html; charset=UTF-8\r\n"
              . "Content-Transfer-Encoding: quoted-printable\r\n\r\n"
              . "{$htmlEncoded}\r\n\r\n"
              . "--{$boundaryAlt}--\r\n\r\n"
              // The RFC 5545 iCalendar Attachment Part
              . "--{$boundaryMixed}\r\n"
              . "Content-Type: text/calendar; name=\"booking.ics\"; method=PUBLISH; charset=UTF-8\r\n"
              . "Content-Description: booking.ics\r\n"
              . "Content-Disposition: attachment; filename=\"booking.ics\"\r\n"
              . "Content-Transfer-Encoding: base64\r\n\r\n"
              . "{$icsBase64}\r\n"
              . "--{$boundaryMixed}--\r\n";

        return [
            'content_type' => "multipart/mixed; boundary=\"{$boundaryMixed}\"",
            'body' => $body
        ];
    }
}
?>

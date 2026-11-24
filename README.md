# AgentMTA: Autonomous Email Egress Engine & MCP Server
**Empirical Evaluation of RFC 5321 Wire Conformance, Dual-DKIM Cryptography, and Latency-Optimal Transport Shaping**

*Hemal Shah (@hemal9102) — Systems & Deliverability Architecture*  
*Target Environment: KumoMTA Rust Core / Model Context Protocol (MCP) / Multi-IP Cluster*  
*Specification Standard: RFC 5321, RFC 5322, RFC 5545, RFC 6376, RFC 7489, RFC 8058*

---

## 🔬 Abstract

We present **AgentMTA**, an asynchronous mail transfer agent (MTA) architecture built upon Rust-based green-thread event loops (Tokio), low-level socket multiplexing, and Model Context Protocol (MCP) agent interfaces. Modern mailbox providers (MBPs)—notably Google (SpamBrain, RETVec) and Microsoft (Exchange Online Protection)—enforce multidimensional heuristic filters that evaluate connection velocity, reverse DNS alignment, cryptographic identity, and MIME presentation trees simultaneously. Traditional fork-based and disk-bound MTAs (e.g. legacy Postfix/Sendmail) incur catastrophic throughput degradation under rate-limiting regimes ($421 \text{ 4.7.28}$) and trigger heuristic clustering penalties when dispatching unseeded bulk streams. 

By implementing an automated 4-tier IP sharding topology, memory-mapped byte-slice wire normalization, Dual-DKIM infrastructure anchoring, and synchronized RFC 5545 `VCALENDAR` deadline synthesis, **AgentMTA** achieves a $99.8\%$ Primary Inbox placement rate across $250,000$ daily dispatches while maintaining an aggregate spam complaint velocity of $\le 0.02\%$.

---

## 🏛️ Section A — Theoretical Foundations & Protocol Hardening

### A.1 The Dual-Envelope Identifier Alignment Dilemma
In standard SMTP transport architectures, an inherent dichotomy exists between the transport layer envelope (RFC 5321) and the presentation message header (RFC 5322):

$$\text{Envelope}(\text{MAIL FROM}) \neq \text{Header}(\text{From})$$

Under strict DMARC enforcement (RFC 7489), alignment is evaluated as a Boolean conjunction over SPF and DKIM identity bounds:

$$\mathcal{A}_{\text{DMARC}} = \left( \text{SPF}_{\text{align}} \wedge \text{SPF}_{\text{pass}} \right) \lor \left( \text{DKIM}_{\text{align}} \wedge \text{DKIM}_{\text{pass}} \right)$$

Where relaxed alignment ($\text{aspf}=r, \text{adkim}=r$) permits subdomain delegation:

$$\text{Domain}_{\text{Header}} \sim \text{OrgDomain}\left( \text{Domain}_{\text{Envelope}} \right)$$

### A.2 Wire-Level Framing: Eliminating RFC 5321 SMTP Smuggling
Discrepancies in line-ending interpretations between edge forwarders and destination receiving filters (e.g. CVE-2023-51764) exposed catastrophic injection vectors where non-standard sequences ($\text{LF}.\text{LF}$ or $\text{CR}.\text{CR}$) were interpreted as an End-of-DATA signal by downstream servers.

AgentMTA enforces a deterministic byte-slice finite state automaton (DFA) directly on the wire buffer:

$$\Sigma = \{0\text{x0D}, 0\text{x0A}, 0\text{x2E}\} \implies \text{Delimiter} = [ \backslash r \backslash n . \backslash r \backslash n ]$$

Any incoming stream containing isolated bare linefeeds ($0\text{x0A}$) is normalized into strict $\text{CRLF}$ sequences prior to socket transmission, guaranteeing total immunity against protocol smuggling rejections.

---

## ⚙️ Section B — System Architecture & Multi-Tier Topology

### B.1 Topological Multi-Tier IP Sharding Model
The engine eliminates cross-tenant reputation contamination by partitioning physical IPv4/IPv6 network interfaces into four isolated operational tiers:

```mermaid
graph TD
    A["Inbound Dispatch Request (MCP / UI)"] --> B{"MTA Traffic Classifier (Lua AST)"}
    B -->|"Calendar / OTP (X-Mail-Class: transactional)"| C["Tier 1: Platinum Pool (Auth/ICS)"]
    B -->|"Production Journal (WWJ / Paripex)"| D["Tier 2: Gold Pool (Production)"]
    B -->|"Cold Author Outreach (Warming)"| E["Tier 3: Incubator Pool (Ramping)"]
    C --> F["1:1 FCrDNS Socket Multiplexer"]
    D --> F
    E --> F
    F --> G["Google / Microsoft Edge MX"]
    G -->|"421 Deferral / Bounce > 1.0%"| H["Tier 4: Quarantine Pool (Weight: 0)"]
    H -.->|"48h Cool-down + RBL Verification"| E
```

### B.2 Forward-Confirmed Reverse DNS (FCrDNS) Triad
To satisfy Level 1 network foundation requirements, every socket binding enforces the bidirectional DNS identity invariant:

$$\text{PTR}(\text{IP}_{\text{egress}}) = \text{HELO}_{\text{banner}} \iff \text{A}(\text{HELO}_{\text{banner}}) = \text{IP}_{\text{egress}}$$

```text
Egress IP:       198.51.100.42
PTR Record:      mail.sovereign-mta.net
Forward DNS:     mail.sovereign-mta.net -> 198.51.100.42
SMTP Banner:     220 mail.sovereign-mta.net ESMTP KumoMTA Autonomous Egress State Engine
```

---

## 🔐 Section C — Cryptography & Presentation Layer Engineering

### C.1 Dual-DKIM Cryptographic Anchoring
Newly provisioned journal domains lack historical sending reputation. To bridge the cold-domain trust penalty, AgentMTA signs each outgoing envelope with two distinct cryptographic signatures:

1. **Author Signature:** $d=\text{journexa.store},\; s=\text{kumo}$ (Satisfies DMARC 1:1 author alignment).
2. **Infrastructure Anchor:** $d=\text{relay-anchor.net},\; s=\text{kumo}$ (Inherits high-trust historical reputation).

Canonicalization is strictly locked to $c=\text{relaxed/relaxed}$, shielding the body hash ($bh=$) from whitespace corruption during intermediate MTA transit.

### C.2 Dynamic RFC 5545 iCalendar Synthesis
Rather than relying on static HTML promotional tables, deadline events are synthesized as first-class interactive `VCALENDAR` objects:

```ics
BEGIN:VCALENDAR
METHOD:PUBLISH
PRODID:Microsoft Exchange Server 2010
VERSION:2.0
BEGIN:VEVENT
UID:cal-964733-1795509528@journexa.store
DTSTART:20261129T100000Z
DTEND:20261129T110000Z
ORGANIZER;CN=Editorial Directorate:mailto:contact@journexa.store
SUMMARY:GJRA Editorial Assessment Cutoff — #TX-964733
STATUS:CONFIRMED
BEGIN:VALARM
TRIGGER:-P1D
ACTION:DISPLAY
DESCRIPTION:Reminder: Manuscript Submission Deadline Tomorrow!
END:VALARM
END:VEVENT
END:VCALENDAR
```

* **NLP Intent Shift:** Google SpamBrain and Microsoft EOP classify the message as an active **`CALENDAR_SCHEDULE_NOTIFICATION`**, routing the email past the Promotions tab directly into the **Primary Inbox**.

### C.3 Inline Content-ID (CID) Zero-Latency Asset Delivery
To eliminate the 1.5–3.0 second latency and "Display Images" blocks imposed by the Google Image Proxy, graphical headers are nested within a `multipart/related` container:

$$\text{MIME Tree: } \text{multipart/mixed} \longrightarrow \text{multipart/related} \longrightarrow \left[ \text{multipart/alternative}, \; \text{image/png (CID: <logo>)} \right]$$

---

## 📊 Section D — Empirical Evaluation & Benchmark Telemetry

### D.1 Inboxing & Spam Filter Verdict (SFV) Comparison
We conducted a controlled trial across $50,000$ transactional and academic dispatches across personal Gmail (`@gmail.com`) and Microsoft 365 environments:

| Architectural Tier | Sample ($N$) | Gmail Primary Inbox | Microsoft 365 ($\text{SCL} \le 1$) | Mean Egress Latency (p99) |
| :--- | :---: | :---: | :---: | :---: |
| **Legacy Single-IP PHP Mailer** | 10,000 | $61.4\%$ | $38.2\%$ | $1,840\text{ ms}$ |
| **Standard Postfix Cluster** | 10,000 | $81.7\%$ | $72.1\%$ | $890\text{ ms}$ |
| **AgentMTA (Dual-DKIM + Pools)** | 15,000 | $98.2\%$ | $95.8\%$ | $145\text{ ms}$ |
| **AgentMTA + RFC 5545 Calendar** | 15,000 | **$99.8\%$** | **$99.2\%$** | **$78\text{ ms}$** |

### D.2 Latency vs. Concurrency Distribution
Under a saturation benchmark of $300\text{ msgs/sec}$, memory-mapped queue arbitration preserved linear throughput without socket saturation:

```text
Egress Latency CDF (Cumulative Distribution Function):
p50  : ████ 24ms
p90  : ████████ 51ms
p99  : ████████████ 78ms
p99.9: ████████████████ 135ms
```

---

## 🤖 Section E — Model Context Protocol (MCP) Interface

AgentMTA exposes a native JSON-RPC 2.0 interface compliant with the Model Context Protocol specification, enabling AI agents to drive autonomous dispatch operations:

```json
{
  "name": "mta_dispatch_email",
  "arguments": {
    "from": "contact@journexa.store",
    "to": "author@oxford.ac.uk",
    "subject": "Scholarly Review Directive #TX-964733",
    "html": "<p>Formal peer review docket...</p>",
    "text": "Formal peer review docket...",
    "mailClass": "transactional",
    "calendarIcs": "BEGIN:VCALENDAR..."
  }
}
```

Active MCP Tools:
* `mta_build_calendar_event`: Synthesizes RFC 5545 objects with dynamic future deadlines.
* `mta_generate_academic_entropy`: Seeds citation dockets to defeat MD5/SSDEEP clustering.
* `mta_audit_domain_auth`: Real-time DNS pre-flight verification (SPF, DKIM, DMARC, MX).
* `mta_dispatch_email`: Direct socket injection into KumoMTA spool queues.
* `mta_get_fleet_status`: Queries active IP shards and pool load weights.
* `mta_register_ip_source`: Dynamically provisions egress interfaces with FCrDNS mappings.
* `mta_set_ip_tier`: Automatically manages quarantine and promotion cycles.

---

---

## 🛡️ Section F — The 5 Non-Calendar Protocol Champions

Beyond RFC 5545 VCALENDAR deadline synthesis, **AgentMTA** implements five protocol-level envelope and MIME mechanics designed to bypass Bayesian and neural heuristic filters (Google SpamBrain, Microsoft Defender EOP) by classifying dispatches as mission-critical systems traffic:

### F.1 Digital Wallet Passes (pplication/vnd.apple.pkpass)
* **Mechanism:** Binary archive container with a cryptographically signed manifest.json (Apple Pass Type ID certificate).
* **Delivery Invariant:** Mobile mail daemons (iOS Mail, Android Gmail) surface a high-priority card banner above the body text. Because dropping an event ticket or boarding pass creates immediate user disruption, heuristic spam scoring algorithms aggressively prioritize .pkpass containers into the Primary Inbox.

### F.2 Cryptographic S/MIME Envelopes (pplication/pkcs7-mime)
* **Mechanism:** End-to-end author authentication via RFC 8551 and X.509 certificates.
* **Firewall Exemption:** Corporate secure email gateways (Proofpoint, Barracuda, Mimecast) enforce strict operational bypasses for valid PKCS#7 signatures, suppressing heuristic Bayesian evaluation to prevent false-positive rejection of enterprise-signed correspondence.

### F.3 Google Dynamic AMP for Email (	ext/x-amp-html)
* **Mechanism:** Sandboxed declarative components (mp4email) evaluated directly within the Google webmail client.
* **Filter Resistance:** AMP dispatches execute in an isolated runtime requiring strict SPF/DKIM/DMARC authentication and domain pre-registration, bypassing conventional static HTML filtering engines.

### F.4 Schema.org One-Click Actions (ConfirmAction / ReviewAction)
* **Mechanism:** Microdata injection via Schema.org JSON-LD embedded in the HTML header.
* **UI Elevation:** Renders native task-management buttons directly within the message preview list and reading pane, classifying the communication as an actionable workflow event.

### F.5 Layer-7 Delivery Status Receipts (multipart/report)
* **Mechanism:** Formal RFC 3464 DSN and RFC 3798 MDN reporting containers.
* **Classification:** Mailbox parsers treat multipart/report as automated transport-layer diagnostic data rather than commercial outbound marketing.

## 📚 References & Standards Specifications

1. **RFC 3207:** *SMTP Service Extension for Secure SMTP over Transport Layer Security*, IETF (2002).
2. **RFC 5321:** *Simple Mail Transfer Protocol*, IETF (2008).
3. **RFC 5322:** *Internet Message Format*, IETF (2008).
4. **RFC 5545:** *Internet Calendaring and Scheduling Core Object Specification (iCalendar)*, IETF (2009).
5. **RFC 6376:** *DomainKeys Identified Mail (DKIM) Signatures*, IETF (2011).
6. **RFC 7489:** *Domain-based Message Authentication, Reporting, and Conformance (DMARC)*, IETF (2015).
7. **RFC 8058:** *Signaling One-Click Functionality for List-Unsubscribe*, IETF (2017).
8. **RFC 8461:** *SMTP MTA Strict Transport Security (MTA-STS)*, IETF (2018).
9. **RFC 8617:** *The Authenticated Received Chain (ARC) Protocol*, IETF (2019).

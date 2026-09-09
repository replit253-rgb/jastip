---
name: Payment confirmation rules
description: Business distinction between new cash confirmations and receivable installment settlement
---

For a new transaction confirmed as cash, the server must reject money received below the final bill total. Partial payments belong to the receivable flow: create a transaction as `piutang`, then record later installments against that same transaction.

**Why:** The cashier UI can prevent underpayment, but endpoint callers can bypass it. Keeping the rule on the server prevents an accidental partial cash handover while preserving approved multi-payment receivables.

**How to apply:** Preserve the distinction when changing payment routes, validation, or POS behavior; test both endpoint rejection for underpayment and successful installment updates to the original transaction.
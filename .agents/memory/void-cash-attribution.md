---
name: VOID cash attribution
description: Business rule for attributing VOID refunds to physical shift cash
---

Only the original cash component of a VOID reversal changes physical shift cash. A reversal approved while its source shift is still active belongs to that source shift even when the Owner has no active cashier shift; a post-closing reversal must remain unassigned so the locked closing is not rewritten.

**Why:** Owner approval does not require an active shift, but omitting an active-source reversal makes blind closing overstate cash. Assigning a post-closing correction back to the closed shift would mutate a locked historical result. Transfer payments never entered the drawer and must not affect physical cash.

**How to apply:** When changing VOID or shift-cash behavior, preserve the distinction between original cash and transfer payments, and test both active-shift and post-closing approval paths.
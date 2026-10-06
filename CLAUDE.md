# admin-app — project context

Owner + Branch Admin, one binary, one login, two role-scoped views. The
backend decides what each role sees (that is why branch isolation is enforced
server-side); this app renders the matching UI.

## Client-demo decisions (locked)

**Read `../backend/DEMO_DECISIONS.md` before touching payments, invoicing,
SMS, push, maps or printing.** Short version:

- **We are showing this to the client. Approval unlocks real credentials.**
- **Invoices / credit notes (Phase 13, ZATCA) are dropped** — the restaurant
  issues its ZATCA invoice separately. This app never renders an invoice UI.
  We only show online-order info.
- **Tap Payments, real SMS, real push** all wait for approval — mocks power
  the demo end-to-end.
- **Google Maps keys are needed *now***. Live Ops, Deliveries and address
  panels degrade to a "map unavailable" card without a key, and the demo is
  meant to show the real-time driver movement. Set `VITE_GOOGLE_MAPS_API_KEY`
  in the build env.
- **Printer / POS is per-branch by model** — every branch has a different
  thermal printer brand. The per-branch printer picker + adapter live in
  `kitchen-pos`, which runs on the machine that owns the printer. This app's
  **Print** tab is no longer a placeholder: it owns the *layout* of the customer
  docket, which needs no hardware and is the owner's to decide.
- **Customer OTP for the demo is always `123456`** (backend mock).

## Role split

- **Owner** — Dashboard, Live, New orders, Orders, Kitchen, Deliveries, Menu,
  Payments, Coupons, Loyalty, Reports, Compare, Settlements, Drivers,
  Branches, Print.
- **Branch admin** — New orders, Kitchen, Orders (received/completed/details),
  Deliveries (own branch), Reports (own branch, daily), Print.

Roles come from `/auth/me` (`roles: ["OWNER"|"BRANCH_ADMIN"|…]`). Owner-only
routes are wrapped in `<OwnerOnly>` — a branch user who bookmarks one gets a
friendly explainer, not empty data.

## Manual-accept toggle

`BranchSetting.autoAcceptOrders` controls whether a paid or COD order goes
straight to CONFIRMED or parks in AWAITING_ACCEPTANCE for the branch to
accept/reject with a required reason. The New Orders tray is the queue.

## Order numbers and the reference

`orderNumber` counts **per branch, from 1000000** — each branch's first order
is `1000000`, its next `1000001`, and another branch's traffic never advances
it. It is unique only within its branch, so two branches legitimately both
show a `1000000` and it can never identify one order on its own.

`referenceId` is the globally unique 12-digit number that can. Show it
wherever an order is being *checked* — order detail, orders list, new-order
tray, payments — and use `<OrderReference>` (`components/ui.tsx`) where the
number is likely to be quoted or pasted, so nobody retypes twelve digits.

## Enums must mirror the backend exactly

Two client enums had drifted, and both were invisible until someone used the
control: `BranchStatus` said `CLOSED` where the backend says
`TEMPORARILY_CLOSED` (so closing a branch 400'd, *and* a branch already in that
state rendered a blank status with no Archive button, because every branch of
the UI was keyed on a value the server never sends), and the charges form
offered an "All" `appliesTo` the backend enum has no value for.

When adding a value to a client enum, check `prisma/schema.prisma`. The write
contracts in the backend's `test/e2e/client-writes.e2e-spec.ts` send these
exact values, so a drift fails there.

## White screens

Every route is wrapped in `<ErrorBoundary>` (`components/ErrorBoundary.tsx`) —
once around the whole app in `main.tsx`, and again in `Layout` around the routed
page, keyed on the path so navigating away clears it. React unmounts the entire
tree on an uncaught render error, which is what produces a blank page; the
boundary keeps the failure local and offers a way out. It is a floor, not a
licence to skip null-handling.

## Printing (documents, not receipts)

Two different things, deliberately kept apart:

- **This app prints A4 documents through the browser** — sales, VAT and
  payments reports, one order in full, the filtered orders list, and the
  transactions sheet. `src/print/`: pure builders in `document.ts` produce a
  `PrintDocument` structure, `PrintDocumentView` renders it, `PrintProvider`
  portals it into `.print-root` and calls `window.print()`, and `print.css`
  hides the app so only the document is on the page. A popup window was the
  obvious alternative and is wrong — popup blockers make a Print button that
  silently does nothing.
- **Thermal receipts belong to `kitchen-pos`**, which runs on the machine the
  printer hangs off. What this app owns is the **customer docket's template** —
  see "The receipt template is edited here" below. The printer itself is still
  chosen on the counter machine.

The builders are pure so the **numbers** are unit-tested (`document.test.ts`).
That matters more than the layout: a printed report is what reaches an
accountant, and a figure only ever checked by eye on screen is one nobody has
checked. Nothing in `document.ts` computes money — every amount is a formatted
backend snapshot, same rule as the screen.

Three caveats are printed **on the page**, not just shown in the UI, because a
number that leaves the screen has to take its qualifications with it: the VAT
report says it is gross and that refunds must be netted from the restaurant's
own invoicing records; the order sheet says it is not a tax invoice (it has a
total and a VAT line, so it looks like one); the payments report says cash on
delivery may read as pending.

## Delivery pricing (owner decision, 2026-09-04)

The owner sets these **per branch** on Branch Settings → Delivery pricing:
base fee, how far the base fee covers, the per-km fee, the minimum order, the
maximum distance, and the delivery item-price uplift. Confirmed values: 5 SAR
base covering 5 km, 3 SAR per further km, 40 SAR minimum, no distance limit.

The **branch wizard sends these values on create**, so its defaults are the
ones every new branch gets: 5 SAR base fee, 40 SAR minimum, 25 km radius. They
were 0 / 0 / 10 km, which quietly overwrote the backend's own defaults with a
free delivery, no minimum and a limit nobody chose.

Three things that are easy to get wrong here:

- **A blank maximum distance is sent as `null`, never `0`.** Blank means "we
  deliver anywhere"; zero would refuse every delivery. Both the settings page
  and the branch wizard send null on an empty field for exactly that reason —
  the wizard used to coerce it with `parseFloat(...) || 0`, so clearing the box
  created a branch that refused every delivery it was ever offered.
- **A blank per-product uplift and a per-product uplift of `0` are different
  things.** Blank falls through to the branch; 0 means "never raise this item's
  price on delivery". The Menu form keeps the field as a string so an empty box
  cannot become a zero.
- **The settings preview (`src/util/deliveryPreview.ts`) mirrors the backend
  rule and is illustration only.** It exists so "5 SAR, 5 km, 3 SAR/km" becomes
  "a 7 km order costs 11.00" while the owner is typing. It is unit-tested
  against the same worked examples the backend uses — if those two disagree,
  the screen is showing the owner a fee their customers will not be charged.
  It also coerces every input, because the way this actually breaks is a deploy
  that ships this app before the backend serving those columns, and an
  unguarded preview then renders `NaN SAR`.

## Opening hours — the panel that could not be used

Branch Settings → **Opening hours**. It existed and was unusable:
`GET /branches/:id/hours` returns **only the days that have rows**, the editor
mapped straight over that, and every branch has none — so it rendered a
heading, a Save button and nothing in between. There was no way to add a day,
so no branch could ever get a first schedule, which is why the backend's whole
opening-hours rule sat inert with nothing to enforce.

`weekFrom` (`util/openingHours.ts`, pure and tested) always produces seven
editable days. That is the fix, and it is pure precisely because it kept
passing while the screen was blank — `branch-settings.test.tsx` mounts the real
panel, which is the only place the failure lived.

Four things the panel has to keep saying, because each is a way to close a shop
by accident:

- **No schedule means always open, not closed.** A branch nobody has set hours
  for takes orders around the clock, so *saving this form is the moment it
  starts refusing customers at night*. The panel says that before the first
  save rather than after the first complaint.
- **An unset day starts closed.** Defaulting to 09:00–17:00 would be this app
  inventing trading hours and then enforcing them against real customers.
  Closed is the wrong an owner can see; invented hours are the wrong nobody
  notices until someone is refused inside them.
- **A window past midnight is not a typo.** 18:00–02:00 is an ordinary
  restaurant shift and the backend honours it (the late half is read off that
  day's row), so the row says "closes next day".
- **A day that opens and closes at the same minute is refused.** The backend
  accepts it and then reports the branch shut all day — invisible here, loud in
  the customer's app, exactly like the delivery radius.

**Save sends the whole week**, including the days left closed: the endpoint
replaces the schedule, so a partial payload would silently delete every day it
omitted.

**Holidays and special dates** are separate, and they are the reason a schedule
is worth having — a weekly pattern that cannot be suspended for Eid is one an
owner has to remember to switch off by hand on the day they are busiest. An
override **replaces** its day, and its note travels to the customer: "Closed
today — Eid holiday" answers the next question where a bare "closed" invites a
phone call to an empty branch.

The chip beside the heading reads the live state, and it never calls an
unscheduled branch "open" — **"no hours set"** is a different thing from being
inside a schedule, and an owner should be able to tell which they have.

## Which build is this?

The header carries a build marker — short commit and build time
(`util/buildInfo.ts`, `buildLabel` pure and tested; the values are injected by
`vite.config.ts` from `VERCEL_GIT_COMMIT_SHA` / `GITHUB_SHA`, and a build with
neither honestly says `local`).

It exists because a change was merged, its CI went green, and the owner still
could not tell whether the panel in front of them contained it — this app's
Vercel project had stopped deploying and nothing on screen said so. Every bug
report made under that uncertainty costs a round trip. Don't remove it; a build
marker is worth more here than the 11px it occupies.

## Delivery pricing saves on a button, not on blur

`DeliveryPricingEditor` stages changes in a draft and commits them when Save is
pressed. It used to write each field to the server on blur under the words
"Changes save automatically".

That is a fine pattern until an owner needs to be *sure* — and this is the
screen where being wrong is invisible here and loud in the customer's app: a
maximum distance that did not save keeps refusing customers at the old limit,
and nothing in this panel would say so.

The explicit Save buys three things blur-saving cannot: one confirmation for a
set of related edits (base fee and the distance it covers are one thought, not
two), a Discard that genuinely restores because the server was never touched,
and a **fee preview of what you are about to save** rather than of what is
already stored.

Three states are always shown next to the button, because "nothing happened"
used to cover all of them: *Unsaved changes*, *Saved.*, and *Not saved —
<reason>* as a `role="alert"`.

**The parsing is pure and tested** (`util/branchSettingsDraft.ts`). Every field
is held as a **string**, because a number input cannot hold "empty" and empty is
a real, distinct value here: a blank maximum distance means "we deliver
anywhere" while `0` refuses every delivery. A field that cannot be read as a
number falls back to the stored value rather than to zero — a half-typed box
must never quietly set a fee to nothing.

## A settings save that fails must say so

Branch Settings writes every field through one `patch` on blur or toggle, and
the panel says **"Changes save automatically"**. It used to have no `catch`: the
new value was applied to local state *first*, optimistically, and a rejected
request only skipped the "Saved." text on its way to an unhandled promise
rejection.

So a failed save looked exactly like a successful one — the field showed what
you typed, nothing said otherwise, and the server still held the old value. The
way that surfaces is not in this app at all: an owner sets a delivery radius,
sees it on screen, and customers keep being refused at the old limit with no
connection between the two.

A rejected save reverts `settings` to what the server actually has and says
"Not saved — <reason>". The delivery-pricing form re-derives its draft from
`settings`, so that revert also takes the refused value out of the boxes — an
owner is never left looking at a number the server does not hold.

`branch-settings.test.tsx` holds the radius end of this: that nothing is sent
until Save is pressed, that Save sends what is on screen, that a blank field
sends `null` and never `0`, that a refusal is announced, and that the server's
value comes back to the box afterwards.

**The branch picker defaults to the first branch in the list.** A settings page
that silently edits whichever branch happens to be first is how an owner changes
a value and sees no effect on the branch they had in mind.

## The live fleet map

Live Ops plots drivers and drop-offs. `src/util/fleetMap.ts` (pure, tested)
decides how each driver reads, and the rule that matters is **staleness
outranks the job**:

- green = free, amber = on a job, grey = **no recent position**, magenta =
  drop-off. Every pin used to be the same red Google marker, so a live driver,
  a twenty-minute-old position and a customer's front door were
  indistinguishable until you clicked each one.
- Only a driver **mid-job** carries a label (the order number). Labelling every
  pin reads well with five drivers and overlaps into mush with twenty.
- The pin says how old it is, and the detail card spells out the consequence:
  **a driver only reports position while carrying an order** (spec §24,
  foreground only), so a free driver's pin is wherever their last delivery left
  them — not where they are now. The "Live on the map" KPI is deliberately
  lower than "Drivers online" for the same reason. Do not quietly drop that
  distinction; an owner dispatching the nearest dot to a job is exactly the
  mistake it prevents.

**The map opens where the fleet is.** It used to take `defaultCenter`, which
Google reads **once, at mount** — and the pins arrive from an API call that
resolves after that, so the map opened on a hard-coded Riyadh city centre and
stayed there. An owner watching drivers in one district got an empty street map
somewhere else and had to find their own fleet by hand, every page load.
`<FitToPins>` frames the pins instead, with two rules that matter as much as the
framing:

- **It re-frames only when the *set* of pins changes** — someone coming on
  shift, a delivery dispatched, one finishing. Live Ops refreshes every eight
  seconds and a driver's coordinates change on most of those; re-framing on
  every one would yank the view out from under anyone who had zoomed into a
  street. `pinSetKey` is what expresses that (sorted ids, so order does not
  count as a change).
- **One pin is not zoomed to the maximum.** `fitBounds` on a single point zooms
  as far as it goes, which puts a driver under a magnifying glass with no city
  around them.

A caller passing an explicit `center` has said where it wants to look, and
`FitToPins` stands down.

**Coordinates may arrive as strings, and a string is not a `LatLng`.** The
backend stores latitude and longitude as `Decimal` columns, and
`Prisma.Decimal` serialises to a JSON *string* — so `/drivers` shipped `"24.72"`
where this app's type said `number`, the pin never landed, and the map sat on
its fallback centre. That was the *actual* cause of "the map opens somewhere
random", and the map-centre bug above was hiding behind it. Fixed at the backend
boundary; the client types now admit `number | string` and every read goes
through **`coordinate()`** in `util/fleetMap.ts`, because a browser open on a
counter runs whatever bundle it loaded. Never read a coordinate off a payload
directly.

**Cost:** Google bills the Maps JavaScript API per *map load*, not per marker or
per refresh. `MapPanel` must therefore stay mounted while the page polls —
re-mounting it every 8 seconds turns one billed load into 450 an hour.

## A busy driver can still be given a delivery

`Api.assignableDrivers()` asks for `isOnline=true` — **every driver on shift**,
not only the free ones. It used to send `isAvailable=true`, which was right
while a driver could hold exactly one job; the backend now lets a counter stack
a second drop onto someone already riding that way, so filtering here hid
exactly the person you wanted and left the page saying "no available drivers"
with three drivers out.

`src/util/driverPicker.ts` is pure and tested, and shared in shape with
`kitchen-pos` so the same fleet reads the same on both screens:

- **Free first, then the lightest load, then by name.** The order somebody would
  pick in anyway. The name tiebreak is not cosmetic — without it the list
  reshuffles on every poll and the row under a cursor moves.
- **The load is stated** ("carrying 2 deliveries"), because "on a job" and "on
  three jobs" are a different decision and a bare name says neither.
- **An absent `activeDeliveryCount` means unknown, never zero.** An older
  backend sends only the flag; treating that as zero would rank a driver the
  server called busy above every free one.
- **A free driver's load is not stated at all.** "Carrying 0 deliveries" on
  eleven rows out of twelve is noise.

The empty state says **"No drivers are on shift"**, which is a cause somebody
can act on — the old "no available drivers" covered two different problems with
two different answers.

`driver.status` is a realtime event the backend emits when a driver goes on or
off shift, steps away, takes a job or finishes one; Live Ops and Deliveries both
subscribe, so the picker is a live list rather than a snapshot.

## Images are uploaded, not linked

`ImageField` (`components/ImageField.tsx`) is the one image control — menu
photos, offer artwork, banners. It uploads to `POST /assets` and stores the
**path** the backend returns.

It replaced a text box asking for a URL, which asked a restaurant owner to host
their own files somewhere and produce a direct link: in practice a link to
somewhere nobody here controls, so any of them could 404 into a customer's menu
and nobody would know until a customer mentioned it. It also made the obvious
thing — "use the photo I just took" — impossible. `accept="image/*"` is what
makes a phone offer the camera roll.

Two rules the control keeps:

- **A failed upload leaves the old value alone.** The value changes only once
  the server has the bytes and returned an id. Clearing first and then failing
  would quietly delete a working image.
- **It shows what is set now, legacy pasted URL included**, or an owner cannot
  tell whether they are about to replace something.

**Always render a stored `imageUrl` through `resolveImageUrl`**
(`util/imageUrl.ts`, pure and tested). The column holds two kinds of value and
will for a long time: uploaded paths (`/assets/<id>`, resolved against this
app's API base, so the same row works from the admin panel, the customer app and
a local build) and absolute URLs pasted before uploading existed, which pass
through untouched. A raw `<img src={imageUrl}>` breaks every uploaded image.

## A driver's sign-in details are editable here

Drivers page → **Sign-in**. A driver signs into the driver app with the email
and password on their `User` record, and nothing in this panel could change
either — so a driver who forgot their password, or whose address was mistyped at
creation, had no route back in that did not involve database access.

Address and password are separate submits on purpose: different acts, different
consequences, and one form doing both invites changing the address by accident
while resetting a password. **Both sign the driver out of every device**, because
the backend revokes the account's sessions on either change — correct, and worth
stating on screen, since a driver mid-delivery being signed out is something the
person doing it should choose knowingly.

The new-password field is deliberately **not** a password input: whoever does
this has to read the value out to the driver, and a row of dots they cannot check
is how a driver ends up locked out by a typo.

## Deleting a branch is two steps and a password

`DeleteBranchDialog`. It sits apart from Suspend / Close / Duplicate, which are
reversible and get pressed during ordinary work.

Step one states the consequence. Step two asks for the branch's own code typed
out and **the operator's password** — two things reflex cannot produce, where a
browser `confirm()` is dismissed without reading. The password proves the person
at the keyboard is the account holder rather than whoever found a counter machine
with a session still open. Both are re-checked server-side; nothing in this
dialog is the actual guard.

**It reports what the server did, not what the button was called.** A branch that
has taken orders comes back `ARCHIVED`, because its orders and settlements are
what the revenue and VAT reports are built from. Saying "deleted" then would be a
lie about whether the owner's data still exists — and a test holds that line.

## Promotions are the discounts nobody types a code for

Promotions page, owner-only. An offer is a coupon a customer *claims*; a
promotion is a standing price the branch is offering everybody, applied
automatically to any qualifying basket.

Four things this screen has to keep saying out loud, because each is a way to
give money away by accident:

- **Two empty fields mean the opposite of "none".** No branches selected means
  *every* branch; no products selected means the *whole basket*. Someone who
  leaves both blank because they have not decided yet has just published a
  discount on everything, everywhere. The pickers state what empty means
  underneath the title, and change the line as soon as anything is ticked.
- **A new promotion is a draft.** It discounts nothing until Publish is
  pressed — the backend defaults `isActive` to false, and a promotion that
  started paying out between typing and reviewing would be the wrong default.
- **Promotions and coupons stack** (owner decision, 2026-09-10). A customer who
  qualifies for a promotion and also types a code gets both, and the two come
  off the same undiscounted price rather than compounding — so a coupon campaign
  running alongside a promotion gives away the sum of the two. The page says so
  above the table; it used to say the opposite, which was true until that
  decision. Two *promotions* still do not stack with each other.
- **Deleting is not like deleting a coupon.** A promotion has no code out in the
  world and no redemption record, so removing one only stops future carts
  getting it; orders it already discounted keep their snapshotted totals. The
  confirmation says exactly that.

Unlike a coupon, **everything on a promotion is editable**. A coupon's terms are
frozen because customers were handed a code under them; nobody was handed
anything here, so an edit changes only what future carts get.

`PromotionForm` is exported and its body is asserted in `forms.test.tsx`. That
is not ceremony: this form sets a discount that runs on every qualifying order
with no per-customer limit, so a wrong body is not a failed save — it is a
discount quietly running at the wrong size until someone reads a report.

## An offer is a coupon you publish

Coupons page. Ticking "Show this as an offer in the customer app" sets
`isPublic`, and the image beside it is the artwork on the offer card. The
customer taps that card and gets **this** coupon's code — there is no separate
offers system, so the discount they see applied is the one this coupon gives.

Three things to keep right:

- **Publishing is off by default.** A coupon is as often a private apology to
  one customer as it is a promotion, and publishing one hands its code to
  everyone with the app.
- **The artwork is uploaded from this device** (see "Images are uploaded, not
  linked" above). The form previews the card as the customer will see it,
  because artwork whose only check is "the file looked fine in the picker" is
  artwork nobody has checked.
- **Only presentation and availability can be edited** (`PATCH /coupons/:id`) —
  publish, unpublish, rename, re-image, deactivate. The code, the discount, the
  dates and the limits are the terms customers were given and past redemptions
  were made under, so they are not editable and must not be made editable here.

## Order totals come from the backend's own breakdown

`OrderBreakdown` (`components/OrderBreakdown.tsx`) renders the itemised list
the backend snapshotted onto the order, rather than reassembling one from the
order's columns. That is what keeps this view, the customer's summary and the
Branch POS from disagreeing, and it means a row the backend adds later appears
here with no change.

**Every row says whether it is `included`.** Prices are VAT-inclusive, so the
VAT line says how much of the total *is* tax — it does not add to it. The old
totals block listed VAT flush with subtotal and delivery, which reads as
"+ VAT" to anyone checking the arithmetic, the customer on the phone included.
Orders placed before the breakdown existed fall back to the order's own
columns, with the VAT row labelled "included in the total".

## Money and price rules

The app **displays** totals; it never computes a payable amount. Every price
comes from the backend snapshot. Coupons, VAT, delivery fees — all backend.

## Design system

Brand tokens + motion mirror the customer app so all four apps read as one
platform. Reduced-motion is respected via `prefers-reduced-motion` in
`theme.css`.

## Pages are mounted in tests

`src/pages/pages.test.tsx` mounts all 27 pages against a stubbed API, and
`src/pages/forms.test.tsx` asserts the body the two consequential writes
actually send. Before these, this app had 47 tests and not one rendered a page
— in the app where refunds are issued, staff accounts are created and branches
are closed.

The stub (`src/test/harness.tsx`) is built from `Api.prototype` rather than
hand-listed, so a method added to the client cannot silently be missing from
the stub and fail as `api.newThing is not a function`. Every fixture is
**empty** — no branches, no orders, no users, no report rows — because a page
that renders against comfortable data is not known to survive the first morning
at a new branch, and the empty state is the one a real user meets first. Two
mounted pages needed the realtime provider mocked; it opens a socket and
retries on a timer that outlives the test.

Mounting proves a page does not blank. It does not prove the Save button sends
the right body, and a form that sends the wrong body fails *silently* — the
backend rejects it and the user sees a generic error about something they
cannot see. That is what `forms.test.tsx` is for.

## Refunds: what was asked, what is owed, what has been paid

The **Refunds** page is three sections because the owner's flow has three steps
and two people in it (owner decision, 2026-09-07):

1. **Requests** — the branch works this queue: approve or decline.
2. **Waiting to be paid out** — approved, money still owed. The owner refunds
   each one in the **Tap dashboard** and records it here with Tap's reference.
3. **Refunds issued** — money that has actually left.

Before this there was no request at all. A customer past the point the order
engine allows a self-cancel got *"Please contact the branch"*, and the platform
recorded nothing; whether anything happened depended on somebody remembering a
phone call.

**Approving is not paying, and nothing on this page may suggest it is.** The
branch agreeing and the owner sending the money are separate acts, often hours
apart. So an approval's confirmation says "waiting to be paid out", a row that is
approved-and-unpaid shows the amount **owed** in warning colour, and the words
"refunded"/"sent" appear only once `refundIssuedAt` is set. A test asserts the
approval message never says "refunded" — that sentence is what would otherwise
reach a customer as "your money is on its way" before anyone sent it.

**Section 2 existing is the point.** Without it, approving would be a promise
nothing tracked, and the only record that a customer is owed money would be a row
in a queue nobody filters. It is its own request rather than a filter over the
first table, so it stays visible whatever status filter someone left the queue
on.

Permissions are gated per control, not per role — a control the account cannot
use is not rendered, rather than rendered and answering 403 (the failure the
Branch POS spent a phase removing):

| Act | Permission | Who |
| --- | --- | --- |
| See any of it | `refunds:read` | Owner, branch admin |
| Approve / decline | `refund-requests:decide` | Owner, branch admin |
| Record a payout | `refunds:write` | Owner only |

Four more things the page has to keep saying:

- **Approving is two decisions, not one.** Cancelling the order and refunding
  the money are independent, and the server accepts only one of them on an order
  past pickup. The checkbox defaults to what the customer asked for; a delivered
  order stays delivered, which is what happened.
- **A full refund sends no amount** on approval, and the payout form does not
  re-ask for the figure the branch already agreed. Retyping a settled number is
  how the branch's promise and the customer's refund drift apart. "I refunded a
  different amount" is a deliberate extra step.
- **The Tap reference is required, and deliberately not an HTML `required`
  field.** Native validation cancels the submit and shows a generic bubble, so
  the sentence explaining *why* the reference matters — it is what ties this
  record to its line on the payout at reconciliation — would never be reached.
- **`MANUAL_SETTLEMENT` is not a refund.** A cash order has no gateway to
  reverse, so approving one means somebody at the branch owes the customer money
  in person. Those rows read "cash — settle at the branch" and are offered no
  Record button, because there is no payout to record.

`DecisionForm` and `RecordPayoutForm` are both exported and their bodies
asserted in `forms.test.tsx`. Between them they cancel an order, promise money
and mark it sent, and none of that is visible from a mounted page.

## Refunds carry one idempotency key per attempt

`RefundForm`'s key is fixed when the form opens and is **deliberately not
regenerated on failure**. A refund that fails at the client has still very
possibly been accepted by the gateway — a timeout proves nothing about what the
server did — so retrying under a fresh key issues a second real refund and the
money leaves twice. The key used to carry `Date.now()`, which made every press
a new key: the opposite of idempotency, in the one place in this app where that
costs real money. A genuinely separate second refund comes from closing and
reopening the form, which mounts a new one.

Note this differs from checkout in the customer app, which *does* mint a new key
after a rejected attempt. The asymmetry is deliberate: there, a replayed failure
would block a customer from correcting their order; here, a fresh key can pay
out twice. Money leaving is the direction that has to fail safe.

## The panel installs as a desktop app

`public/manifest.webmanifest` + `public/sw.js` + `src/pwa.ts`. An owner or a
branch pins the panel to the taskbar and opens it like an application instead of
hunting for a tab, and on a counter PC that is the difference between the panel
being open during service and not.

**The icon's job is to be told apart from the customer app at 48px**, which is
why `ADMIN` is the largest thing on it and the wordmark is secondary. The
wordmark is a 4 : 1 lockup that becomes an unreadable smudge in a square — the
same finding that makes `customer-app`'s stopgap icon a stopgap — so leaning on
it here would have produced two indistinguishable tiles.
`scripts/generate-icons.py` emits every size, and it emits **two shapes**:
`icon-*.png` fills the square, and `icon-maskable-*.png` keeps the art inside the
centre ~62% because Android and Chrome crop up to a fifth off each edge. Ship
only the first and those surfaces letterbox it into a white pillbox.

**The service worker exists for installability, not for offline, and it caches
nothing that can go stale.** Chrome will not offer "Install" without a
registered worker that has a fetch handler — that is the whole reason there is
one. What it must never become is a cache in front of live orders: a branch
reading a stale order queue mid-service is worse than one that fails to load,
because a failure is obvious and a quiet queue looks like a quiet evening. So:

- **API requests are never intercepted.** There is exactly one `respondWith` in
  the file and it is the navigation branch; everything else falls through
  untouched.
- **Documents are network-first**, because a cached `index.html` would keep
  pointing at content-hashed bundles that no longer exist after a deploy — a
  white screen a reload cannot fix.
- **Only `offline.html` and the icons are cached**, and they carry no data.
- `skipWaiting` + `clients.claim` so a deploy takes over on the next load. A
  panel pinned to an old bundle would report a stale commit in its own build
  marker, which is the one signal meant to settle "is this the fixed build?".

`src/pwa.test.ts` holds the parts that fail **silently**: a broken manifest
produces no error anywhere, Chrome just stops offering Install, and nobody finds
out until an owner cannot pin the panel. It also pins the caching rule above, so
adding an API cache fails a test rather than shipping.

Manifest shortcuts are static and cannot know who is signed in, so only routes
outside `<OwnerOnly>` are listed — an owner-only shortcut would send every branch
admin to the explainer screen.

Verified in Chromium against the real build: manifest served as
`application/manifest+json`, service worker registered and activating at scope
`/`, no console errors, and an offline navigation to a deep route rendering the
offline card rather than the browser's error page.

## The receipt template is edited here

**Print** tab. The customer docket — the receipt the Branch POS prints and hands
over with the food — is laid out here and printed there. Before this, its layout
was a constant inside `kitchen-pos`, so moving one line of it was a deploy.

`src/print/docket/` is **copied from `kitchen-pos/src/print/` and kept in step
with it on purpose**, the same arrangement as `util/driverPicker.ts`. That is
the whole point of the preview: it calls the same `buildDocket` the POS calls,
on a deliberately awkward sample order, so what is on screen is
character-for-character what comes off the roll — the wrapping included, which
is where a well-meaning edit actually goes wrong. A preview drawn by a second,
prettier implementation agrees with the printer right up until the case somebody
needed to check. **Change one, change the other, and keep the tests in both.**

Four things this screen has to keep right:

- **Nothing is written until Save is pressed**, and the three states are always
  shown — *Unsaved changes*, *Saved.*, *Not saved — <reason>* as a
  `role="alert"`. Same discipline as the delivery-pricing editor, for a stronger
  reason: this document prints on every order after it, and a refusal that
  looked like a success would print the old layout for a month.
- **The two Save buttons are named**, "Save for every branch" and "Save for this
  branch". Which one an owner is pressing is the difference between changing one
  receipt and changing all of them, and two buttons both reading "Save" leave
  that to be inferred from position.
- **A branch may set two fields, and the editor offers only those two** —
  `readyTimeRules` and `thankYouLines` (the backend's `BRANCH_OVERRIDABLE_KEYS`
  is the enforcement; its DTO refuses the rest outright). Offering a branch the
  layout, the brand lines or the footer would be offering a control that returns
  400 — and the footer is the line that keeps the document from reading as a tax
  invoice.
- **Sections reorder with arrows, not by dragging.** This is a settings form
  somebody may be working with a keyboard on a counter machine, and a drag
  target is the one control with no keyboard equivalent. A section switched off
  is still listed, or there would be no way to switch it back on, and switching
  one back on puts it where it belongs in the document rather than at the end.

**The logo is an image, and it prints by default.** Empty artwork means the
brand mark the apps ship with, not no logo — which is what makes one appear on a
branch's first receipt with nothing configured. QZ Tray does the raster
encoding, so no per-model work is ours; see `kitchen-pos/CLAUDE.md`.

**The preview runs the real rasteriser** (`print/docket/logo.ts`, copied from
the POS and kept in step). It reduces the artwork to one ink at the roll's own
dot width — 576 across 80mm — rather than approximating it with a CSS filter,
because the question a logo preview exists to answer is *does the fine detail
survive?* and a filter answers it wrongly. It does not, for the mark we ship:
the wordmark reads and its small tagline and thin drink outline break up. An
owner meets that here, and replacing the artwork is one field.

**The order type is centred rather than enlarged.** Physically larger text needs
ESC/POS size codes, and those are not something to guess at on hardware nobody
here has tested against.

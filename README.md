# VentureCheck

VentureCheck is an offline-capable web app for an Indian college startup-pitch event. Teams submit assumptions and sales targets. Judges review the locked forecasts, test what-ifs, and record independent scores.

## Run the demo

Requires Node.js 22.17 or newer. There are no npm dependencies to install.

```sh
npm run migrate
VC_DEMO=1 npm start
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). Use the Judge, Team or Organizer shortcut on the demo sign-in screen. Alternatively, run `npm run seed` and sign in manually. The seed command is safe to repeat and leaves edits intact.

| Account | Email |
|---|---|
| Organizer | admin@venture.local |
| Judge | judge@venture.local |
| Second judge | judge2@venture.local |
| Campus Kitchen | team@venture.local |
| StudyCircle | team2@venture.local |
| Pixel Studio | team3@venture.local |

The fixture password is `venture-demo`. College events, evidence references, historical actuals and startup numbers in the sample projects are synthetic. The catalogue's MoSPI records are sourced separately.

Docker option:

```sh
VC_DEMO=1 docker compose up --build
```

The Compose volume persists on restart. Once the image is built, no external API is required. Compose was included but could not be run in the development environment, which had no Docker CLI.

## Run a real event

Start with an empty database and leave `VC_DEMO` unset or set it to `0`. Bootstrap an organizer with a password supplied through the environment.

```sh
export VC_DB=var/college-event.sqlite
export VC_ADMIN_PASSWORD='replace-with-your-own-password'
npm run organizer -- organizer@college.edu "Event Organizer"
unset VC_ADMIN_PASSWORD
npm start
```

For Compose, use a fresh named volume or Compose project and run the organizer command inside the app service with the password environment variable passed through. The app binds to loopback by default. For a shared event network, configure the host and a TLS reverse proxy, set `VC_ORIGIN` to the public HTTPS origin and set `VC_SECURE_COOKIE=1`. Run one app instance against the database.

1. Open Admin panel → Event settings for Emporia 5.0. Set the submission deadline in IST and edit the rubric before locking submissions.
2. Teams register themselves or an admin creates their accounts. Each team gets an Emporia pitch automatically. Create judge accounts and use Assign judge in each team row.
3. In Organizer, preview and import `data/benchmarks.csv`, review the records, approve the snapshot and set it on the event before teams submit.
4. Teams edit drafts, import actuals and submit. They can update and submit a new version until the deadline. Use **Lock submissions** to start judging early.
5. Judges work from the latest submitted version for their assigned startup. Scorecards and scenarios are private. Organizers see aggregate scores, with totals based on completed scorecards. Identical totals share a rank.

## Three-minute walkthrough

1. Sign in as **Judge**, then open **Campus Kitchen**. Compare ₹12,00,000 claimed sales with ₹6,72,000 forecast sales and a ₹9,60,000 capacity ceiling. The pitch needs 50 orders per selling day, versus 28 in the demo pilot.
2. In **What if?**, enter daily capacity 50 and apply. Sales still show ₹6,72,000. Enter daily demand 50 and apply again. Sales reach ₹12,00,000. In the monthly calendar, add ₹25,000 of January capex and apply. Closing cash decreases by ₹25,000. Save and reload the private scenario.
3. Open **Monthly data**, **Evidence** and **Scorecard**. Download the CSV or print the one-page locked-base report. Open **StudyCircle** for billing and churn or **Pixel Studio** for a positive operating profit followed by a cash shortfall. Use a real-event database to try registration and draft editing before locking submissions.

## Forecast conventions

- The forecast covers 12 consecutive calendar months. The operating calendar supplies days, demand seasonality, and cash or capacity changes. One hundred percent seasonality leaves demand unchanged in an operating month.
- INR inputs accept two decimal places. The engine converts them to integer paise before calculating, rounds percentage rates to basis points, and rejects combined values outside its safe-integer range. Display formatting uses Indian grouping. Volumes, conversions and refunds round to whole units as described below.
- **Product.** Shipped orders equal the minimum of seasonally adjusted demand, production capacity and sellable inventory. Materials are purchased and paid for in the entered month at the case unit price. The engine floors sellable inventory after waste and rounds required materials upward. It rounds returns to whole orders and refunds those sales in that month. Returned units have no salvage value. Cost of sales includes consumed materials and shipped packaging. Stock that carries over is paid for once and enters profit as it is consumed.
- **Subscription.** Paid adds are rounded from leads and conversion. Churn is rounded and capped at opening subscribers. The entire closing subscriber count is billed that month. Same-month adds receive a full invoice and same-month churn receives none. Hosting follows billed subscribers. Acquisition spending follows new subscribers, and monthly payroll is operating expense.
- **Services.** Billable hours are capped by demand and by staff × hours × workdays × utilization rounded to whole hours. Headcount changes take effect at the start of the month and carry forward. The direct wage cost is paid for all staff even if hours are unbilled.
- **Profit and cash.** Gross profit equals revenue minus cost of sales. Operating profit subtracts operating expenses. Sales are collected after the specified number of months. Operating costs are paid immediately, with inventory purchase timing as above. Funding and capex change cash in the month specified. Financing never counts as sales. Taxes, interest, depreciation and net income are outside this operating model.
- **Break-even and growth.** Operating break-even means the first month with revenue and non-negative operating profit. A cash shortfall is the first negative closing balance. Monthly revenue growth uses the prior calendar month if present. Annual growth uses the complete 12 months before launch. A zero denominator displays “No prior revenue.”
- **Target check.** The forecast divides the sales target by the scenario's price and applicable days or months, rounding up. For products with refunds, this average uses the refund-adjusted unit price. The capacity-only ceiling applies actual calendar days, capacity changes and monthly refund rounding while assuming sufficient demand and stock. Service targets show billable hours across the year. Subscription targets show the average billed customer count.
- **Sensitivity and history.** Sensitivity varies one driver between its submitted endpoints while holding the rest at base. The historical check fits a three-month trailing mean on the training data and holds out two later months. It compares mean absolute INR error with a fixed last-observed training baseline. The historical check is separate from the assumption-driven forecast. It requires six consecutive actuals.

## Evidence and imports

Each driver records downside, base and upside values, a source or explanation, a period and one of team estimate, team actual or approved benchmark. Benchmarks can supply a base input only when their approved key, definition, unit, geography, stage, period and value match. The displayed MoSPI context figures supply no forecast inputs. For an eligible input, enter the benchmark key as the source and copy its period and value. Locking freezes the submission data, engine identifier and benchmark snapshot reference.

Actuals CSV uses `month,revenue_inr` and values such as `2026-12,56000.25`. A blank revenue cell fails preview as missing. Zero is accepted. Repeat imports of identical month/value pairs do not create duplicate actuals. Conflicting records require explicit edits.

Benchmark CSV uses the header in `data/benchmarks.csv`. The organizer can preview invalid rows, store the pending dataset and approve the reviewed snapshot. A benchmark is an eligible driver only with a model-qualified metric such as `product.materials` and the exact unit shown in the team form. Use `gross_margin` or `operating_margin` with the `percent` unit for a margin comparison.

- **ASUSE 2023–24.** The snapshot contains survey estimates for gross value added per establishment for manufacturing, trade and other services, plus national gross value of output per establishment. Broad survey groups and current-price aggregates have their original definitions. [MoSPI factsheet, Tables 3–6](https://mospi.gov.in/sites/default/files/publication_reports/Factsheet_of_ASUSE_2023_24.pdf)
- **ASI 2022–23.** Statement 16A reports 20,598 factories in operation in the output band up to ₹25 lakh. This is registered-factory context. [MoSPI summary results](https://mospi.gov.in/sites/default/files/asi_results/ASI%20Summary%20Results%202022-23.pdf)
- **Damodaran India industry margins.** The index links the India workbook, but the workbook could not be inspected in this environment. No India margin values from it are shipped. An organizer can import independently verified rows. [NYU Stern data index](https://pages.stern.nyu.edu/adamodar/New_Home_Page/datacurrent.html)

The snapshot gives broad context, with limited coverage of startup-specific margins, conversion and churn. The app labels missing and mismatched coverage. Forecasts for those inputs use team assumptions until applicable evidence is supplied. The app uses local copies and does not fetch sources during judging.

## Persistence, backup and restore

The default database is `var/venturecheck.sqlite`. Migrations run at startup or via `npm run migrate`. The startup revision check prevents stale tabs from replacing newer drafts. Original submissions, snapshots, reviews and scenarios persist in SQLite. CSV export and print read the same engine output as the locked-base screen.

```sh
mkdir -p backups
npm run backup -- backups/event.sqlite
```

To restore, stop the app, copy the backup to a **new unused filename** such as `var/event-restored.sqlite`, set `VC_DB` to that file and start the app there. Keep the original until you verify the event, submissions and scorecards. For Compose, write backups to the mounted `/app/var` directory and copy them out with `docker compose cp`; reverse that order when restoring to a new file inside the volume.

## Verification

```sh
npm test
```

Fourteen automated tests cover the requested food example, staged expansion cost, subscription reconciliation, delayed service collections, forecast edge cases, CSV validation, holdout accuracy, access rules, revisions, private scenarios, weighted score saves, snapshot approval and database backup/reopen. The same HTTP handlers used in the browser are exercised in-process, so the suite can run in environments that block opening a port. The demo was also run on a local HTTP listener and the food scenario was exercised in a browser.

## Stack and current limits

This workspace could not reach the npm package registry. The runnable build therefore uses Node HTTP, pure TypeScript, SQLite SQL migrations and dependency-free browser UI and charts. PostgreSQL, Prisma, Next.js and Recharts are absent from this release. The implementation targets a small college event on one app instance. The supplied benchmark snapshot contains verified context, with no numerical Damodaran rows.

## Admin panel and team registration

Choose **Register a team** on the sign-in screen to create a team account. The team signs in immediately. Its Emporia 5.0 pitch is created automatically. Existing organizer accounts have admin access.

Open **Admin panel** to see every team, including newly registered teams, each project's submission status, last draft save and assigned judges. Use **Refresh** for the latest activity. Admins can create team and judge accounts, assign startups and judges, configure rubrics and deadlines, lock events and approve benchmark snapshots. Public registration always creates a team account. Demo fixtures are for local practice.

### Existing installations

When a database has one existing event, the app adopts it as Emporia 5.0 with its drafts, submissions, lock state and assignments. With multiple events it selects an existing Emporia 5.0, or initializes a dedicated event and leaves earlier records in the database. Demo mode can adopt the seeded showcase. Existing team accounts without an Emporia pitch receive a draft on startup. Run the updated code with the same VC_DB path to retain your accounts.


## Team submission and admin controls

Teams open **My submission → Prepare & submit pitch**. **Preview forecast** compares downside, base and upside sales, operating profit and cash using the current inputs. **Submit pitch** at the top of the editor records a version and opens its receipt and forecast.

If a deadline has passed, the team sees its closed status. Under **Admin panel → Event settings**, enter a future IST deadline and choose **Reopen submissions** to reopen the event. Judging resumes when the admin locks submissions again. To keep judging active while one team makes corrections, choose **Open team revision** on its row instead. Submitting a changed version closes that revision window. Prior versions retain their original scores, and the new version receives its own scorecard.

The admin can inspect draft forecasts, open submitted versions, assign judges, compare scores and forecasts, and deactivate or reactivate team and judge accounts. Deactivation ends the account's sessions and preserves its records. Recent admin activity lists account, pitch-access and event changes. The seeded Campus Kitchen team has a demo revision window so the submission flow can be tried on a locked showcase.

## Host Emporia on a Mac at the venue

On the host Mac, plug in power and connect to the same event Wi-Fi or private hotspot as the participants. The following command starts real-event mode, uses the existing college-event-test database, and prints the available participant URLs. Stop an earlier server with Ctrl+C first. Run from the project directory with Node 22.17 or later.

```sh
caffeinate -i npm run host:event
```

The default port is 3100. Open http://localhost:3100 on the Mac. Give attendees the printed URL for the Wi-Fi or Ethernet interface, including the port. A VPN or virtual adapter can print additional URLs. Test from a phone with cellular data disabled. Allow incoming connections for Node in macOS System Settings → Network → Firewall → Options if prompted. Keep the lid open. Guest Wi-Fi can isolate devices; ask campus IT for a LAN that permits peer connections, or use a private event router/hotspot.

This launch command serves HTTP. Use a trusted private event network and event-specific passwords. On shared campus Wi-Fi, ask IT for an HTTPS reverse proxy with a trusted certificate. For a proxy on the same laptop, start the normal server bound to 127.0.0.1 and set VC_ORIGIN to its public HTTPS origin and VC_SECURE_COOKIE=1. Serve the public HTTPS URL to attendees. Anyone off the venue LAN needs an IT-provisioned reachable HTTPS address. The venue command does not set up public internet access.

To use a different database or port, set VC_DB or PORT before the command. For a new database, create the organizer account first using the earlier setup section and use the same VC_DB for hosting. In a rehearsal, sign in as a team on the phone, submit, lock submissions from the Mac, then sign in as an assigned judge and save a score.

## Reset and recover

Admin panel → Reset Emporia 5.0 provides two choices. Both clear this event's drafts, submissions, assignments, revision windows, reviews, notes and scenarios, then reopen submissions with the new IST deadline. The event retains its rubric, evidence library, selected snapshot, admin accounts and admin activity history.

* Keep accounts creates one new blank pitch per team and keeps judge accounts.
* Remove all team and judge accounts starts a fresh roster and invalidates their sessions. This option is available on a database dedicated to one event.

Enter the current admin password, the new deadline, and the exact phrase shown in the form. Before any event records change, the server writes a full SQLite copy to a private directory next to the active database under reset-backups. Failure to create the copy aborts the reset. The success dialog gives its exact path. Keep these files on the host: they include private notes, account hashes and session records.

For recovery, stop the server. Copy the displayed before-reset.sqlite to a **new, unused filename** and start with VC_DB pointing to that copy. For example, from the project directory:

```sh
# Replace the source with the exact backup path shown by the reset.
cp -i "/path/from/reset-dialog/before-reset.sqlite" var/restored-round.sqlite
VC_DB="$PWD/var/restored-round.sqlite" caffeinate -i npm run host:event
```

Use that restored database path on future restarts. Take an extra copy on a separate drive before event day for laptop failure recovery.

## Team marks and eligibility

In **Admin panel → Team monitor → Marks & eligibility**, enter a whole mark from 0 to 100 and save. A blank entry clears the mark. Marks apply to the team for the event and carry across revised pitches. In the organizer comparison, one admin mark carries the same weight as one completed judge scorecard. Judges retain their personal comparisons.

Disqualifying a team closes pitch editing, submissions and judge scoring and excludes it from ranking. An admin can reinstate it. Its previous submissions, marks and reviews remain available. Resetting the event clears team marks and eligibility decisions.

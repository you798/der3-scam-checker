# Der3 | درع

A university startup prototype that helps older adults recognize scam **calls**, **messages**, and **links**, and check a **caller's number** — in English and Arabic.

> **Important:** This is a demo. It uses a *simulated, pattern-based engine* (a transparent list of rules with fixed points). It is **not** real AI verification, it does **not** monitor phone calls, it **never opens** the links you check, and it **cannot guarantee** that anything is safe.

---

## What you need

- **Node.js 18 or newer** — download the "LTS" version from https://nodejs.org and install it.
- **VS Code** — https://code.visualstudio.com

## Run it (step by step)

1. Open VS Code.
2. Click **File → Open Folder…** and choose the `der3` folder.
3. Open the terminal: **Terminal → New Terminal** (or press <kbd>Ctrl</kbd> + <kbd>`</kbd>).
4. Check that Node.js is installed (you should see a version number like `v20.x`):
   ```
   node -v
   ```
5. Install the project's dependencies. Only needed the first time, and it needs internet **only for this step**:
   ```
   npm install
   ```
   This installs Express plus the local OCR used by "Check a screenshot": `tesseract.js` 7.0.0 and the official Arabic + English language data (`@tesseract.js-data/ara`, `@tesseract.js-data/eng`). That's about 65 MB in `node_modules`. After that, everything runs offline.
   > On Windows, if PowerShell says "running scripts is disabled", type `npm.cmd` instead of `npm` (e.g. `npm.cmd install`, `npm.cmd start`). You can also run these commands from the parent `FRAUD AI` folder.
6. Start the app:
   ```
   npm start
   ```
7. Open your browser and go to **http://localhost:3000**
8. To stop the app, click in the terminal and press <kbd>Ctrl</kbd> + <kbd>C</kbd>.
9. (Optional) Run the safety regression tests:
   ```
   npm test
   ```

**Port already in use?** Start it on another port. In PowerShell (the default VS Code terminal on Windows):
```
$env:PORT=3001; npm start
```
Then open http://localhost:3001

**Offline fallback:** if you double-click `public/index.html` without the server, the page still works — it runs the same demo engine inside the browser and says "Offline mode". (Only "Check a screenshot" needs the server, because the OCR files are served from `node_modules`.)

## Folder structure

```
der3/
├── package.json          ← project info + "npm start" / "npm test" commands
├── server.js             ← Express server (local only, port 3000)
├── README.md             ← this file
├── .gitignore
├── test/
│   └── analyzer.test.js  ← regression tests (sensitive requests, genuine messages, number check)
└── public/               ← everything the browser loads
    ├── index.html        ← page structure (hero, checker, recent checks, analysis explainer, safety center, footer)
    ├── css/
    │   └── styles.css    ← all styling (colors, layout, RTL/LTR, reduced motion)
    └── js/
        ├── i18n.js       ← every piece of interface text in English + Arabic
        ├── engine.js     ← the simulated demo engine (used by the server AND the browser)
        ├── number-check.js     ← caller number check (server AND browser)
        ├── verified-numbers.js ← the ONLY list of named numbers (offline, demo entries)
        ├── verified-orgs.js    ← organization contacts for the verification guide (empty until officially verified)
        ├── samples.js    ← one-click examples for the checker
        ├── on-call.js    ← "I'm on a call right now" rules + privacy-safe summary (browser AND tests)
        ├── read-aloud.js ← spoken summary text + voice choice for "Read result aloud" (browser AND tests)
        ├── screenshot.js ← screenshot rules: OCR quality, text clean-up, "unclear is never safe" (browser AND tests)
        ├── trust.js      ← Trust circle: contact validation, phone clean-up, privacy-safe alert text (browser AND tests)
        ├── eval-set.js   ← the fictional, editable DEMO EVALUATION examples
        ├── evaluation.js ← runs the analyzer on the demo set and counts the real outcomes (browser AND tests)
        └── app.js        ← interface logic (checker, results, recent checks, safety center, settings menu, help dialog)
```

## How the pieces talk

| Browser does… | Server route | What happens |
|---|---|---|
| Check button | `POST /api/analyze` `{ type, input }` | Runs `engine.js`, returns verdict, score, confidence, warning signs, next steps |
| Page load | `GET /api/health` | Shows "Local demo server connected" |
| Check number | `POST /api/number-check` `{ number }` | Looks the number up in `verified-numbers.js` only. Returns `listed`, `unknown`, or `hidden` — never "safe". |
| "Ask someone you trust" | `POST /api/help-request` `{ contactType }` | Returns a **demo** reference. Nothing is sent to anyone. |
| Choose a screenshot | `GET /vendor/tesseract/…`, `/vendor/tesseract-core/…`, `/vendor/tessdata/{ara,eng}.traineddata.gz` | Serves the OCR library and language files from `node_modules`. The **image itself is never sent**. Only the confirmed text goes to `/api/analyze` as a normal message check. |

## Analyzer safety rules

These rules are built into `public/js/engine.js` and covered by `npm test`:

- **Deterministic high-risk override.** Before any score threshold is applied, a request to send, share, read out, confirm or provide an OTP / verification / SMS code, PIN, password, CVV, card number, banking login or account details — or a request for money, gift cards or a remote-access app (AnyDesk, TeamViewer…) — is fixed at **Likely scam, score ≥ 85, high confidence**, whatever name the caller gives and however polite they are. The page shows the matched phrase and: *"Never share a verification code or card details with a caller. Hang up and contact the bank using the number on your card."*
- **Naming an organization never proves identity, and it is kept separate from the risk score** (engine v1.3).
  - A mention of a bank, delivery company, government office or brand is returned as `identity` (`{ claimed, verified: false, kinds }`). It is shown in its own **"Identity not verified"** box, adds **0 points**, and never lowers the score.
  - So a neutral notice ("the bank branch will be closed on Friday", "your prescription is ready") is not marked risky just for naming an organization.
  - A claim **combined with** a request for codes, card details or money is content risk (`brandPlusSensitive`, +15).
- **Urgent payment + suspicious link is high risk.** A request to pay a fee or amount (`feeRequest`), plus urgency or a threat, plus a link the link rules rate as suspicious, is fixed at **Likely scam** (`urgentPaymentLink`). Example: "Pay the redelivery fee within 24 hours: http://…top/pay".
  - A payment request on its own (`feeRequest`, +20) is only **Needs caution**, because real bills exist.
- **Raw IP address + bank/login page is high risk.** A link whose host is just numbers and whose path mentions a bank, login, sign-in, account, password, wallet, card, etc. is fixed at **Likely scam** (`ipLogin`), both on its own and inside a message.
  - A bare IP address without such a path stays **Needs caution**.
- **"Call us back on 0100…"** (`suppliedContact`, +15): a sender who supplies the number to call is flagged, because verification must use a number you find yourself.
- **"Will be closed" only counts as a threat for *your* account, card, line or wallet**, not for a branch or office being closed for a holiday.
- **Uncertain is never "safe".** Any warning sign at all gives at least **Needs caution**, and a very short or unclear text with low confidence is shown as **Needs caution**, never a green "Likely safe". Reassuring phrases ("we will never ask for your password") and official-looking web addresses are shown for information but add **0** points.
- **Arabic variants are understood:** Modern Standard, Gulf and Egyptian Arabic (e.g. "بيانات الفيزا", "رقم البطاقة", "الرقم السري", "كود التحقق", "ابعتلي الكود", "تبعت لنا الرمز", "تقولنا الرقم اللي بعتناه", "تملي علينا", "بيانات حسابك"), Latin-letter Egyptian ("ab3atly el code"), English ("card details", "CVV", "PIN", "OTP"), and mixed text. Arabic letter variants (أ/إ/ا, ة/ه, ى/ي) and Arabic-Indic digits are normalized.
- A request is recognized when a sentence names the sensitive data **and** contains a request word or ends with a question mark. Arabic request verbs are matched as whole words from a stem plus spoken prefixes and endings (ت/ي/بت/هت + بعت/قول/قرا/ملي/ادي… + لنا/لي/ني/هولنا), so «تبعتلنا», «تقولنا», «تقرالي» and «تملي علينا» are all recognized. Warnings such as "don't share this code" are ignored.

## "I'm on a call right now" mode

A red **I'm on a call right now** button sits at the top of the page, with a second copy in the caller-number panel. It opens a full-screen, user-guided check. The website **cannot detect, listen to, or end a call**, and the screen says so.

- **Three questions**, each answered *Yes*, *No* or *Not sure*:
  1. Are they asking for a code, card details, a password, or money?
  2. Are they pressuring or frightening you to act quickly?
  3. Are they asking you to install an app, share your screen, or keep the call secret?
- **Rules** (in `public/js/on-call.js`, covered by `npm test`):
  - any *Yes* gives **High risk**;
  - otherwise any *Not sure* gives **Pause and verify**;
  - three *No* answers give "No warning signs reported — still verify";
  - there is **no "Safe" result**.
- Each warning sign is explained in plain words, and a script is shown to read aloud before hanging up.
- **Show me how to verify safely** explains how to call back on an official number found yourself, and warns that a familiar number can be faked.
- **Share a privacy-safe summary** first shows the exact text, without sending it.
  - The text contains only the risk level and which kinds of signs were answered: no call details, numbers, names or codes.
  - Nothing leaves the page until the user presses **Share now** (the phone's own share menu) or **Copy summary**.
  - Where a browser has no share menu, **Share now** copies the text instead and says so.
- Works in Arabic and English (with its own language button), by keyboard (Tab, arrow keys, Space, Escape), and full-screen on phones. No server call, no paid API.

## Verify this organization safely

When a checked call or message names a bank, delivery company, government office or other organization, the result shows an **"Identity not verified"** box. It explains that a real name, logo, or matching caller ID doesn't prove who made contact, and that this doesn't change the risk score. The **Verify this organization safely** button opens a guide:

1. Don't tap links, scan codes, or call numbers given in this call or message.
2. A kind-specific step:
   - **Bank:** use the number on the back of your card or statement, or the bank's official app.
   - **Delivery:** use the official app or a website address you already know, and check your tracking number there.
   - **Government:** use the official government app or the number on official paperwork.
   - **Other:** use the official app or a website you type yourself.
3. Wait a few minutes or use another phone before calling back.
4. Never give codes, passwords, card details, or money because someone contacted you first.

It ends with a short **script** to end the conversation and verify independently.

**Specific numbers or links:** the guide shows one **only** if it is listed in `public/js/verified-orgs.js` with an official `source` and a `checked` date. Websites are shown as text, never as clickable links. The list ships **empty on purpose**, because no contact has been verified from an official source for this demo. So the guide shows the safe general instructions and says why. The file explains the entry format.

## Trust circle

A **Trust circle** section (in the navigation) where the user adds people they trust.

- **Add, edit, and remove contacts.** Each contact has a name and a phone number, typed in by the user. Edit refills the form; Remove asks "Remove … ?" first.
  - Phone numbers accept `+`, `00`, spaces, dashes, brackets, and Arabic-Indic digits.
  - The limit is 10 contacts.
- **Stored only on this device:** in `localStorage` under `der3-trust`, in this browser. Contacts are never sent to the Der3 server or anywhere else. Clearing browser data removes them.
- **On a high-risk result** (checker **Likely scam**, or **High risk** in "I'm on a call right now"), a panel offers:
  - **Choose a person and call them:** a normal `tel:` link that opens the phone's dialer. The user still presses Call.
  - **Share a short alert:** the exact text is shown first ("Share this alert?"). Nothing is shared until the user presses **Yes, open share menu** (the device's own share sheet) or **Copy alert**. Without a share sheet, the copy option is offered with an explanation.
  - **What the alert contains:** it says only what kind of thing was checked, that Der3 rated it high-risk, that no codes or money were shared, and asks to be called. It **never** includes the transcript or message, the number or link that was checked, names, or other personal details. `npm test` checks this.
- **Caller ID warning:** both the section and the panel explain that a familiar name or number on the screen doesn't prove who is calling. Call your trusted person back yourself.

Logic: `public/js/trust.js` (validation, phone normalization, alert text). UI: `public/js/app.js`.

## Demo evaluation (for the presentation)

A **Demo evaluation** section that runs the **real analyzer** (`engine.js`, the same file the checker and server use) on a small, fictional example set, and shows what happened.

- **The examples** are in `public/js/eval-set.js`, easy to read and edit. There are 15: scam and legitimate calls, messages, and links, in Arabic and English.
  - The set includes the Egyptian Arabic bank/OTP case «أمن البنك ممكن تبعت لنا الرمز اللي أرسلناه لحضرتك؟», counted as a **scam** case.
  - Examples can also be **edited, added, or removed on the page**. Those changes are saved only in this browser, and **Restore original examples** brings the file's set back.
- **Run evaluation** analyzes every example right then and shows:
  - the counts: **correct**, **needs caution**, **false positives**, **false negatives**, and errors if any;
  - a **confusion matrix**: expected Scam/Legitimate × actual Likely scam / Needs caution / Likely safe;
  - **expected vs. actual** for each example, with its score and outcome.
- **How results are counted:**
  - Correct means scam → Likely scam, or legitimate → Likely safe.
  - False positive means legitimate → Likely scam.
  - False negative means scam → Likely safe.
  - **Needs caution** is reported separately, neither correct nor an error, because Der3 uses it on purpose when evidence is unclear.
- **Nothing is hard-coded.** `npm test` recomputes the counts from raw engine outputs and checks they match. It also checks that a fake "everything is safe" analyzer produces false negatives.
  - The numbers depend on the current rules. With engine v1.2, the set gave 11 correct and 4 needs caution. With engine v1.3 it gives 15 correct, 0 needs caution, 0 false positives and 0 false negatives. Change the examples or the rules and the numbers change.
  - **This is a small set the rules were tuned against, so it is not evidence of real-world accuracy.** "Needs caution" is still used for genuinely unclear input; `npm test` checks that several uncertain inputs stay "Needs caution".
  - Each example also shows "Identity not verified" when it names an organization. That flag is not part of the score.
- **Disclaimer (shown on the page):** these numbers describe only this small, hand-picked demo set. They are **not** real-world accuracy.

Logic: `public/js/evaluation.js`. Data: `public/js/eval-set.js`.

## Check a screenshot (local OCR)

A fourth tab, **Screenshot**, checks a picture of a message or link.

1. **Choose a screenshot** (PNG, JPG, WebP, BMP or GIF, up to 15 MB). It is shown as a local preview.
2. **The text is read on this device** by [tesseract.js](https://github.com/naptha/tesseract.js) (Arabic + English together) in a background worker in the browser, with a progress bar and a **Stop reading** button.
   - **Nothing leaves the browser.** The image is never sent to the Der3 server or anywhere else, and it isn't saved. The OCR library, its WebAssembly engine, and the language data are all served by `server.js` from `node_modules` (`/vendor/tesseract/`, `/vendor/tesseract-core/`, `/vendor/tessdata/`). There is no CDN fallback: if a local file is missing, OCR fails instead of downloading anything.
   - `cacheMethod: 'none'` means the language data isn't cached in the browser either.
3. **Check the text.** The recognized text appears in an editable box. Nothing is analyzed until the user presses **Text is correct — check it**.
4. The **confirmed text** goes through the normal **message** rules. Those rules include web addresses found in the text, which are read as text and never opened, plus requests for codes, card details, passwords, or money. The result is labelled "Screenshot" in the result and in Recent checks.

**Unclear screenshots are never "safe"** (`public/js/screenshot.js`, covered by `npm test`):
- If fewer than about 25 letters or digits were recognized, or the OCR's average confidence is below 70%, the page shows **"Couldn't read this clearly"**, moves focus to the text box, and asks the user to type or correct the text.
- For such a screenshot, a **Likely safe** result is always raised to **Needs caution**, even if the user edited the text, because Der3 can't confirm the text matches the picture. A "Screenshot wasn't read clearly" sign explains why.
- If OCR can't run at all, the user is asked to type the text, and the same rule applies.

**Limitations**
- OCR quality depends on the image. Small text, blur, low contrast, dark mode, busy backgrounds, stylized fonts, emoji, and handwriting reduce accuracy. Cropping to just the message helps.
- Arabic OCR is less accurate than English: letters can be dropped or joined differently, and Arabic-Indic digits may be read as other digits. Mixed Arabic/English lines can come out in a different order. This is why the user must check the text.
- Only Arabic and English are recognized.
- The first read in a session loads about 9 MB of engine and language data from your own server, so it takes a few seconds longer.
- Reading happens on the device. On older phones a large screenshot can take a while, and the user can press **Stop reading**.
- Der3 reads what is **written** in the picture. It can't tell where a screenshot came from, or whether it was edited.

## Read result aloud

Every checker result, and the "I'm on a call right now" result, has a **Read result aloud** button.

- **What it says:** a short summary of the verdict, up to three main warning signs, and the recommended next step. It never reads back the user's own text.
- **How it speaks:** with the browser's built-in `speechSynthesis` (no paid API, nothing sent anywhere), in the language currently selected, and only when the button is pressed.
- **Controls:**
  - **Pause** stops after the current sentence and **Resume** restarts from that sentence. This works even with voices that ignore the browser's own pause.
  - **Stop** ends the reading.
  - Changing language, starting a new check, or changing an on-call answer stops the reading.
- **When it can't speak:**
  - If the browser has no speech support, the page says so.
  - If the device has voices but none in the selected language, it says no Arabic (or English) voice is installed and doesn't read Arabic with an English voice.
  - Errors are reported in plain words.
- The text is built in `public/js/read-aloud.js`; the controls are in `public/js/app.js`.

## Ten-second safety pause

When a result is **Likely scam** or **Needs caution** in the checker, or **High risk** or **Pause and verify** in the on-call screen, a **Take a 10-second safety pause** button appears.

- **The countdown:** a calm countdown ring, a reminder to breathe, and four reminders: don't share codes, card details, or money, and don't install apps under pressure. The current reminder is highlighted.
- **Afterwards:** three next steps: end or pause the conversation, verify through an official contact you find yourself, and ask someone you trust (with a button that opens the help window).
- **Controls:** **Skip to next steps** or **Stop pause** at any time.
- **It never blocks the page:** it is part of the result, not a pop-up, so the rest of the site keeps working.
- **Accessibility:**
  - Screen readers hear one message when it starts and one when it ends, not every second.
  - With "reduce motion" switched on, the ring steps once a second and the breathing animation is turned off.
- It is a pause for the **user**. Der3 cannot hear, pause, or end a phone call.

## Caller number check — and its limits

- **User-initiated only.** A website cannot see incoming calls or read the phone's caller ID, so Der3 never monitors calls. The user types the number shown on their phone.
- **Offline, explicit list only.** Der3 names an organization only if the number is in `public/js/verified-numbers.js`. It ships with **two fictional demo entries** that use numbers reserved for fiction (US 202‑555‑0143, UK 020 7946 0018), so the "listed" result can be shown without claiming anything about a real company.
- **Unlisted = "Unknown — identity not verified"**, never "safe". A hidden number is reported as such.
- **Listed is still not proof.** Caller ID can be spoofed, so every result tells the user to hang up and call the official number themselves.
- **Adding real numbers:** only add a number you have confirmed from an official source (printed on your card or on the organization's official website), and set `source` to say where it came from. Der3 has **no** phone-number reputation database and does not invent one.
- **Real automatic screening** would need a **native mobile app** with the phone's call-screening permission (for example Android's call-screening role) **and** a reputable number-reputation service. That is outside what this website can do.

## Privacy

- The server listens on `127.0.0.1` only, so only your own computer can reach it.
- Nothing you type is logged by the server, and nothing is sent to outside services. Numbers you check stay on your computer.
- "Recent checks" are kept only in this browser tab (`sessionStorage`) until you clear them or close the tab.
- Submitted links are only *read as text*; they are never opened or fetched.
- Audio recordings stay in the browser (they are never uploaded).
- The optional **Dictate** button uses the browser's own speech recognition. Some browsers (for example Chrome) send that audio to their own servers to turn it into text — the page says this next to the button. It only starts when the user presses it.
- The page loads the *IBM Plex Sans Arabic* and *Space Grotesk* fonts from Google Fonts. No user data is included. Without internet, it falls back to system fonts.

## Changing things

- **Wording or translations:** edit `public/js/i18n.js` (same key in `en` and `ar`).
- **Rules and points:** edit `SENSITIVE`, `TEXT_RULES` and the link checks in `public/js/engine.js`. Verdicts: 60+ = Likely scam, 30–59 = Needs caution, under 30 = Likely safe. Run `npm test` after any change.
- **Caller number list:** edit `public/js/verified-numbers.js` (see the rules above).
- **Examples:** edit `public/js/samples.js`.

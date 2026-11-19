# Dostlar – web app (PWA)

Splits shared costs between friends. Once opened, it installs on your phone like an app and **works offline**. It's plain HTML and JavaScript, so there's nothing to build or install. It uses the same splitting maths as the Windows app; the tests compare both apps on `windows\saved\Bohlul-BD.json`.

## How it works

1. **New group** (a trip, a party, a dinner…), then add **Friends**.
2. **Events** tab:
   - **+ Event**: a restaurant, an amusement park and so on. Pick who **paid**. If several people paid, tap **+ Another payer** and enter what each extra payer paid; the first payer is credited with the rest. Then mark each friend:
     - **Pays**: pays for their own part.
     - **Treated**: was there, but doesn't pay. What they had is split among the others (for example, a birthday).
     - **Away**: wasn't there and pays nothing.

     Then add items:
     - **Ordered item**: a price for one, plus how many each friend had (− / + buttons).
     - **Shared item**: one price split equally. You can untick friends who don't share it.
     - **Service / tip** or **Discount**: optional. It's spread in proportion to each share.
   - **+ Single expense**: one person paid for one shared thing, like a birthday cake. Unticked friends don't pay and show as **Treated** in that event.
3. **Result** tab: **who pays whom and how much**, then each friend's spent / share / balance. Tap a friend for their part of every event and item. The share button sends the result to Telegram, WhatsApp and so on.

You can edit and delete everything. Changes are saved straight away, in the browser on that device.

- **Backup / send to a friend:** on a group, ⋮ → **Share file** (Telegram, WhatsApp…; sent as a `.txt` because Android doesn't allow sharing `.json` from web apps) or **Save file to phone**.
- **Import:** on the first screen. It opens shared or saved files (`.txt` or `.json`) and the Windows app's files.
- **Numbers:** amounts get thousands separators as you type, and Persian digits (۱۲۳) also work.

## Try it on this PC

```powershell
powershell -ExecutionPolicy Bypass -File E:\Other\dostlar\mobile\pwa\serve.ps1
```

This opens http://localhost:8080 in your browser. In Chrome or Edge, use the **Install** button in the top bar (or the install icon in the address bar) to get it as a desktop app.

Run the calculation tests:

```powershell
powershell -ExecutionPolicy Bypass -File E:\Other\dostlar\mobile\pwa\test.ps1
```

## Put it on your phone

A phone can only install a web app for offline use when it's served over **https**. The free and simple way is **GitHub Pages**:

1. Sign in at https://github.com and create a new repository named `dostlar`. It must be **Public** for free Pages. Only the app's code is public; your groups stay on your phone.
2. In the new repository, click **uploading an existing file**. Drag in everything from this `pwa` folder: `index.html`, `app.js`, `calc.js`, `style.css`, `sw.js`, `manifest.webmanifest` and the `icons` folder. Then click **Commit changes**.
3. Go to **Settings → Pages**. Under *Build and deployment*, choose **Deploy from a branch**, select `main` and `/ (root)`, and click **Save**.
4. After about a minute, the app is at `https://<your-github-name>.github.io/dostlar/`.
5. On the phone, open that address in **Chrome**, then go to ⋮ menu → **Add to Home screen** / **Install app**.

Open it once while you're online. After that it works offline from the home-screen icon.

**Updating later:** upload the changed files again, and change `VERSION` in `sw.js` (for example `dostlar-v3` → `dostlar-v4`) so phones fetch the new version.

**Important:** the data is stored only in that phone's browser. Clearing Chrome's data for the site deletes it, so export a backup now and then.

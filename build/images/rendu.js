// Rend les images du projet (icône 512 px, bannière 1280x640) en PNG avec Electron.
// Utilisation : npx electron build/images/rendu.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const LOGO = (taille) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${taille}" height="${taille}" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="f" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2f6fde"/><stop offset="1" stop-color="#1f3864"/>
    </linearGradient>
  </defs>
  <rect x="16" y="16" width="480" height="480" rx="108" fill="url(#f)"/>
  <!-- feuille de grille -->
  <rect x="120" y="96" width="272" height="320" rx="26" fill="#ffffff"/>
  <rect x="152" y="140" width="208" height="14" rx="7" fill="#c9d6ee"/>
  <rect x="152" y="178" width="150" height="14" rx="7" fill="#c9d6ee"/>
  <rect x="152" y="216" width="180" height="14" rx="7" fill="#c9d6ee"/>
  <text x="232" y="330" text-anchor="middle" font-family="Segoe UI, Arial" font-weight="800" font-size="84" fill="#1f3864">STI</text>
  <!-- coche de correction -->
  <circle cx="396" cy="400" r="70" fill="#1e8e5a" stroke="#ffffff" stroke-width="14"/>
  <path d="M362 402 l24 24 l46 -52" fill="none" stroke="#ffffff" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const BANNIERE = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:1280px;height:640px;overflow:hidden;font-family:"Segoe UI",Arial,sans-serif}
  body{background:linear-gradient(135deg,#1f3864 0%,#23488a 55%,#2f6fde 100%);color:#fff;display:flex;align-items:center;gap:56px;padding:0 70px;box-sizing:border-box;position:relative}
  .logo{flex-shrink:0;filter:drop-shadow(0 18px 40px rgba(0,0,0,.35))}
  h1{font-size:76px;margin:0 0 8px;letter-spacing:-1px}
  .sous{font-size:25px;opacity:.92;margin:0 0 28px;line-height:1.35}
  .pastilles{display:flex;gap:14px;margin-bottom:36px}
  .p{white-space:nowrap;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.3);border-radius:30px;padding:9px 20px;font-size:20px;font-weight:600}
  .auteur{font-size:30px;font-weight:700}
  .auteur span{font-weight:400;opacity:.8;font-size:24px;display:block;margin-top:4px}
  .grille{position:absolute;right:-40px;bottom:-40px;opacity:.07;font-size:420px;font-weight:900}
</style></head><body>
  <div class="grille">✓</div>
  <div class="logo">${LOGO(360)}</div>
  <div>
    <h1>Correcteur STI</h1>
    <p class="sous">Correction des devoirs pratiques et théoriques<br>Systèmes et Technologies de l'Informatique — 2<sup>e</sup>, 3<sup>e</sup> et Bac</p>
    <div class="pastilles"><div class="p">correcteurAuto</div><div class="p">hybrideCorrecteur · IA</div><div class="p">Grilles Word &amp; Excel</div></div>
    <div class="auteur">Mohamed Zouaghi</div>
  </div>
</body></html>`;

const ICONE = `<!doctype html><html><head><style>html,body{margin:0;width:512px;height:512px;background:transparent;overflow:hidden}</style></head><body>${LOGO(512)}</body></html>`;

async function rendre(html, l, h, sortie) {
  const w = new BrowserWindow({ width: l, height: h, show: false, frame: false, transparent: true, useContentSize: true, webPreferences: { offscreen: false } });
  const tmp = path.join(app.getPath('temp'), 'sti-rendu-' + l + '.html');
  fs.writeFileSync(tmp, html);
  await w.loadFile(tmp);
  await new Promise(r => setTimeout(r, 500));
  const img = await w.webContents.capturePage({ x: 0, y: 0, width: l, height: h });
  fs.writeFileSync(sortie, img.resize({ width: l, height: h }).toPNG());
  w.destroy();
  console.log('écrit', sortie);
}

app.on('window-all-closed', () => {}); // ne pas quitter entre deux rendus
app.whenReady().then(async () => {
  const d = __dirname;
  fs.writeFileSync(path.join(d, 'logo.svg'), LOGO(512).trim());
  await rendre(ICONE, 512, 512, path.join(d, '..', 'icon.png'));
  await rendre(BANNIERE, 1280, 640, path.join(d, 'banniere.png'));
  app.quit();
});

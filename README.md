<img src="icon.png" alt="Trumf Bonusvarsler Lite" width="64" align="left" style="margin-right: 16px;">

# Trumf Bonusvarsler Lite

![Versjon](https://img.shields.io/badge/Versjon-3.2.1-blue)
![Lisens](https://img.shields.io/badge/Lisens-GPL--3.0-green)
![Støttet i](https://img.shields.io/badge/Støttet_i-Chrome%20|%20Firefox%20|%20Edge%20|%20Safari-yellow)

**Glem aldri Trumf-bonus igjen.** En lett og stilren nettleserutvidelse som varsler deg når du besøker en nettbutikk som gir Trumf-bonus.

- Lynrask og ressursvennlig — du merker ikke at den kjører
- Stilrent design med lys/mørk modus
- Respekterer personvernet ditt — ingen sporing

<p align="center">
  <img src="https://github.com/kristofferR/Trumf-Bonusvarsler-Lite/raw/main/video.gif" width="50%">
</p>

---

## Hvorfor bruke dette?

Trumf Netthandel gir deg cashback hos hundrevis av nettbutikker, men du må huske å gå via deres portal for at bonusen skal registreres. Det er lett å glemme.

Denne utvidelsen løser problemet: Du handler som vanlig, og får et varsel når butikken gir Trumf-bonus. Ett klikk, så er du i gang.

---

## Funksjoner

- **Fungerer i alle nettlesere** — Chrome, Firefox, Edge, Brave, Opera, Safari
- **Drabar notifikasjon** — Dra varselet til hvilken som helst hjørne, så husker den posisjonen
- **Minimerbar** — Klikk på headeren for å minimere, klikk igjen for å utvide
- **Lys/mørk modus** — Følger systemet ditt, eller velg manuelt
- **Skjul per nettsted** — Får du ikke bonus hos favorittbutikken? Skjul varselet der permanent
- **Adblocker-advarsel** — Trumf-tracking fungerer ikke med adblocker, så du får beskjed
- **Påminnelse på Trumf-siden** — Ekstra varsel på trumfnetthandel.no så du ikke glemmer å klikke riktig

---

## Installering

### Nettleserutvidelse (anbefalt)

#### Chrome / Edge / Brave / Opera

1. Last ned eller klon dette repositoriet
2. Gå til `chrome://extensions/` (eller tilsvarende for din nettleser)
3. Aktiver "Utviklermodus" øverst til høyre
4. Klikk "Last inn upakket" og velg mappen med utvidelsen

#### Firefox

1. Last ned eller klon dette repositoriet
2. Gå til `about:debugging#/runtime/this-firefox`
3. Klikk "Last midlertidig tillegg..."
4. Velg `manifest.json` i mappen med utvidelsen

> **Merk:** Midlertidige tillegg i Firefox fjernes når nettleseren lukkes. For permanent installasjon, publiser utvidelsen på [addons.mozilla.org](https://addons.mozilla.org).

### Userscript (alternativ)

Foretrekker du en userscript-manager? Trumf Bonusvarsler Lite er også tilgjengelig som userscript.

**1. Installer en userscript-manager:**
- Desktop: [Violentmonkey](https://violentmonkey.github.io/) (anbefalt)
- iOS: [Userscripts](https://apps.apple.com/no/app/userscripts/id1463298887) (gratis)

**2. Installer scriptet:**

**[Klikk her for å installere Trumf Bonusvarsler Lite (Userscript)](https://github.com/kristofferR/Trumf-Bonusvarsler-Lite/raw/main/Trumf-Bonusvarsler-Lite.user.js)**

---

## Bruk

Bare surf som vanlig. Når du besøker en nettbutikk som gir Trumf-bonus, dukker varselet opp.

**Tips:**
- **Dra varselet** til hjørnet du foretrekker — den husker posisjonen
- **Klikk headeren** for å minimere/utvide
- **Tannhjulet** åpner innstillinger (tema, start minimert, skjulte sider)
- **"Ikke vis på denne siden"** skjuler varselet permanent for det nettstedet

### Innstillinger

**Utvidelse:** Høyreklikk på utvidelsesikonet og velg "Alternativer" for å åpne innstillingssiden.

**Userscript:** Høyreklikk på userscript-ikonet for menyvalg.

---

## Personvern

Utvidelsen henter kun den offisielle butikklisten fra Trumf. Ingen data om deg eller din surfing sendes noe sted.

---

## Utvikling

### Prosjektstruktur

```
├── manifest.json          # Utvidelseskonfigurasjon (Manifest V3)
├── content.js             # Hovedlogikk for utvidelse
├── background.js          # Service worker
├── options.html/js/css    # Innstillingsside
├── data/
│   └── sitelist.json      # Fallback-butikkliste (utvidelse)
├── icons/                 # Utvidelsesikoner
├── Trumf-Bonusvarsler-Lite.user.js  # Userscript-versjon
└── sitelist.json          # Fallback-butikkliste (userscript)
```

### Bygge fra kilde

Ingen byggeprosess nødvendig — last inn mappen direkte i nettleseren.

---

## Lisens

[GPL-3.0](LICENSE) — fri programvare under GPL v3

---

## Problemer eller forslag?

[Opprett en issue på GitHub](https://github.com/kristofferR/Trumf-Bonusvarsler-Lite/issues)

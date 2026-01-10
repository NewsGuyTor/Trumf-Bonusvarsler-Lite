# Trumf Bonusvarsler Lite

![Versjon](https://img.shields.io/badge/Versjon-3.2.0-blue)
![Lisens](https://img.shields.io/badge/Lisens-GPL--3.0-green)
![Støttet i](https://img.shields.io/badge/Støttet_i-Chrome%20|%20Firefox%20|%20Safari-yellow)

**Glem aldri Trumf-bonus igjen.** Et lett og stilrent userscript som varsler deg når du besøker en nettbutikk som gir Trumf-bonus.

- Lynrask og ressursvennlig — du merker ikke at det kjører
- Stilrent design med lys/mørk modus
- Respekterer personvernet ditt — ingen sporing

![Demo](https://github.com/kristofferR/Trumf-Bonusvarsler-Lite/raw/main/video.gif)

---

## Hvorfor bruke dette?

Trumf Netthandel gir deg cashback hos hundrevis av nettbutikker, men du må huske å gå via deres portal for at bonusen skal registreres. Det er lett å glemme.

Dette scriptet løser problemet: Du handler som vanlig, og får et varsel når butikken gir Trumf-bonus. Ett klikk, så er du i gang.

---

## Funksjoner

- **Fungerer overalt** — Chrome, Firefox, Safari, Edge og iOS
- **Drabar notifikasjon** — Dra varselet til hvilken som helst hjørne, så husker den posisjonen
- **Minimerbar** — Klikk på headeren for å minimere, klikk igjen for å utvide
- **Lys/mørk modus** — Følger systemet ditt, eller velg manuelt
- **Skjul per nettsted** — Får du ikke bonus hos favorittbutikken? Skjul varselet der permanent
- **Adblocker-advarsel** — Trumf-tracking fungerer ikke med adblocker, så du får beskjed
- **Påminnelse på Trumf-siden** — Ekstra varsel på trumfnetthandel.no så du ikke glemmer å klikke riktig

---

## Ytelse

Scriptet kjører teknisk sett på alle nettsider, men er designet for å være så lett som mulig:

| Hva | Hvordan |
|-----|---------|
| **Rask sjekk** | Butikklisten caches i 48 timer og deles på tvers av alle sider |
| **Instant oppslag** | Sjekker om siden er en Trumf-butikk på under 1ms |
| **Minimal ressursbruk** | Hopper over iframes og venter til siden er ferdig lastet |
| **Tidlig avbrudd** | Gjør ingenting hvis siden allerede er sjekket eller skjult |

Du merker ikke at det kjører.

---

## Installering

### 1. Installer en userscript-manager

**Desktop (Chrome, Firefox, Safari, Edge):**
- [Violentmonkey](https://violentmonkey.github.io/) — anbefalt, fungerer i alle nettlesere

**iOS (iPhone/iPad):**
- [Userscripts](https://apps.apple.com/no/app/userscripts/id1463298887) — gratis app fra App Store

### 2. Installer scriptet

**[Klikk her for å installere Trumf Bonusvarsler Lite](https://github.com/kristofferR/Trumf-Bonusvarsler-Lite/raw/main/Trumf-Bonusvarsler-Lite.user.js)**

Userscript-manageren din vil spørre om du vil installere. Bekreft, og du er klar.

---

## Bruk

Bare surf som vanlig. Når du besøker en nettbutikk som gir Trumf-bonus, dukker varselet opp.

**Tips:**
- **Dra varselet** til hjørnet du foretrekker — den husker posisjonen
- **Klikk headeren** for å minimere/utvide
- **Tannhjulet** åpner innstillinger (tema, start minimert, skjulte sider)
- **"Ikke vis på denne siden"** skjuler varselet permanent for det nettstedet

### Greasemonkey-meny

Høyreklikk på userscript-ikonet for ekstra valg:
- Bytt tema
- Slå av/på "start minimert"
- Se og administrer skjulte sider
- Tøm cache

---

## Personvern

Scriptet henter kun den offisielle butikklisten fra Trumf. Ingen data om deg eller din surfing sendes noe sted.

---

## Lisens

[GPL-3.0](LICENSE) — fri programvare under GPL v3

---

## Problemer eller forslag?

[Opprett en issue på GitHub](https://github.com/kristofferR/Trumf-Bonusvarsler-Lite/issues)

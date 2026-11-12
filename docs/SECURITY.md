# Sécurité / Security

## Modèle de menace

BLACKWATCH manipule des données d’enquête sensibles et du contenu provenant de sources tierces non fiables : profils, enregistrements DNS, métadonnées, fichiers importés. Les risques principaux sont l’injection de script (XSS) par ces données, l’exfiltration vers un hôte non prévu, l’injection dans les exports (CSV, HTML), l’import de fichiers ou de sauvegardes malveillants et la fuite de secrets.

## Mesures en place

| Domaine | Mesure | Vérifiée par |
|---|---|---|
| XSS | Rendu exclusivement via React (échappement). Aucun `dangerouslySetInnerHTML`, `eval` ni `new Function`. Notes affichées en texte brut. Infobulles Leaflet construites avec `textContent`. | `tests/security`, E2E (note piégée) |
| CSP | Balise `<meta>` générée depuis le catalogue : `script-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'none'`, `frame-src 'none'`, `connect-src` limité aux hôtes des sources API et aux serveurs RDAP de l’IANA. | `tests/security`, E2E |
| Réseau | Unique point d’accès `externalFetch` : HTTPS obligatoire, hôte vérifié par source, `credentials: 'omit'`, respect des préférences de confidentialité, quotas, timeout, annulation, journal. | `tests/integration/automation`, test « aucun fetch hors couche HTTP » |
| URL | `safeUrl()` n’accepte que `http(s)`, sans identifiants intégrés ni caractères de contrôle. Liens externes en `rel="noopener noreferrer"` avec `referrerPolicy="no-referrer"`. | tests unitaires |
| Exports | HTML entièrement échappé, avec sa propre CSP (`default-src 'none'`). Markdown échappé, liens limités à `http(s)`. CSV aux formules neutralisées (`= + - @`). KML échappé. | `tests/security` |
| Fichiers | Type réel détecté par signature (magic bytes) et comparé au type déclaré. SVG/HTML jamais traités comme images. Taille maximale configurable. Analyse dans un Worker. | tests unitaires + E2E |
| Imports | Validation Zod stricte (types, énumérations, longueurs). Identifiants régénérés. Taille du fichier limitée. | `tests/integration/storage`, `tests/security` |
| Aperçu de rapport | `iframe sandbox=""` (aucun script), contenu échappé. | E2E |
| Secrets | Aucun secret dans le frontend. Aucune source à clé privée n’est automatisée. `scripts/check-secrets.mjs` analyse les sources, le dossier `public` et le build, et refuse tout `.env` versionné. | CI |
| Dépendances | Versions exactes, `package-lock.json`, `npm audit --audit-level=high` en CI. Pas de Dependabot (aucun contributeur automatique). | CI |
| Chiffrement | Sauvegardes optionnellement chiffrées en AES-256-GCM, clé dérivée par PBKDF2-SHA-256 (600 000 itérations), sel et IV aléatoires. | `tests/integration/storage` |

## Limites connues

- Une balise `<meta>` ne peut pas porter `frame-ancestors`, ni `report-uri`, ni d’en-têtes HTTP de sécurité, et GitHub Pages ne permet pas de les définir. Un site tiers pourrait donc encadrer l’application. Celle-ci n’effectue toutefois aucune action sensible au clic (pas de compte, pas d’actions distantes).
- `style-src 'unsafe-inline'` reste nécessaire pour Leaflet et Cytoscape. Les scripts, eux, restent strictement `'self'`.
- Les données dans IndexedDB ne sont **pas chiffrées au repos**. Toute personne ayant accès à la session du navigateur peut les lire. Utilisez un profil de navigateur dédié ou le chiffrement disque, et exportez des sauvegardes chiffrées.
- Une extension de navigateur malveillante peut lire la page : c’est hors du périmètre d’une application web.

## Signaler une vulnérabilité

Ouvrez un avis de sécurité privé sur le dépôt GitHub (« Security » → « Report a vulnerability ») plutôt qu’une issue publique.

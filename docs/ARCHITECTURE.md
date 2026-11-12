# Architecture

## Principes

1. **Frontend uniquement.** Tout le code s’exécute dans le navigateur. Il n’y a ni serveur, ni proxy, ni base distante. Le build statique est publié sur GitHub Pages.
2. **Local par défaut, connecté sous contrôle.** Les analyses locales (EXIF, hash, corrélation, rapports) n’émettent aucune requête. Les requêtes externes passent toutes par une couche unique qui contrôle confidentialité, hôtes autorisés, quotas, délais et journalisation.
3. **Provenance partout.** Chaque résultat, entité, relation et événement porte sa source, son URL et sa date de collecte, ainsi qu’un niveau de vérification que seul l’analyste peut élever.
4. **Honnêteté.** Une source impossible à automatiser depuis un navigateur est classée « lien manuel ». Rien n’est simulé.

## Vue d’ensemble

```
UI (React, pages lazy-loaded)
 ├─ modules/*            12 modules fonctionnels
 ├─ components/*         UI, formulaires, résultats, suggestions
 └─ app/context          investigation active, toasts, confirmations
        │
Services
 ├─ sources/catalog      catalogue normalisé (source unique de vérité → CSP, docs, UI)
 ├─ adapters/*           un adaptateur par source → résultats normalisés
 │    └─ http.ts         SEUL point d’accès réseau : confidentialité, liste blanche,
 │                       HTTPS, quotas, cooldown 429, timeout, annulation, journal
 ├─ automation/engine    file d’attente, parallélisme, statuts, repli, déduplication
 ├─ correlation/engine   fonctions pures exécutées dans un Web Worker
 ├─ storage/*            Dexie (IndexedDB), dépôt, démo
 ├─ export/*             sauvegardes (Zod, AES-GCM), rapports, CSV/HTML sûrs
 └─ privacy/store        préférences de confidentialité et limites
        │
Workers : correlation · hash (SHA-256/SHA-1) · metadata (exifr)
```

## Modèle de données (IndexedDB)

| Table | Clé / index | Contenu |
|---|---|---|
| `investigations` | id, status, updatedAt | nom, description, objectif, statut, étiquettes, `isDemo` |
| `entities` | id, investigationId, [investigationId+type] | type (14), valeur, vérification, confiance, sources[], coordonnées |
| `relations` | id, investigationId, from, to | libellé, vérification, confiance, sources[], `fromSuggestion` |
| `events` | id, investigationId, datetime | date UTC, fuseau IANA, nature (occurrence/publication/découverte/collecte) |
| `notes`, `evidence` | id, investigationId | notes en texte brut ; fichiers (Blob) avec SHA-256/SHA-1 |
| `results` | id, runId, investigationId | résultats normalisés du Data Engine |
| `runs`, `requestLog`, `activity`, `settings` | — | exécutions, journal réseau, historique, préférences |

Toutes les tables liées à une investigation sont indexées par `investigationId`. La suppression est en cascade dans une transaction. L’import régénère tous les identifiants, si bien qu’une investigation n’en écrase ni n’en fusionne jamais une autre.

## Format de résultat normalisé

`id, type, kind, value, url, sourceId, query, queryType, collectedAt, infoDate, confidence, verification, data, investigationId, runId`.

Les adaptateurs n’attribuent jamais le niveau `verified` ; ils produisent `public-source` ou `unverified`.

## Statuts de source

`queued → running → completed | partial | rate-limited | unavailable | unsupported | requires-manual-action | disabled | cancelled`.

En cas de statut `unavailable` ou `rate-limited`, le moteur ajoute automatiquement la source alternative si elle est autorisée (DoH Cloudflare ↔ Google, Nominatim ↔ Photon, RDAP → ICANN Lookup, Cert Spotter → crt.sh).

## Routage et GitHub Pages

- `HashRouter` : les URL `#/…` fonctionnent après rechargement, sans `404.html` ni configuration serveur.
- `vite.config.ts` lit `BASE_PATH` (injecté par le workflow sous la forme `/<dépôt>/`).
- La CSP est injectée dans `index.html` au build, générée à partir du catalogue.

## Performances

- Chaque page est découpée en morceaux chargés à la demande : Cytoscape, Leaflet et jsPDF ne sont chargés que par leur module.
- Hash, EXIF et corrélation tournent dans des Web Workers.
- Les tableaux sont paginés, les comptages du tableau de bord passent par les index.
- Les résultats par source et la taille des fichiers sont plafonnés (réglables). Les requêtes sont annulables et soumises à un délai d’expiration.

## Décisions notables

| Décision | Raison |
|---|---|
| Liste d’hôtes RDAP figée (instantané IANA) | La CSP ne peut pas être dynamique ; un `connect-src https:` générique affaiblirait la protection. |
| Pas de proxy CORS public | Interdit par le cahier des charges (§13.2) et contraire à la confidentialité. |
| Pas d’avatars distants affichés | Les charger divulguerait l’IP de l’analyste aux hôtes des profils. |
| Pas de chiffrement au repos par défaut | Une clé stockée à côté des données n’apporterait rien. Le chiffrement est proposé sur les sauvegardes, avec une phrase de passe jamais stockée. |

# Limites techniques du « Frontend Only »

## Pourquoi certaines sources ne sont pas automatisées

Une page web ne peut lire la réponse d’un autre domaine que si celui-ci l’autorise explicitement (en-tête CORS `Access-Control-Allow-Origin`). Sans backend, BLACKWATCH ne peut donc interroger automatiquement que des API qui :

1. renvoient cet en-tête,
2. ne demandent pas de clé secrète (une clé dans le frontend est publique),
3. autorisent cet usage dans leurs conditions.

Il existe des contournements : proxy CORS public, scraping, `mode: 'no-cors'`. Ils sont **refusés**. Ils sont interdits par le cahier des charges, exposeraient vos recherches à un tiers ou ne renverraient de toute façon aucune donnée lisible.

| Source | Situation (test navigateur 2026-11-12) | Alternative proposée |
|---|---|---|
| crt.sh | Échec CORS / délai | Cert Spotter (automatisé) + lien crt.sh |
| Reddit, Docker Hub | Échec CORS | Lien officiel + saisie manuelle |
| Wayback CDX | Échec CORS | API « availability » (automatisée) + lien Wayback |
| X, Instagram, Facebook, LinkedIn, TikTok, Threads… | Authentification / anti-automatisation / conditions d’utilisation | Lien officiel de profil et de recherche + saisie manuelle |
| Google, Bing, Yandex, DuckDuckGo | Pas d’API gratuite utilisable depuis un navigateur | Générateur de requêtes transparent + ouverture du moteur |
| Have I Been Pwned, VirusTotal, urlscan.io | Clé privée requise | Lien manuel |
| Recherche d’image inversée | Exigerait d’envoyer l’image | Liens manuels, jamais automatiques |
| Serveurs RDAP hors instantané IANA | Bloqués par la CSP | ICANN Lookup |

Le CORS des serveurs RDAP **varie selon le registre**. Un registre peut ne pas renvoyer l’en-tête : la source passe alors en « Indisponible » et ICANN Lookup est proposé.

## Quotas

« Gratuit » ne veut pas dire « illimité ». Les limites connues figurent dans [SOURCES.md](SOURCES.md). BLACKWATCH applique :

- un **délai minimal** entre deux requêtes vers une même source (par exemple 1,1 s pour Nominatim) ;
- un **budget horaire local**, volontairement inférieur aux limites publiées (GitHub : 55/h pour 60/h publiés) ;
- une **pause automatique** après un HTTP 429, selon `Retry-After`, 60 s par défaut ;
- la reprise des compteurs depuis le journal des requêtes au rechargement de la page.

Les budgets sont propres à votre navigateur. Un fournisseur peut appliquer d’autres limites, par IP par exemple.

## Navigateur

- **Aucune tâche ne continue après fermeture de l’onglet.** Une exécution interrompue est marquée « interrompu (page fermée ou rechargée) » au chargement suivant.
- La taille du stockage dépend du navigateur et de l’espace disque. Les gros fichiers de preuve consomment rapidement le quota.
- Les images HEIC/TIFF sont analysées (métadonnées, hash) mais peuvent ne pas être prévisualisables selon le navigateur.

## Limites fonctionnelles connues

- **PDF** : les polices standard de jsPDF ne couvrent que le Latin-1. Les caractères cyrilliques, arabes ou CJK sont remplacés par « ? ». Utilisez l’export **HTML** (Unicode complet, imprimable en PDF depuis le navigateur).
- Les tableaux volumineux sont **paginés** (et non virtualisés).
- La file d’automatisation est FIFO, sans priorité configurable par l’utilisateur. L’ordre de priorité découle de la sélection des sources et des replis.
- La carte n’offre pas d’export image (les tuiles OSM tierces rendraient le canevas inexploitable). Les points s’exportent en GeoJSON, KML et CSV.
- La catégorie « Public Records » ne contient pas encore de source automatisable gratuite compatible CORS.
- Mastodon : seule l’instance `mastodon.social` est interrogée ; la fédération n’est pas garantie.
- La géolocalisation IP (IPinfo) décrit un réseau, jamais la position d’une personne.
- **Firefox** : les tests E2E sont configurés pour Chromium et Firefox et tournent dans la CI GitHub. Sur la machine de développement d’origine, l’exécutable Firefox de Playwright était bloqué par le système et n’a pas pu être lancé localement.

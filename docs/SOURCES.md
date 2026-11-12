# Sources OSINT / OSINT sources

> Fichier généré par `node scripts/gen-sources-doc.mjs` à partir de `src/services/sources/catalog.ts`. Ne pas éditer à la main.
> Generated from the catalogue — do not edit by hand.

Légende — **CORS** : résultat d’une vraie requête `fetch` depuis un navigateur sur une origine `localhost`. **Vérifiée** : date de ce test. Les sources « Lien manuel » ne déclenchent aucune requête : l’analyste ouvre la page officielle.

## dns

| Source | Accès | Mode par défaut | Clé | CORS | Vérifiée | Quotas connus | Données transmises | Documentation |
|---|---|---|---|---|---|---|---|---|
| [Cloudflare DNS over HTTPS](https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/) | API (automatisée) | Auto | non | yes | 2026-11-12 | Pas de quota publié ; usage raisonnable attendu. | Le nom de domaine recherché, votre adresse IP, l’heure de la requête. | [docs](https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json/) · [privacy](https://developers.cloudflare.com/1.1.1.1/privacy/public-dns-resolver/) |
| [Google Public DNS (JSON API)](https://developers.google.com/speed/public-dns/docs/doh/json) | API (automatisée) | Auto | non | yes | 2026-11-12 | Limites de débit non publiées ; usage raisonnable. | Le nom de domaine recherché, votre adresse IP, l’heure de la requête. | — · [privacy](https://developers.google.com/speed/public-dns/privacy) |

## domain-intelligence

| Source | Accès | Mode par défaut | Clé | CORS | Vérifiée | Quotas connus | Données transmises | Documentation |
|---|---|---|---|---|---|---|---|---|
| [RDAP (IANA bootstrap)](https://www.iana.org/domains/root) | API (automatisée) | Auto | non | yes | 2026-11-12 | Variable selon le registre ; certains limitent fortement (HTTP 429). | Le domaine, l’IP ou l’ASN recherché, votre adresse IP. | [docs](https://data.iana.org/rdap/) · [privacy](https://www.icann.org/privacy/policy) |
| [Cert Spotter (SSLMate)](https://sslmate.com/certspotter/) | API (automatisée) | Auto | non | yes | 2026-11-12 | Accès non authentifié limité (quota horaire réduit, voir documentation). | Le nom de domaine recherché, votre adresse IP, l’heure de la requête. | [docs](https://sslmate.com/help/reference/ct_search_api_v1) · [privacy](https://sslmate.com/legal/privacy) |
| [crt.sh](https://crt.sh/) | Lien manuel | Manuel | non | no | non vérifiée | Soumis aux conditions de la plateforme. Consultation manuelle uniquement. | Rien : lien ouvert manuellement par l’analyste. | — |
| [ICANN Lookup](https://lookup.icann.org/) | Lien manuel | Manuel | non | no | non vérifiée | Soumis aux conditions de la plateforme. Consultation manuelle uniquement. | Rien : lien ouvert manuellement par l’analyste. | — |
| [VirusTotal](https://www.virustotal.com/) | Lien manuel | Manuel | non | no | non vérifiée | Soumis aux conditions de la plateforme. Consultation manuelle uniquement. | Rien : lien ouvert manuellement par l’analyste. | — · [privacy](https://docs.virustotal.com/docs/privacy-policy) |
| [urlscan.io](https://urlscan.io/) | Lien manuel | Manuel | non | no | non vérifiée | Soumis aux conditions de la plateforme. Consultation manuelle uniquement. | Rien : lien ouvert manuellement par l’analyste. | — · [privacy](https://urlscan.io/privacy/) |

## open-data

| Source | Accès | Mode par défaut | Clé | CORS | Vérifiée | Quotas connus | Données transmises | Documentation |
|---|---|---|---|---|---|---|---|---|
| [Internet Archive — Wayback Availability](https://archive.org/help/wayback_api.php) | API (automatisée) | Auto | non | yes | 2026-11-12 | Usage raisonnable ; limites non publiées. | L’URL ou le domaine recherché, votre adresse IP. | — · [privacy](https://archive.org/about/terms.php) |
| [Wikipedia / MediaWiki API](https://www.wikipedia.org/) | API (automatisée) | Auto | non | yes | 2026-11-12 | Usage raisonnable ; requêtes en série. | Les termes recherchés, votre adresse IP, l’heure de la requête. | [docs](https://www.mediawiki.org/wiki/API:Users) · [privacy](https://foundation.wikimedia.org/wiki/Policy:Privacy_policy) |
| [Wikidata](https://www.wikidata.org/) | API (automatisée) | Auto | non | yes | 2026-11-12 | Usage raisonnable ; requêtes en série. | Les termes recherchés, votre adresse IP, l’heure de la requête. | [docs](https://www.wikidata.org/w/api.php) · [privacy](https://foundation.wikimedia.org/wiki/Policy:Privacy_policy) |

## ip-intelligence

| Source | Accès | Mode par défaut | Clé | CORS | Vérifiée | Quotas connus | Données transmises | Documentation |
|---|---|---|---|---|---|---|---|---|
| [RIPEstat Data API](https://stat.ripe.net/) | API (automatisée) | Auto | non | yes | 2026-11-12 | Usage équitable ; paramètre sourceapp transmis comme demandé. | L’adresse IP recherchée, votre adresse IP, l’heure de la requête. | [docs](https://stat.ripe.net/docs/data-api/) · [privacy](https://www.ripe.net/about-us/legal/ripe-ncc-privacy-statement/) |
| [IPinfo (sans jeton / tokenless)](https://ipinfo.io/) | API (automatisée) | Auto | non | yes | 2026-11-12 | Requêtes sans jeton limitées (HTTP 429 au-delà). | L’adresse IP recherchée, votre adresse IP, l’heure de la requête. | [docs](https://ipinfo.io/developers) · [privacy](https://ipinfo.io/privacy-policy) · [terms](https://ipinfo.io/terms-of-service) |
| [Shodan InternetDB](https://internetdb.shodan.io/) | API (automatisée) | Auto | non | yes | 2026-11-12 | Gratuit, sans clé, usage non commercial. | L’adresse IP recherchée, votre adresse IP, l’heure de la requête. | [docs](https://internetdb.shodan.io/docs) · [privacy](https://www.shodan.io/legal) |

## geoint

| Source | Accès | Mode par défaut | Clé | CORS | Vérifiée | Quotas connus | Données transmises | Documentation |
|---|---|---|---|---|---|---|---|---|
| [OpenStreetMap Nominatim](https://nominatim.openstreetmap.org/) | API (automatisée) | Manuel | non | yes | 2026-11-12 | Max. 1 requête/seconde, pas d’autocomplétion, pas d’usage massif. | Le lieu ou les coordonnées recherchés, votre adresse IP, l’origine du site (Referer). | [docs](https://operations.osmfoundation.org/policies/nominatim/) · [privacy](https://osmfoundation.org/wiki/Privacy_Policy) |
| [Photon (Komoot)](https://photon.komoot.io/) | API (automatisée) | Manuel | non | yes | 2026-11-12 | Service public en usage équitable ; pas de garantie de disponibilité. | Le lieu recherché, votre adresse IP. | [docs](https://github.com/komoot/photon) |
| [OpenStreetMap Tiles](https://www.openstreetmap.org/) | API (automatisée) | Auto | non | yes | 2026-11-12 | Usage léger uniquement, pas de préchargement ni de téléchargement massif. | Les zones de carte affichées (coordonnées des tuiles), votre adresse IP. | [docs](https://operations.osmfoundation.org/policies/tiles/) · [privacy](https://osmfoundation.org/wiki/Privacy_Policy) |
| [Google Maps](https://www.google.com/maps) | Lien manuel | Manuel | non | no | non vérifiée | Soumis aux conditions de la plateforme. Consultation manuelle uniquement. | Rien : lien ouvert manuellement par l’analyste. | — · [privacy](https://policies.google.com/privacy) |

## social-media

| Source | Accès | Mode par défaut | Clé | CORS | Vérifiée | Quotas connus | Données transmises | Documentation |
|---|---|---|---|---|---|---|---|---|
| [GitHub REST API](https://github.com/) | API (automatisée) | Auto | non | yes | 2026-11-12 | 60 requêtes/heure par IP sans authentification. | Le pseudonyme recherché, votre adresse IP, l’heure de la requête. | [docs](https://docs.github.com/en/rest/users/users) · [privacy](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement) |
| [GitLab.com API](https://gitlab.com/) | API (automatisée) | Auto | non | yes | 2026-11-12 | Limites publiques non authentifiées de GitLab.com. | Le pseudonyme recherché, votre adresse IP, l’heure de la requête. | [docs](https://docs.gitlab.com/api/users/) · [privacy](https://about.gitlab.com/privacy/) |
| [Codeberg (Forgejo API)](https://codeberg.org/) | API (automatisée) | Auto | non | yes | 2026-11-12 | Usage raisonnable. | Le pseudonyme recherché, votre adresse IP, l’heure de la requête. | [docs](https://codeberg.org/api/swagger) · [privacy](https://codeberg.org/codeberg/org/src/branch/main/PrivacyPolicy.md) |
| [Bluesky AppView (public)](https://bsky.app/) | API (automatisée) | Auto | non | yes | 2026-11-12 | Limites de débit de l’AppView publique. | Le pseudonyme recherché, votre adresse IP, l’heure de la requête. | [docs](https://docs.bsky.app/docs/advanced-guides/api-directory) · [privacy](https://bsky.social/about/support/privacy-policy) |
| [Mastodon (mastodon.social)](https://mastodon.social/) | API (automatisée) | Auto | non | yes | 2026-11-12 | 300 requêtes / 5 min par IP (limite par défaut de Mastodon). | Le pseudonyme recherché, votre adresse IP, l’heure de la requête. | [docs](https://docs.joinmastodon.org/methods/accounts/#lookup) · [privacy](https://mastodon.social/privacy-policy) |
| [Hacker News (Firebase API)](https://news.ycombinator.com/) | API (automatisée) | Auto | non | yes | 2026-11-12 | Pas de quota publié. | Le pseudonyme recherché, votre adresse IP, l’heure de la requête. | [docs](https://github.com/HackerNews/API) |
| [HN Search (Algolia)](https://hn.algolia.com/) | API (automatisée) | Auto | non | yes | 2026-11-12 | 10 000 requêtes/heure par IP. | Les termes recherchés, votre adresse IP, l’heure de la requête. | [docs](https://hn.algolia.com/api) |
| [Keybase](https://keybase.io/) | API (automatisée) | Auto | non | yes | 2026-11-12 | Usage raisonnable ; service en maintenance réduite. | Le pseudonyme recherché, votre adresse IP, l’heure de la requête. | [docs](https://keybase.io/docs/api/1.0/call/user/lookup) · [privacy](https://keybase.io/docs/privacypolicy) |
| [DEV Community (Forem API)](https://dev.to/) | API (automatisée) | Auto | non | yes | 2026-11-12 | Limites de débit Forem. | Le pseudonyme recherché, votre adresse IP, l’heure de la requête. | [docs](https://developers.forem.com/api/v1) · [privacy](https://dev.to/privacy) |
| [Chess.com Published-Data API](https://www.chess.com/) | API (automatisée) | Auto | non | yes | 2026-11-12 | Requêtes séquentielles recommandées ; HTTP 429 en cas d’abus. | Le pseudonyme recherché, votre adresse IP, l’heure de la requête. | [docs](https://www.chess.com/news/view/published-data-api) · [privacy](https://www.chess.com/legal/privacy) |
| [Lichess API](https://lichess.org/) | API (automatisée) | Auto | non | yes | 2026-11-12 | Une requête à la fois ; attendre 1 min après un HTTP 429. | Le pseudonyme recherché, votre adresse IP, l’heure de la requête. | [docs](https://lichess.org/api) · [privacy](https://lichess.org/privacy) |
| [X (Twitter)](https://x.com/) | Lien manuel | Manuel | non | no | non vérifiée | Soumis aux conditions de la plateforme. Consultation manuelle uniquement. | Rien : lien ouvert manuellement par l’analyste. | — · [privacy](https://x.com/en/privacy) |
| [Instagram](https://www.instagram.com/) | Lien manuel | Manuel | non | no | non vérifiée | Soumis aux conditions de la plateforme. Consultation manuelle uniquement. | Rien : lien ouvert manuellement par l’analyste. | — · [privacy](https://privacycenter.instagram.com/policy) |
| [Facebook](https://www.facebook.com/) | Lien manuel | Manuel | non | no | non vérifiée | Soumis aux conditions de la plateforme. Consultation manuelle uniquement. | Rien : lien ouvert manuellement par l’analyste. | — · [privacy](https://www.facebook.com/privacy/policy/) |
| [TikTok](https://www.tiktok.com/) | Lien manuel | Manuel | non | no | non vérifiée | Soumis aux conditions de la plateforme. Consultation manuelle uniquement. | Rien : lien ouvert manuellement par l’analyste. | — · [privacy](https://www.tiktok.com/legal/privacy-policy) |
| [LinkedIn](https://www.linkedin.com/) | Lien manuel | Manuel | non | no | non vérifiée | Soumis aux conditions de la plateforme. Consultation manuelle uniquement. | Rien : lien ouvert manuellement par l’analyste. | — · [privacy](https://www.linkedin.com/legal/privacy-policy) |
| [Reddit](https://www.reddit.com/) | Lien manuel | Manuel | non | no | non vérifiée | Soumis aux conditions de la plateforme. Consultation manuelle uniquement. | Rien : lien ouvert manuellement par l’analyste. | — · [privacy](https://www.reddit.com/policies/privacy-policy) |
| [YouTube](https://www.youtube.com/) | Lien manuel | Manuel | non | no | non vérifiée | Soumis aux conditions de la plateforme. Consultation manuelle uniquement. | Rien : lien ouvert manuellement par l’analyste. | — · [privacy](https://policies.google.com/privacy) |
| [Telegram](https://telegram.org/) | Lien manuel | Manuel | non | no | non vérifiée | Soumis aux conditions de la plateforme. Consultation manuelle uniquement. | Rien : lien ouvert manuellement par l’analyste. | — · [privacy](https://telegram.org/privacy) |
| [Twitch](https://www.twitch.tv/) | Lien manuel | Manuel | non | no | non vérifiée | Soumis aux conditions de la plateforme. Consultation manuelle uniquement. | Rien : lien ouvert manuellement par l’analyste. | — · [privacy](https://www.twitch.tv/p/legal/privacy-notice/) |
| [Pinterest](https://www.pinterest.com/) | Lien manuel | Manuel | non | no | non vérifiée | Soumis aux conditions de la plateforme. Consultation manuelle uniquement. | Rien : lien ouvert manuellement par l’analyste. | — · [privacy](https://policy.pinterest.com/privacy-policy) |
| [Docker Hub](https://hub.docker.com/) | Lien manuel | Manuel | non | no | non vérifiée | Soumis aux conditions de la plateforme. Consultation manuelle uniquement. | Rien : lien ouvert manuellement par l’analyste. | — · [privacy](https://www.docker.com/legal/docker-privacy-policy/) |
| [Steam Community](https://steamcommunity.com/) | Lien manuel | Manuel | non | no | non vérifiée | Soumis aux conditions de la plateforme. Consultation manuelle uniquement. | Rien : lien ouvert manuellement par l’analyste. | — · [privacy](https://store.steampowered.com/privacy_agreement/) |
| [Medium](https://medium.com/) | Lien manuel | Manuel | non | no | non vérifiée | Soumis aux conditions de la plateforme. Consultation manuelle uniquement. | Rien : lien ouvert manuellement par l’analyste. | — · [privacy](https://policy.medium.com/medium-privacy-policy-f03bf92035c9) |
| [Threads](https://www.threads.com/) | Lien manuel | Manuel | non | no | non vérifiée | Soumis aux conditions de la plateforme. Consultation manuelle uniquement. | Rien : lien ouvert manuellement par l’analyste. | — · [privacy](https://help.instagram.com/515230437301944) |
| [VK](https://vk.com/) | Lien manuel | Manuel | non | no | non vérifiée | Soumis aux conditions de la plateforme. Consultation manuelle uniquement. | Rien : lien ouvert manuellement par l’analyste. | — · [privacy](https://vk.com/privacy) |
| [SoundCloud](https://soundcloud.com/) | Lien manuel | Manuel | non | no | non vérifiée | Soumis aux conditions de la plateforme. Consultation manuelle uniquement. | Rien : lien ouvert manuellement par l’analyste. | — · [privacy](https://soundcloud.com/pages/privacy) |

## email-intelligence

| Source | Accès | Mode par défaut | Clé | CORS | Vérifiée | Quotas connus | Données transmises | Documentation |
|---|---|---|---|---|---|---|---|---|
| [Gravatar Profiles API](https://gravatar.com/) | API (automatisée) | Manuel | non | yes | 2026-11-12 | Accès anonyme limité ; clé nécessaire pour un usage soutenu (non utilisée). | L’empreinte SHA-256 de l’adresse (pas l’adresse en clair), votre IP. | [docs](https://docs.gravatar.com/api/profiles/rest-api/) · [privacy](https://automattic.com/privacy/) |
| [Have I Been Pwned](https://haveibeenpwned.com/) | Lien manuel | Manuel | non | no | non vérifiée | Soumis aux conditions de la plateforme. Consultation manuelle uniquement. | Rien : lien ouvert manuellement par l’analyste. | — · [privacy](https://haveibeenpwned.com/Privacy) |

## search-engines

| Source | Accès | Mode par défaut | Clé | CORS | Vérifiée | Quotas connus | Données transmises | Documentation |
|---|---|---|---|---|---|---|---|---|
| [Google Search](https://www.google.com/) | Lien manuel | Manuel | non | no | non vérifiée | Soumis aux conditions de la plateforme. Consultation manuelle uniquement. | Rien : lien ouvert manuellement par l’analyste. | — · [privacy](https://policies.google.com/privacy) |
| [Bing](https://www.bing.com/) | Lien manuel | Manuel | non | no | non vérifiée | Soumis aux conditions de la plateforme. Consultation manuelle uniquement. | Rien : lien ouvert manuellement par l’analyste. | — · [privacy](https://privacy.microsoft.com/) |
| [DuckDuckGo](https://duckduckgo.com/) | Lien manuel | Manuel | non | no | non vérifiée | Soumis aux conditions de la plateforme. Consultation manuelle uniquement. | Rien : lien ouvert manuellement par l’analyste. | — · [privacy](https://duckduckgo.com/privacy) |
| [Yandex](https://yandex.com/) | Lien manuel | Manuel | non | no | non vérifiée | Soumis aux conditions de la plateforme. Consultation manuelle uniquement. | Rien : lien ouvert manuellement par l’analyste. | — |

## image-analysis

| Source | Accès | Mode par défaut | Clé | CORS | Vérifiée | Quotas connus | Données transmises | Documentation |
|---|---|---|---|---|---|---|---|---|
| [Reverse image search (Google Lens, Bing, Yandex, TinEye)](https://tineye.com/) | Lien manuel | Manuel | non | no | non vérifiée | Soumis aux conditions de la plateforme. Consultation manuelle uniquement. | Rien : lien ouvert manuellement par l’analyste. | — |
| [BLACKWATCH local analysis](https://github.com/intheShadowGP/BLACKWATCH-OSINT) | Local | Auto | non | n/a | 2026-11-12 | Aucun — limité par les ressources de votre appareil. | Rien ne quitte le navigateur. | — |

## Serveurs RDAP

Les requêtes RDAP de domaine suivent le fichier d’amorçage officiel de l’IANA (`https://data.iana.org/rdap/dns.json`). La liste des hôtes autorisés dans la CSP est un instantané de ce registre (`src/config/rdap-hosts.json`, régénéré par `node scripts/update-rdap-hosts.mjs`). Si un registre absent de l’instantané est désigné, BLACKWATCH ne le contacte pas : il propose ICANN Lookup en consultation manuelle.

## Ajouter une source

Voir [CONTRIBUTING.md](CONTRIBUTING.md#ajouter-une-source).

# Confidentialité — Controlled Privacy

**Principe : les données restent locales par défaut ; les recherches externes sont autorisées de manière contrôlée.**

## Ce que BLACKWATCH ne fait pas

- Pas de compte, pas d’authentification.
- Pas de traceur publicitaire, pas d’outil analytique, pas de télémétrie, pas de rapport d’erreur distant.
- Pas de synchronisation cloud. Aucune investigation, note, preuve ou image n’est envoyée automatiquement.
- Pas d’avatar ni d’image distante chargés depuis les plateformes interrogées (cela révélerait votre IP à leurs hôtes). Seules les tuiles OpenStreetMap sont chargées, et elles peuvent être désactivées.

## Ce qui quitte votre navigateur, et quand

Une requête n’est émise que si **toutes** ces conditions sont réunies :

1. Le commutateur général « Autoriser les requêtes externes » est actif.
2. La source n’est pas « Désactivée ». En mode « Manuel », elle n’est utilisée que sur un clic explicite.
3. Vous avez lancé l’action. Si l’option est active, une confirmation récapitule chaque source et les données transmises.

Seule **la valeur recherchée** est transmise, jamais l’investigation. Le fournisseur reçoit aussi, comme pour toute requête web, votre **adresse IP**, l’heure et l’**origine** du site (en-tête Referer, réduit à l’origine). Pour Gravatar, seule l’empreinte SHA-256 de l’adresse est envoyée.

Le panneau **Paramètres → Confidentialité** indique pour chaque source le fournisseur, les données envoyées, la finalité, les limites connues, la politique de confidentialité, le dernier statut et le mode. Le **journal des requêtes** (Automatisation) liste chaque requête sortante : source, hôte, valeur transmise, statut HTTP et durée.

## Stockage local

IndexedDB conserve investigations, entités, relations, notes, preuves (fichiers), chronologies, résultats, historiques, préférences et le journal des requêtes (5 000 entrées au plus).

- Ces données **ne sont pas chiffrées au repos** par BLACKWATCH.
- Le stockage peut être effacé par le navigateur en cas de manque d’espace, sauf si vous demandez la persistance (Paramètres → Données locales).
- Les sauvegardes peuvent être exportées en clair (JSON) ou chiffrées (AES-256-GCM, phrase de passe jamais stockée).
- **Supprimer toutes les données** efface définitivement chaque table, après une confirmation tapée.

## Mode local

Désactivez le commutateur général : aucune requête externe n’est plus possible. La carte n’affiche plus de fond, mais toutes les fonctions locales restent utilisables : analyse d’images, hash, graphe, chronologie, corrélation, rapports, imports et exports.

## Vos responsabilités

Les recherches OSINT portent souvent sur des personnes. Assurez-vous d’avoir une base légale (RGPD, art. 6), limitez la collecte au nécessaire et respectez les conditions d’utilisation des sources. Le mode démonstration n’utilise que des données fictives : domaines `example.*` (RFC 2606) et IP de documentation (RFC 5737/3849).

# Guide utilisateur / User guide

## 1. Premier lancement

Le tableau de bord propose deux points d’entrée :

- **Nouvelle investigation** : pour commencer une enquête réelle.
- **Charger la démo** : une investigation entièrement fictive, marquée DEMO, qui permet de découvrir les modules.

Les données réelles collectées ne sont jamais ajoutées à la démo.

## 2. Investigation active

Le sélecteur de l’en-tête définit l’**investigation active**. Les modules y ajoutent ce que vous retenez, élément par élément (bouton ⊕), avec la provenance : source, URL et date de collecte.

## 3. Rechercher

- **Barre globale** : saisissez un pseudonyme, un domaine, une IP, un e-mail, une URL, des coordonnées ou un mot-clé. Le type est détecté, les modules adaptés sont proposés et vous choisissez les sources avant de lancer.
- **Modules spécialisés** : chacun dispose d’une aide contextuelle, d’exemples cliquables et de validations de saisie.
- **Statuts** : Terminé, Partiel, Quota atteint, Indisponible, Non supporté, Action manuelle requise, Désactivé, Annulé. Une source peut être relancée seule. Un repli est tenté automatiquement s’il en existe un.
- **Sources manuelles** : ouvrez le lien officiel, puis cliquez sur **Consigner** pour enregistrer ce que vous avez constaté.
- **Exporter** les résultats en CSV ou JSON depuis chaque liste.

## 4. Qualifier l’information

| Niveau | Quand l’utiliser |
|---|---|
| Vérifié | Vous l’avez confirmé à partir d’une source identifiable (une source est exigée). |
| Source publique | Rapporté par une source publique, non confirmé indépendamment. |
| Corrélation | Issu d’un rapprochement de données (les suggestions acceptées démarrent ici). |
| Hypothèse | Supposition de travail. |
| Non vérifié | Information brute. |

L’onglet **Corrélations** d’une investigation propose des relations, doublons, incohérences et pistes. Rien n’est appliqué sans votre accord.

## 5. Analyser

- **Graphe** : ajoutez des entités, reliez-les (Maj+clic sur deux nœuds), filtrez, recherchez, exportez en PNG ou JSON.
- **Chronologie** : saisissez l’heure locale du fuseau d’observation ; elle est convertie en UTC. Distinguez survenance, publication, découverte et collecte.
- **GEOINT** : cliquez sur la carte ou saisissez des coordonnées, puis géocodez à l’envers, épinglez, ajoutez comme lieu ou associez à un événement.
- **Images** : glissez des fichiers. Tout est analysé localement, et **Ajouter à l’investigation** crée la preuve, le lieu GPS et l’événement de prise de vue.

## 6. Rapports et sauvegardes

- **Rapports** : choisissez les sections, le niveau de confiance global, la langue et le format (PDF, HTML, Markdown, JSON, CSV). Un aperçu est disponible. Pour le cyrillique, l’arabe ou le CJK, préférez HTML.
- **Sauvegardes** : export JSON par investigation ou global, chiffré si vous le souhaitez. L’import crée toujours une nouvelle copie.

## 7. Confidentialité

Paramètres → Confidentialité : commutateur général (mode local), mode par source (Auto, Manuel ou Désactivé), confirmation avant recherche, fond de carte. Le journal des requêtes se trouve dans Automatisation.

---

**English quick start.** Create an investigation and make it active. Search from the global bar or a module. Add the results you keep, which carry their provenance automatically. Qualify each item’s verification level. Link entities in the graph, build the timeline, then generate a report and export a backup. Everything stays in your browser; external lookups are controlled per source in Settings → Privacy.

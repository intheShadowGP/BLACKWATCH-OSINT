# Contribuer

## Mise en place

```bash
npm ci
```

```bash
npm run dev
```

```bash
npm run ci
```

```bash
npm run test:e2e
```

## Règles du projet

- **Aucune fonctionnalité simulée.** Pas de bouton décoratif, pas de résultat inventé, pas de donnée factice présentée comme réelle.
- **Aucun secret** dans le code, y compris dans les variables `VITE_*`, qui sont publiques.
- **Aucun accès réseau hors de `src/services/adapters/http.ts`** (un test le vérifie).
- **Aucun contournement** de CORS, d’authentification, d’anti-bot ou de quota. Pas de proxy public.
- Tout texte visible est traduit dans `src/i18n/fr.ts` et `src/i18n/en.ts` (le typage impose la parité des clés).
- Chaque fonctionnalité arrive avec ses tests.

## Ajouter une source

1. **Testez-la depuis un navigateur** (pas avec curl) : `fetch` depuis une page servie sur `localhost`, lecture de la réponse, y compris des cas 404 et 429.
2. Ajoutez une entrée dans `src/services/sources/catalog.ts` : accès, quotas, données transmises, finalité, hôtes, liens de confidentialité. Renseignez `lastVerified` avec la date du test réel.
3. Écrivez l’adaptateur (`src/services/adapters/*`) : il produit des résultats `mkResult(...)` au niveau `public-source` ou `unverified`, gère les cas « introuvable » sans les traiter comme des erreurs et n’utilise que `externalFetch`.
4. Enregistrez-le dans `registry.ts` et ajoutez des fixtures (réponses observées) dans `tests/integration/adapters-fixtures.test.ts`.
5. Régénérez la documentation :

   ```bash
   node scripts/gen-sources-doc.mjs
   ```

6. La CSP est mise à jour automatiquement à partir du catalogue. Le test de sécurité échoue si un hôte manque.

Une source qui ne remplit pas les conditions devient une source `link` (lien manuel).

## Mettre à jour les serveurs RDAP

```bash
node scripts/update-rdap-hosts.mjs
```

## Style

TypeScript strict, composants fonctionnels, Tailwind. Gardez les fonctions métier pures et testables (`services/*`), et l’UI dans `modules/*` et `components/*`.

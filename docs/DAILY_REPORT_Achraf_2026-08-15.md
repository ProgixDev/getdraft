# Daily Report — Achraf Benamrane

**Date :** 15/08/2026
**Développeur :** Achraf Benamrane

---

## ✅ Travail effectué

### 🏈 GetDraft — **Soumission de l'application au Google Play Store**

**Commits (17 aujourd'hui) :**

- `74ce76a` — feat(rankings) : **classement mondial** à côté des divisions par pays
- `7d1f833` — fix(draft board) : ne plus ouvrir les athlètes sur un onglet **Reçus vide**
- `9c39bdb` — feat(messages) : **une seule boîte de réception** pour les discussions de match et les DM
- `7af6fed` — feat(store) : **page web de suppression de compte** (exigence Google Play) + masquage du logo Mapbox
- `4b8838b` — chore(demo) : **12 athlètes de démonstration** pour que le deck du testeur Google tienne
- `88d2c95` — fix(globe) : **masquer réellement** le logo Mapbox
- `fa1cbc7` — fix(globe) : suppression des boutons **+ / −** du zoom
- `3a56b87` — fix(avatars) : **photos de profil visibles** + avatar dans l'en-tête du chat
- `f8d1362` — chore(about) : retrait de **Licences** et du **numéro de build**
- `4fb89a8` — feat(safety) : **signalement dans l'application** (utilisateurs, posts, commentaires, messages)
- `50a59ac`, `c02c10c` — docs(play) : audit de pré-soumission + textes de la fiche Play Store

**Fonctionnalités / améliorations :**

- **Classement mondial (World rankings).** Les classements ne couvraient que le Canada et les USA ; tous les autres pays tombaient dans une catégorie `OTHER` que l'application n'affichait jamais. Un athlète à Alger accumulait un Draft Score sans aucun classement où apparaître. Le classement se fait désormais **par sport, tous pays confondus** (migration 040), sans devoir créer une division par nouveau marché.
- **Signalement de contenu (exigence Google Play).** La politique UGC de Google impose « un système intégré de signalement **et** de blocage ». L'application avait le blocage mais **aucun signalement** — la moitié manquante, et celle qu'un examinateur regarde en premier pour une application dont le public inclut des 13-17 ans. Ajouté : table `reports`, endpoint `POST /reports`, et un sélecteur de motif accessible depuis **le profil, chaque post et le chat**.
- **Une seule boîte de réception.** L'application avait deux systèmes de messagerie dans deux onglets : les discussions de match d'un côté, les DM de l'autre (vide pour tout le monde). Un utilisateur répondait dans une discussion de match puis ouvrait l'onglet avec l'icône de chat et n'y trouvait rien. Les deux sont désormais fusionnés, triés par activité.
- **Page web de suppression de compte.** Google exige une page accessible **depuis un navigateur** (pour quelqu'un ayant déjà désinstallé). Elle n'existait pas. En ligne : `https://api.getdraft.net/api/account-deletion`.
- **12 athlètes de démonstration.** Le deck de l'examinateur Google faisait **2 cartes** — épuisé en moins d'une minute, se terminant sur « Vous avez tout vu ! », ce qui est la cause de rejet la plus probable pour ce produit. Répartis sur 8 sports et 11 pays, ce qui corrige **trois choses à la fois** : deck 2 → **17 cartes**, globe 5 → **17 points sur cinq continents**, et des classements réels au lieu de « #1 sur 1 » pour tout le monde.
- **Demandes client du jour :** logo Mapbox masqué, boutons de zoom retirés, ligne « build » et « Licences » retirées de À propos, photos de profil affichées, avatar dans l'en-tête du chat.
- **Audit complet de pré-soumission** exécuté **contre la production** (et non un build local) : parcours de l'examinateur, en-têtes de sécurité, limitation de débit, targetSdk 36, absence de raccourcis de développement, gestion des erreurs.

**Bugs corrigés :**

- **Photos de profil invisibles pour les vrais utilisateurs.** `users.avatar_url` n'était jamais relié aux photos téléversées. Les 16 comptes de démonstration semblaient corrects uniquement parce que le script de seed remplissait les deux colonnes ; **le premier vrai utilisateur à téléverser des photos s'affichait en silhouette grise partout**. Corrigé à la source.
- **Logo Mapbox — première correction inefficace.** Le CSS écrit perdait la cascade face à la règle `a.mapboxgl-ctrl-logo` de Mapbox (spécificité 0,1,1 contre 0,1,0). Le logo est resté visible dans l'AAB 34 alors que la modification était bien dans le code. Corrigé avec `!important` **et** suppression des nœuds en JS.
- **Déduplication des signalements défaillante.** La contrainte unique portait sur `target_id`, qui est `NULL` pour un signalement d'utilisateur — et en Postgres `NULL` n'égale jamais `NULL`. Une même personne aurait pu **inonder la file de modération**. Détecté par un test qui a signalé deux fois et reçu deux identifiants différents (migration 042).
- **Deck Discover vide côté athlète** : « Aucun draft reçu » affiché à un athlète que six recruteurs avaient drafté — l'onglet par défaut était le seul vide.

### 📋 Play Store

- **Fiche Play Store complétée** : nom, descriptions, icône, visuel, 6 captures d'écran.
- **Toutes les déclarations remplies** : politique de confidentialité, identifiants de connexion pour l'examinateur, publicités, classification du contenu, public cible, sécurité des données, applications gouvernementales, fonctionnalités financières, santé, identifiant publicitaire, catégorie.
- **Classification obtenue** : **Teen (ESRB)** / **PEGI 12** / **USK 12+**.
- **Compte examinateur préparé** : passé en plan `pro` pour que la déclaration « accès complet à toutes les fonctionnalités » soit **vraie**, et deck vérifié à 17 cartes juste avant la soumission.
- **AAB 1.0.0 (39)** téléversé et **envoyé en production** — 177 pays.

---

## 🚧 En cours

**Tâches actuelles :**

> - **Examen Google Play** en cours (quelques jours en général, souvent plus long pour une application avec un public mineur).

**Blocage sur ces tâches :**

> - Aucun de notre côté — l'application est entre les mains de Google.

---

## 🚧 Blocages

- **Crédit Prelude épuisé (client)** : **aucun vrai utilisateur ne peut s'inscrire par téléphone**. Le numéro sandbox de l'examinateur fonctionne, donc l'examen passera — mais les premiers vrais utilisateurs se heurteraient à un mur le jour du lancement. **À recharger avant le lancement public.**
- **`support@getdraft.net` non vérifié** : l'adresse figure désormais sur la fiche Play Store, la politique de confidentialité, les CGU et la page de suppression de compte. Le domaine est bien sur Google Workspace, mais personne n'a confirmé que cette boîte existe. **Un e-mail de test suffit à trancher.**
- **Webhooks Stripe et Didit** toujours dirigés vers l'ancien hébergement — à basculer vers `api.getdraft.net` avant les premiers vrais paiements.
- **Facturation Railway** à régler sous 29 jours (client).

---

## 💬 Message pour le client

> **GetDraft est soumis au Google Play Store.** ✅
>
> L'application est partie en examen aujourd'hui avec tout le nécessaire : fiche complète, captures d'écran, classification **Teen / PEGI 12**, et l'ensemble des déclarations de confidentialité et de sécurité exigées par Google.
>
> Trois ajouts importants ont été faits avant l'envoi. D'abord le **classement mondial** : jusqu'ici seuls le Canada et les USA avaient un classement, un athlète ailleurs dans le monde n'apparaissait nulle part. Ensuite le **signalement de contenu**, exigé par Google pour toute application accueillant des mineurs — nous avions le blocage mais pas le signalement. Enfin une **page de suppression de compte** accessible depuis un navigateur, également obligatoire.
>
> Un audit complet a été mené directement **sur l'environnement de production**, pas sur une version de test : parcours de l'examinateur, sécurité, performances, conformité. Tout est vert.
>
> **Deux points de votre côté avant l'ouverture au public :** le **crédit Prelude** est épuisé, ce qui empêche toute inscription par téléphone pour de vrais utilisateurs — l'examen de Google n'est pas affecté, mais nos premiers utilisateurs le seraient. Et il faudrait confirmer que **support@getdraft.net** reçoit bien les e-mails, car cette adresse figure maintenant sur la fiche publique et sur la page de suppression de compte.

---

## 📊 Suivi

| Indicateur                        | Valeur  |
| --------------------------------- | ------- |
| ⏱️ Heures travaillées             | `10` h  |
| 🖥️ Avancement Frontend            | `100` % |
| ⚙️ Avancement Backend             | `100` % |
| 🚀 Soumission Play Store          | `100` % |
| 🔍 Examen Google                  | En cours |
